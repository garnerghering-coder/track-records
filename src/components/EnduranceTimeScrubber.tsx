import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import FlagImage from "@/components/FlagImage";
import WeatherBubble from "@/components/WeatherBubble";
import { Link } from "react-router-dom";
import {
  fetchAllLapTimes,
  computeStandingsAtTime,
  formatElapsedLabel,
  type LapTimeRow,
} from "@/lib/lap-position-calc";
import ComputedStandingsTable from "@/components/ComputedStandingsTable";

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
  weatherMap?: Record<string, any>;
  parentSession?: any;
  event?: any;
}

export default function EnduranceTimeScrubber({
  parentSessionId,
  hourSessions,
  teamNameMap,
  activeSubTab,
  setActiveSubTab,
  onCustomElapsed,
  isMulticlass,
  weatherMap,
  parentSession,
  event,
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

  // Fetch pit stops to determine which driver is in each car at a given time
  const { data: pitStops = [] } = useQuery({
    queryKey: ["scrubber_pitstops", parentSessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_pit_stops" as any)
        .select("car_number, driver_id, pit_in_elapsed, pit_out_elapsed")
        .eq("session_id", parentSessionId)
        .order("pit_in_elapsed");
      return (data || []) as unknown as { car_number: string; driver_id: string | null; pit_in_elapsed: number | null; pit_out_elapsed: number | null }[];
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

    // Build a lookup: for each car_number, find the driver at this elapsed time
    // using pit stop data. The driver who most recently pit_out before the elapsed time is current.
    const currentDriverMap = new Map<string, string | null>();
    if (pitStops.length > 0) {
      // Group pit stops by car_number
      const carPitStops = new Map<string, typeof pitStops>();
      for (const ps of pitStops) {
        if (!ps.car_number) continue;
        if (!carPitStops.has(ps.car_number)) carPitStops.set(ps.car_number, []);
        carPitStops.get(ps.car_number)!.push(ps);
      }
      for (const [carNum, stops] of carPitStops) {
        // Find the most recent pit_out before customElapsed
        let currentDriverId: string | null = null;
        for (const ps of stops) {
          if (ps.pit_out_elapsed != null && ps.pit_out_elapsed <= customElapsed && ps.driver_id) {
            currentDriverId = ps.driver_id;
          }
        }
        // If no pit_out found yet, also check if the first pit_in hasn't happened
        // meaning the starting driver is still in the car
        if (!currentDriverId && stops.length > 0) {
          const firstPitIn = stops[0].pit_in_elapsed;
          if (firstPitIn != null && customElapsed < firstPitIn && stops[0].driver_id) {
            currentDriverId = stops[0].driver_id;
          }
        }
        currentDriverMap.set(carNum, currentDriverId);
      }
    }

    // Compute class positions
    const classCounters: Record<string, number> = {};
    const classPrevCar: Record<string, { lapsCompleted: number; elapsed: number }> = {};

    return standings.map((s, i) => {
      const meta = metaMap.get(s.carNumber);
      const cls = meta?.extra_data?.Class || meta?.extra_data?.class || "";
      if (!classCounters[cls]) classCounters[cls] = 0;
      classCounters[cls]++;

      const teamId = meta?.v2_teams?.id;
      const teamName = teamId && teamNameMap[teamId]
        ? teamNameMap[teamId]
        : meta?.v2_teams?.short_name || meta?.v2_teams?.full_name || "";

      // Calculate interval to previous car in same class
      let interval = "";
      if (classCounters[cls] === 1) {
        interval = "";
      } else {
        const prev = classPrevCar[cls];
        if (prev) {
          const lapDiff = prev.lapsCompleted - s.lapsCompleted;
          if (lapDiff > 0) {
            interval = `+${lapDiff} ${lapDiff === 1 ? "Lap" : "Laps"}`;
          } else {
            const timeDiff = s.elapsed - prev.elapsed;
            interval = `+${timeDiff.toFixed(3)}`;
          }
        }
      }
      classPrevCar[cls] = { lapsCompleted: s.lapsCompleted, elapsed: s.elapsed };

      const car = meta?.v2_cars || null;
      const carLabel = car ? [car.manufacturer, car.model_name].filter(Boolean).join(" ") : "";

      // Determine current driver from pit stop data
      let currentDriver: { id: string | null; name: string; nationality: string | null } | null = null;
      const allDrivers = meta?._allDrivers || [];
      if (currentDriverMap.has(s.carNumber)) {
        const driverId = currentDriverMap.get(s.carNumber);
        if (driverId) {
          currentDriver = allDrivers.find((d: any) => d.id === driverId) || null;
        }
      }
      // If we couldn't determine from pit stops (no pit data for this car), 
      // fall back to first driver listed
      if (!currentDriver && allDrivers.length === 1) {
        currentDriver = allDrivers[0];
      }

      return {
        ...s,
        className: cls,
        classPosition: classCounters[cls],
        teamName,
        teamId: meta?.team_id,
        drivers: allDrivers,
        currentDriver,
        car,
        carLabel,
        interval,
      };
    });
  }, [customElapsed, lapTimes, raceResultsMeta, teamNameMap, pitStops]);

  // Generate virtual hour markers from lap data duration
  const virtualHours = useMemo(() => {
    if (!hasLapData || timeRange.max <= 0) return [];
    const totalHours = Math.ceil(timeRange.max / 3600);
    const hours: { value: string; label: string; elapsed: number }[] = [];
    for (let h = 1; h <= totalHours; h++) {
      const elapsed = h * 3600;
      if (elapsed <= timeRange.max) {
        hours.push({ value: `virtual-hour-${h}`, label: `Hour ${h}`, elapsed });
      }
    }
    return hours;
  }, [hasLapData, timeRange]);

  // Build dropdown options
  const dropdownOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [
      { value: "race-results", label: "Race Results (Final)" },
    ];
    if (hasLapData) {
      options.push({ value: "custom", label: "Custom Time…" });
      for (const vh of virtualHours) {
        options.push({ value: vh.value, label: vh.label });
      }
    } else {
      for (const hs of hourSessions) {
        options.push({ value: hs.id, label: hs.name });
      }
    }
    return options;
  }, [hourSessions, hasLapData, virtualHours]);

  // Handle dropdown change
  const handleDropdownChange = useCallback((value: string) => {
    if (value === "custom") {
      const mid = (timeRange.min + timeRange.max) / 2;
      setCustomElapsed(mid);
      setTimeInput(formatElapsedLabel(mid));
      onCustomElapsed(mid);
    } else if (value.startsWith("virtual-hour-")) {
      const vh = virtualHours.find(v => v.value === value);
      if (vh) {
        setCustomElapsed(vh.elapsed);
        setTimeInput(formatElapsedLabel(vh.elapsed));
        onCustomElapsed(vh.elapsed);
      }
    } else {
      setCustomElapsed(null);
      setTimeInput("");
      setActiveSubTab(value);
      onCustomElapsed(null);
    }
  }, [setActiveSubTab, onCustomElapsed, timeRange, virtualHours]);

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
  const matchedVirtualHour = customElapsed != null
    ? virtualHours.find(v => v.elapsed === customElapsed)
    : null;
  const currentValue = customElapsed != null
    ? (matchedVirtualHour ? matchedVirtualHour.value : "custom")
    : activeSubTab;

  // Time-specific weather: compute from hourly_data + start_time + elapsed
  const timeSpecificWeather = useMemo(() => {
    if (customElapsed == null) return null;
    const fullWeather = weatherMap?.[parentSessionId];
    if (!fullWeather?.hourly_data?.length) return fullWeather || null;

    const startTime = parentSession?.start_time || "12:00";
    const startH = parseInt(startTime.split(":")[0]);
    const startM = parseInt(startTime.split(":")[1] || "0");
    const startTotalMin = startH * 60 + startM;
    const elapsedMin = Math.floor(customElapsed / 60);
    const targetTotalMin = startTotalMin + elapsedMin;
    const targetHour = Math.floor(targetTotalMin / 60) % 24;

    // Find the hourly entry closest to targetHour
    const hourlyData = fullWeather.hourly_data as any[];
    let best = hourlyData[0];
    let bestDist = Infinity;
    for (const h of hourlyData) {
      const hHour = parseInt(h.time?.split("T")[1]?.split(":")[0] ?? "0");
      // Handle midnight wrap (e.g. target=2, entry=2 for next-day data)
      const dist = Math.min(
        Math.abs(hHour - targetHour),
        Math.abs(hHour - targetHour + 24),
        Math.abs(hHour - targetHour - 24)
      );
      if (dist < bestDist) { bestDist = dist; best = h; }
    }

    if (!best) return fullWeather;

    // Build a weather snapshot from that single hour
    const hour = parseInt(best.time?.split("T")[1]?.split(":")[0] ?? "12");
    const isNight = hour >= 20 || hour < 6;
    const isDusk = hour >= 18 && hour < 20;
    const isDawn = hour >= 6 && hour < 8;
    const code = best.weathercode ?? 0;

    // Simple emoji logic matching the edge function
    let emoji = "🌤️";
    if (code === 0) emoji = isNight ? "🌙" : isDusk ? "🌇" : isDawn ? "🌅" : "☀️";
    else if (code <= 3) emoji = isNight ? "🌙" : isDusk ? "🌇" : isDawn ? "🌅" : "🌤️";
    else if (code <= 48) emoji = "🌫️";
    else if (code <= 57) emoji = "🌧️";
    else if (code <= 67) emoji = "🌧️";
    else if (code <= 77) emoji = "🌨️";
    else if (code <= 86) emoji = "🌨️";
    else if (code >= 95) emoji = "⛈️";

    const descriptions: Record<number, string> = {
      0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    };
    const summary = descriptions[code] || (code <= 48 ? "Fog" : code <= 65 ? "Rain" : code <= 77 ? "Snow" : code >= 95 ? "Thunderstorm" : "Mixed");

    return {
      condition_summary: summary,
      condition_emoji: emoji,
      air_temp_min: best.temperature_2m != null ? Math.round(best.temperature_2m * 10) / 10 : null,
      air_temp_max: best.temperature_2m != null ? Math.round(best.temperature_2m * 10) / 10 : null,
      rain_mm: best.precipitation > 0 ? Math.round(best.precipitation * 10) / 10 : null,
      rain_detail: null,
      wind_summary: best.windspeed_10m != null ? `${Math.round(best.windspeed_10m)} km/h` : null,
      track_temp_min: null,
      track_temp_max: null,
    };
  }, [customElapsed, weatherMap, parentSessionId, parentSession]);

  // Time label for display
  const timeLabel = matchedVirtualHour
    ? matchedVirtualHour.label
    : customElapsed != null
      ? formatElapsedLabel(customElapsed)
      : null;

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

      {/* Fallback: quick hour buttons only when no lap data (legacy imported hours) */}
      {!hasLapData && hourSessions.length > 0 && (
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
      )}

      {/* Custom standings table */}
      {customElapsed != null && customStandings && (
        <ComputedStandingsTable
          standings={customStandings}
          timeLabel={timeLabel || formatElapsedLabel(customElapsed)}
          isMulticlass={isMulticlass}
          weather={timeSpecificWeather}
          event={event}
          parentSession={parentSession}
          teamNameMap={teamNameMap}
        />
      )}
    </div>
  );
}
