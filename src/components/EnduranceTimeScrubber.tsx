import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import FlagImage from "@/components/FlagImage";
import { Link } from "react-router-dom";
import {
  fetchAllLapTimes,
  computeStandingsAtTime,
  formatElapsedLabel,
  type LapTimeRow,
} from "@/lib/lap-position-calc";

interface HourSession {
  id: string;
  name: string;
  sort_order: number;
}

interface EnduranceTimeScrubberProps {
  parentSessionId: string;
  hourSessions: HourSession[];
  teamNameMap: Record<string, string>;
  activeSubTab: string;
  setActiveSubTab: (v: string) => void;
  onCustomElapsed: (elapsed: number | null) => void;
  isMulticlass?: boolean;
}

export default function EnduranceTimeScrubber({
  parentSessionId,
  hourSessions,
  teamNameMap,
  activeSubTab,
  setActiveSubTab,
  onCustomElapsed,
  isMulticlass,
}: EnduranceTimeScrubberProps) {
  const [customElapsed, setCustomElapsed] = useState<number | null>(null);
  const [timeInput, setTimeInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if lap data exists
  const { data: lapTimeCount = 0 } = useQuery({
    queryKey: ["scrubber_lap_check", parentSessionId],
    queryFn: async () => {
      const { count } = await supabase
        .from("v2_lap_times" as any)
        .select("id", { count: "exact", head: true })
        .eq("session_id", parentSessionId);
      return count || 0;
    },
  });

  const hasLapData = lapTimeCount > 0;

  // Fetch lap times for computing custom standings
  const { data: lapTimes = [] } = useQuery({
    queryKey: ["scrubber_laps", parentSessionId],
    queryFn: () => fetchAllLapTimes(supabase, parentSessionId),
    enabled: hasLapData,
  });

  // Get race time range
  const timeRange = useMemo(() => {
    if (lapTimes.length === 0) return { min: 0, max: hourSessions.length * 3600 };
    let min = Infinity, max = -Infinity;
    for (const lt of lapTimes) {
      if (lt.elapsed < min) min = lt.elapsed;
      if (lt.elapsed > max) max = lt.elapsed;
    }
    return { min: isFinite(min) ? min : 0, max: isFinite(max) ? max : hourSessions.length * 3600 };
  }, [lapTimes, hourSessions]);

  // Fetch race results metadata for car info
  const { data: raceResultsMeta = [] } = useQuery({
    queryKey: ["scrubber_meta", parentSessionId],
    queryFn: async () => {
      const allResults: any[] = [];
      let offset = 0;
      while (true) {
        const { data } = await supabase
          .from("v2_race_results" as any)
          .select("car_number, position, team_id, driver_id, extra_data, v2_drivers(full_name, nationality), v2_teams(id, full_name, short_name), v2_cars(model_name, manufacturer)")
          .eq("session_id", parentSessionId)
          .order("position")
          .range(offset, offset + 999);
        const batch = (data || []) as any[];
        allResults.push(...batch);
        if (batch.length < 1000) break;
        offset += 1000;
      }
      // Dedupe by car_number, keeping all driver info
      const carMap = new Map<string, any>();
      for (const r of allResults) {
        if (!r.car_number) continue;
        if (!carMap.has(r.car_number)) {
          carMap.set(r.car_number, { ...r, _allDrivers: [] });
        }
        const entry = carMap.get(r.car_number)!;
        if (r.v2_drivers?.full_name) {
          entry._allDrivers.push({
            id: r.driver_id,
            name: r.v2_drivers.full_name,
            nationality: r.v2_drivers.nationality,
          });
        }
      }
      return Array.from(carMap.values());
    },
    enabled: hasLapData,
  });

  // Compute standings at custom elapsed time
  const customStandings = useMemo(() => {
    if (customElapsed == null || lapTimes.length === 0) return null;

    const standings = computeStandingsAtTime(lapTimes, customElapsed);

    // Enrich with metadata
    const metaMap = new Map<string, any>();
    for (const r of raceResultsMeta) {
      metaMap.set(r.car_number, r);
    }

    // Compute class positions
    const classCounters: Record<string, number> = {};

    return standings.map(s => {
      const meta = metaMap.get(s.carNumber);
      const cls = meta?.extra_data?.Class || meta?.extra_data?.class || "";
      if (!classCounters[cls]) classCounters[cls] = 0;
      classCounters[cls]++;

      const teamId = meta?.v2_teams?.id;
      const teamName = teamId && teamNameMap[teamId]
        ? teamNameMap[teamId]
        : meta?.v2_teams?.short_name || meta?.v2_teams?.full_name || "";

      return {
        ...s,
        className: cls,
        classPosition: classCounters[cls],
        teamName,
        teamId: meta?.team_id,
        drivers: meta?._allDrivers || [],
        car: meta?.v2_cars || null,
      };
    });
  }, [customElapsed, lapTimes, raceResultsMeta, teamNameMap]);

  // Build dropdown options
  const dropdownOptions = useMemo(() => {
    const options = [
      { value: "race-results", label: "Race Results (Final)" },
      ...hourSessions.map(hs => ({ value: hs.id, label: hs.name })),
    ];
    if (hasLapData) {
      options.push({ value: "custom", label: "Custom Time…" });
    }
    return options;
  }, [hourSessions, hasLapData]);

  // Handle dropdown change
  const handleDropdownChange = useCallback((value: string) => {
    if (value === "custom") {
      // Switch to custom mode with middle of race
      const mid = (timeRange.min + timeRange.max) / 2;
      setCustomElapsed(mid);
      setTimeInput(formatElapsedLabel(mid));
      onCustomElapsed(mid);
    } else {
      setCustomElapsed(null);
      setTimeInput("");
      setActiveSubTab(value);
      onCustomElapsed(null);
    }
  }, [setActiveSubTab, onCustomElapsed, timeRange]);

  // Handle slider change
  const handleSliderChange = useCallback((values: number[]) => {
    const elapsed = values[0];
    setCustomElapsed(elapsed);
    setTimeInput(formatElapsedLabel(elapsed));
    onCustomElapsed(elapsed);
  }, [onCustomElapsed]);

  // Handle time input
  const handleTimeInputSubmit = useCallback(() => {
    const parts = timeInput.split(":").map(Number);
    let seconds = 0;
    if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
    else if (parts.length === 1) seconds = parts[0];

    if (isNaN(seconds) || seconds < timeRange.min || seconds > timeRange.max) return;
    setCustomElapsed(seconds);
    onCustomElapsed(seconds);
  }, [timeInput, timeRange, onCustomElapsed]);

  // Determine current dropdown value
  const currentValue = customElapsed != null ? "custom" : activeSubTab;

  if (!hasLapData) {
    // No lap data: render simple sub-tab bar (existing behavior)
    const subTabs = [
      { id: "race-results", label: "Race Results" },
      ...hourSessions.map(hs => ({ id: hs.id, label: hs.name })),
    ];
    return (
      <div className="flex flex-wrap gap-1 p-1 bg-muted rounded-lg">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
              activeSubTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Top row: Dropdown + time controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={currentValue} onValueChange={handleDropdownChange}>
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dropdownOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {customElapsed != null && (
          <>
            <div className="flex-1 min-w-[200px] max-w-[500px]">
              <Slider
                value={[customElapsed]}
                min={timeRange.min}
                max={timeRange.max}
                step={60}
                onValueChange={handleSliderChange}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                ref={inputRef}
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                onBlur={handleTimeInputSubmit}
                onKeyDown={(e) => e.key === "Enter" && handleTimeInputSubmit()}
                className="w-[90px] h-8 text-xs font-mono text-center"
                placeholder="H:MM:SS"
              />
              <span className="text-[10px] text-muted-foreground">
                / {formatElapsedLabel(timeRange.max)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Quick hour buttons (always visible) */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => handleDropdownChange("race-results")}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
            activeSubTab === "race-results" && customElapsed == null
              ? "bg-background text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Final
        </button>
        {hourSessions.map(hs => (
          <button
            key={hs.id}
            onClick={() => handleDropdownChange(hs.id)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              activeSubTab === hs.id && customElapsed == null
                ? "bg-background text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {hs.name}
          </button>
        ))}
      </div>

      {/* Custom standings table */}
      {customElapsed != null && customStandings && (
        <div className="overflow-x-auto border border-border rounded-lg">
          <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-card-foreground">
              Standings at {formatElapsedLabel(customElapsed)}
            </h4>
            <Badge variant="outline" className="text-[10px]">Computed from lap data</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-12">Pos</TableHead>
                {isMulticlass && <TableHead className="w-12">PIC</TableHead>}
                {isMulticlass && <TableHead>Class</TableHead>}
                <TableHead className="w-14">No.</TableHead>
                <TableHead>Driver(s)</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-center">Laps</TableHead>
                <TableHead>Gap</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customStandings.map((s, i) => {
                const leaderLaps = customStandings[0]?.lapsCompleted || 0;
                const leaderElapsed = customStandings[0]?.elapsed || 0;
                let gap = "—";
                if (i > 0) {
                  const lapDiff = leaderLaps - s.lapsCompleted;
                  if (lapDiff > 0) {
                    gap = `+${lapDiff} ${lapDiff === 1 ? "Lap" : "Laps"}`;
                  } else {
                    const timeDiff = s.elapsed - leaderElapsed;
                    gap = `+${timeDiff.toFixed(3)}`;
                  }
                }
                return (
                  <TableRow key={s.carNumber} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                    <TableCell className="font-bold text-center">{s.position}</TableCell>
                    {isMulticlass && <TableCell className="text-xs">{s.classPosition}</TableCell>}
                    {isMulticlass && <TableCell className="text-xs">{s.className || "—"}</TableCell>}
                    <TableCell className="text-center font-mono text-xs">{s.carNumber}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">
                      {s.drivers.length === 0 ? "—" : (
                        <div className="flex flex-col">
                          {s.drivers.map((d: any, idx: number) => (
                            <span key={idx} className="leading-[22px] whitespace-nowrap">
                              {d.id ? (
                                <Link to={`/driver/${d.id}`} className="hover:text-primary transition-colors inline-flex items-center gap-1">
                                  <FlagImage nationality={d.nationality} size={14} />
                                  {d.name}
                                </Link>
                              ) : d.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {s.teamId ? (
                        <Link to={`/team/${s.teamId}`} className="hover:text-primary transition-colors">{s.teamName}</Link>
                      ) : s.teamName || "—"}
                    </TableCell>
                    <TableCell className="text-center text-xs">{s.lapsCompleted}</TableCell>
                    <TableCell className="font-mono text-xs">{i === 0 ? "Leader" : gap}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
