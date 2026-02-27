import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import {
  fetchAllLapTimes,
  computeStandingsAtTime,
  generateSampleTimestamps,
  formatElapsedLabel,
  getTickIntervalSeconds,
  type LapTimeRow,
} from "@/lib/lap-position-calc";

// ── Types ────────────────────────────────────────────────────────────

interface HourSession {
  id: string;
  name: string;
  sort_order: number;
}

interface CarHourPoint {
  hour: number;
  hourLabel: string;
  position: number | null;
  classPosition: string | null;
  className: string | null;
  driverName: string | null;
  teamName: string | null;
  carNumber: string;
  lapsCompleted: number | null;
}

interface CarTimeSeries {
  carNumber: string;
  className: string | null;
  teamName: string | null;
  points: CarHourPoint[];
  retired: boolean;
}

interface Props {
  hourSessions: HourSession[];
  teamNameMap: Record<string, string>;
  activeHourId?: string;
  isMulticlass?: boolean;
  compact?: boolean;
  parentSessionId?: string;
  seasonClasses?: { class_name: string; color: string; sort_order: number }[];
}

// ── Class colors (matching ClassTimeDelta) ────────────────────────────

const DEFAULT_CLASS_ORDER = ["GTP", "LMP2", "LMP3", "GTDPRO", "GTD", "GS", "TCR"];

const DEFAULT_CLASS_COLORS: Record<string, string> = {
  GTP: "#e63946", GTDPRO: "#457b9d", GTD: "#2a9d8f",
  LMP2: "#e9c46a", LMP3: "#f4a261", GS: "#264653", TCR: "#a855f7",
};

// ── Individual car color palette ─────────────────────────────────────

const INDIVIDUAL_COLORS = [
  "#3b82f6","#ef4444","#22c55e","#f59e0b","#8b5cf6","#ec4899","#06b6d4",
  "#f97316","#14b8a6","#a855f7","#e11d48","#84cc16","#0ea5e9","#d946ef",
  "#facc15","#64748b","#fb923c","#4ade80","#38bdf8","#c084fc","#f472b6",
  "#2dd4bf","#fbbf24","#a3e635","#818cf8","#fb7185","#34d399","#fef08a",
  "#67e8f9","#c4b5fd","#f9a8d4","#5eead4","#fdba74","#bef264","#93c5fd",
  "#fda4af","#6ee7b7","#fef08a","#a5f3fc","#ddd6fe","#fbcfe8","#99f6e4",
];

function shadeColor(hex: string, index: number, total: number): string {
  if (total <= 1) return hex;
  const factor = 0.7 + (0.6 * index) / Math.max(total - 1, 1);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v * factor)));
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}

// ── Component ────────────────────────────────────────────────────────

export default function PositionProgressionChart({
  hourSessions,
  teamNameMap,
  activeHourId,
  isMulticlass,
  compact,
  parentSessionId,
  seasonClasses,
}: Props) {
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [highlightedCar, setHighlightedCar] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"overall" | "class">("overall");
  const [hoveredCar, setHoveredCar] = useState<string | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Auto-switch to class position when filtering by class
  const isClassFiltered = selectedClasses.size > 0;
  useEffect(() => {
    if (isClassFiltered) {
      setViewMode("class");
    } else {
      setViewMode("overall");
    }
  }, [isClassFiltered]);

  // ── Class colors and order from season config ────────────────
  const classColors = useMemo(() => {
    const map: Record<string, string> = { ...DEFAULT_CLASS_COLORS };
    if (seasonClasses) {
      for (const sc of seasonClasses) map[sc.class_name] = sc.color;
    }
    return map;
  }, [seasonClasses]);

  const classOrder = useMemo(() => {
    if (seasonClasses && seasonClasses.length > 0) {
      return seasonClasses.map(sc => sc.class_name);
    }
    return DEFAULT_CLASS_ORDER;
  }, [seasonClasses]);

  const sortClassesFn = useCallback((a: string, b: string) => {
    const ai = classOrder.indexOf(a);
    const aiU = ai === -1 ? classOrder.indexOf(a.toUpperCase()) : ai;
    const bi = classOrder.indexOf(b);
    const biU = bi === -1 ? classOrder.indexOf(b.toUpperCase()) : bi;
    return (aiU === -1 ? 999 : aiU) - (biU === -1 ? 999 : biU);
  }, [classOrder]);

  // ── Check if lap data exists for continuous mode ─────────────
  const { data: lapTimeCount = 0 } = useQuery({
    queryKey: ["progression_lap_check", parentSessionId],
    queryFn: async () => {
      if (!parentSessionId) return 0;
      const { count } = await supabase
        .from("v2_lap_times" as any)
        .select("id", { count: "exact", head: true })
        .eq("session_id", parentSessionId);
      return count || 0;
    },
    enabled: !!parentSessionId,
  });

  const useContinuous = lapTimeCount > 0 && !!parentSessionId;

  // ── Continuous mode: fetch lap times ─────────────────────────
  const { data: lapTimes = [] } = useQuery({
    queryKey: ["progression_laps", parentSessionId],
    queryFn: () => fetchAllLapTimes(supabase, parentSessionId!),
    enabled: useContinuous,
  });

  // Fetch race results for metadata (class, team, etc.)
  const { data: raceResultsMeta = [] } = useQuery({
    queryKey: ["progression_meta", parentSessionId],
    queryFn: async () => {
      const allResults: any[] = [];
      let offset = 0;
      while (true) {
        const { data } = await supabase
          .from("v2_race_results" as any)
          .select("car_number, position, team_id, extra_data, v2_teams(id, full_name, short_name)")
          .eq("session_id", parentSessionId!)
          .order("position")
          .range(offset, offset + 999);
        const batch = (data || []) as any[];
        allResults.push(...batch);
        if (batch.length < 1000) break;
        offset += 1000;
      }
      const seen = new Set<string>();
      return allResults.filter((r: any) => {
        if (!r.car_number || seen.has(r.car_number)) return false;
        seen.add(r.car_number);
        return true;
      });
    },
    enabled: useContinuous,
  });

  // ── Continuous mode: compute positions at sampled timestamps ─
  const continuousData = useMemo(() => {
    if (!useContinuous || lapTimes.length === 0) return null;

    let minE = Infinity, maxE = -Infinity;
    for (const lt of lapTimes) {
      if (lt.elapsed < minE) minE = lt.elapsed;
      if (lt.elapsed > maxE) maxE = lt.elapsed;
    }
    if (!isFinite(minE)) return null;

    const carClassMap = new Map<string, string>();
    const carTeamMap = new Map<string, string>();
    for (const r of raceResultsMeta) {
      const cls = r.extra_data?.Class || r.extra_data?.class || "";
      if (cls) carClassMap.set(r.car_number, cls);
      const teamId = r.v2_teams?.id;
      const teamName = teamId && teamNameMap[teamId]
        ? teamNameMap[teamId]
        : r.v2_teams?.short_name || r.v2_teams?.full_name || "";
      if (teamName) carTeamMap.set(r.car_number, teamName);
    }

    const allClasses = Array.from(new Set(carClassMap.values())).sort(sortClassesFn);
    const allCarNumbers = Array.from(new Set(lapTimes.map(lt => lt.car_number))).sort((a, b) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    const timestamps = generateSampleTimestamps(minE, maxE, compact);

    const sortedByCarElapsed = [...lapTimes].sort((a, b) =>
      a.car_number === b.car_number ? a.elapsed - b.elapsed : a.car_number.localeCompare(b.car_number)
    );

    const carLapArrays = new Map<string, LapTimeRow[]>();
    for (const lt of sortedByCarElapsed) {
      if (!carLapArrays.has(lt.car_number)) carLapArrays.set(lt.car_number, []);
      carLapArrays.get(lt.car_number)!.push(lt);
    }

    const chartData: Record<string, any>[] = [];
    let maxPos = 0;

    const carPointers = new Map<string, number>();
    for (const cn of allCarNumbers) carPointers.set(cn, 0);

    for (const t of timestamps) {
      const point: Record<string, any> = { elapsed: t, elapsedLabel: formatElapsedLabel(t) };

      const standings: { cn: string; laps: number; elapsed: number }[] = [];
      for (const cn of allCarNumbers) {
        const laps = carLapArrays.get(cn);
        if (!laps || laps.length === 0) continue;
        let ptr = carPointers.get(cn)!;
        while (ptr < laps.length - 1 && laps[ptr + 1].elapsed <= t) ptr++;
        carPointers.set(cn, ptr);
        if (laps[ptr].elapsed <= t) {
          standings.push({ cn, laps: laps[ptr].lap_number, elapsed: laps[ptr].elapsed });
        }
      }

      standings.sort((a, b) => {
        if (b.laps !== a.laps) return b.laps - a.laps;
        return a.elapsed - b.elapsed;
      });

      const classCounters: Record<string, number> = {};
      standings.forEach((s, i) => {
        const pos = i + 1;
        if (pos > maxPos) maxPos = pos;
        const cls = carClassMap.get(s.cn) || "";
        if (!classCounters[cls]) classCounters[cls] = 0;
        classCounters[cls]++;
        point[`car_${s.cn}`] = pos;
        point[`pic_${s.cn}`] = classCounters[cls];
      });

      chartData.push(point);
    }

    const carSeriesInfo = allCarNumbers.map(cn => ({
      carNumber: cn,
      className: carClassMap.get(cn) || null,
      teamName: carTeamMap.get(cn) || null,
    }));

    return {
      chartData,
      maxPosition: maxPos,
      allClasses,
      allCarNumbers,
      carSeriesInfo,
      duration: maxE - minE,
      minElapsed: minE,
      maxElapsed: maxE,
      carClassMap,
    };
  }, [useContinuous, lapTimes, raceResultsMeta, teamNameMap, compact]);

  // ── Discrete mode: Fetch hour results ────────────────────────
  const hourIds = hourSessions.map((h) => h.id);
  const { data: allHourResults = [], isLoading } = useQuery({
    queryKey: ["position_progression", hourIds.join(",")],
    queryFn: async () => {
      if (hourIds.length === 0) return [];
      const allResults: any[] = [];
      const batchSize = 1000;
      let offset = 0;
      while (true) {
        const { data } = await supabase
          .from("v2_race_results" as any)
          .select(
            "session_id, car_number, position, driver_id, team_id, laps_completed, status, extra_data, v2_drivers(full_name), v2_teams(id, full_name, short_name)"
          )
          .in("session_id", hourIds)
          .order("position")
          .range(offset, offset + batchSize - 1);
        const batch = (data || []) as any[];
        allResults.push(...batch);
        if (batch.length < batchSize) break;
        offset += batchSize;
      }
      return allResults;
    },
    enabled: hourIds.length > 0 && !useContinuous,
  });

  // ── Discrete mode: Build per-car time series ─────────────────
  const { carSeries, allClasses: discreteClasses, allCarNumbers: discreteCarNumbers, discreteCarClassMap } = useMemo(() => {
    if (useContinuous || allHourResults.length === 0)
      return { carSeries: [], allClasses: [] as string[], allCarNumbers: [] as string[], discreteCarClassMap: new Map<string, string>() };

    const hourIndexMap: Record<string, number> = {};
    const hourLabelMap: Record<string, string> = {};
    hourSessions.forEach((h, i) => {
      hourIndexMap[h.id] = i + 1;
      hourLabelMap[h.id] = h.name;
    });

    const carMap = new Map<string, CarHourPoint[]>();
    const carTeamMap = new Map<string, string>();
    const carClassMap = new Map<string, string>();
    const classSet = new Set<string>();

    for (const r of allHourResults) {
      const cn = r.car_number;
      if (!cn) continue;
      const hour = hourIndexMap[r.session_id];
      if (!hour) continue;

      const cls = (r.extra_data as any)?.Class || null;
      if (cls) {
        classSet.add(cls);
        carClassMap.set(cn, cls);
      }

      const teamId = (r.v2_teams as any)?.id;
      const teamDisplay = teamId && teamNameMap[teamId]
        ? teamNameMap[teamId]
        : (r.v2_teams as any)?.short_name || (r.v2_teams as any)?.full_name || null;
      if (teamDisplay) carTeamMap.set(cn, teamDisplay);

      if (!carMap.has(cn)) carMap.set(cn, []);
      carMap.get(cn)!.push({
        hour,
        hourLabel: hourLabelMap[r.session_id] || `Hour ${hour}`,
        position: r.position,
        classPosition: (r.extra_data as any)?.PIC || null,
        className: cls,
        driverName: (r.v2_drivers as any)?.full_name || null,
        teamName: teamDisplay,
        carNumber: cn,
        lapsCompleted: r.laps_completed,
      });
    }

    const totalHours = hourSessions.length;
    const series: CarTimeSeries[] = [];
    const carNumbers: string[] = [];

    for (const [cn, points] of carMap.entries()) {
      points.sort((a, b) => a.hour - b.hour);
      carNumbers.push(cn);

      let retired = false;
      if (points.length > 0 && points[points.length - 1].hour < totalHours) {
        retired = true;
      } else if (points.length >= 2) {
        let lastProgressHour = 0;
        for (let i = 1; i < points.length; i++) {
          const prevLaps = points[i - 1].lapsCompleted;
          const currLaps = points[i].lapsCompleted;
          if (prevLaps !== null && currLaps !== null && currLaps > prevLaps) {
            lastProgressHour = i;
          }
        }
        if (lastProgressHour < points.length - 2) {
          const trimmedPoints = points.slice(0, lastProgressHour + 2);
          series.push({ carNumber: cn, className: carClassMap.get(cn) || null, teamName: carTeamMap.get(cn) || null, points: trimmedPoints, retired: true });
          continue;
        }
      }

      series.push({ carNumber: cn, className: carClassMap.get(cn) || null, teamName: carTeamMap.get(cn) || null, points, retired });
    }

    carNumbers.sort((a, b) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    const sortedClasses = Array.from(classSet).sort(sortClassesFn);

    return { carSeries: series, allClasses: sortedClasses, allCarNumbers: carNumbers, discreteCarClassMap: carClassMap };
  }, [useContinuous, allHourResults, hourSessions, teamNameMap]);

  // ── Unified data resolution ──────────────────────────────────

  const isContinuousMode = useContinuous && !!continuousData;

  const allClasses = isContinuousMode ? continuousData.allClasses : discreteClasses;
  const allCarNumbers = isContinuousMode ? continuousData.allCarNumbers : discreteCarNumbers;

  // Filter by class
  const filteredCarNumbers = useMemo(() => {
    if (selectedClasses.size === 0) return allCarNumbers;
    if (isContinuousMode) {
      return continuousData!.carSeriesInfo
        .filter(c => c.className && selectedClasses.has(c.className))
        .map(c => c.carNumber);
    }
    return carSeries
      .filter(c => c.className && selectedClasses.has(c.className))
      .map(c => c.carNumber);
  }, [selectedClasses, allCarNumbers, isContinuousMode, continuousData, carSeries]);

  const filteredSeries = useMemo(() => {
    if (useContinuous) return [];
    if (selectedClasses.size === 0) return carSeries;
    return carSeries.filter(c => c.className && selectedClasses.has(c.className));
  }, [carSeries, selectedClasses, useContinuous]);

  // ── Color logic ──────────────────────────────────────────────
  // All classes view: color by class. Single class view: individual car colors.

  const getCarColor = useCallback((carNumber: string, carsInView: string[]): string => {
    if (!isClassFiltered) {
      // All-classes view: color by class
      const cls = isContinuousMode
        ? continuousData?.carSeriesInfo.find(c => c.carNumber === carNumber)?.className
        : carSeries.find(c => c.carNumber === carNumber)?.className;
      const baseColor = classColors[cls || ""] || classColors[(cls || "").toUpperCase()] || DEFAULT_CLASS_COLORS[(cls || "").toUpperCase()] || "#6b7280";
      // Shade within class for differentiation
      const classMembers = carsInView.filter(cn => {
        const cnCls = isContinuousMode
          ? continuousData?.carSeriesInfo.find(c => c.carNumber === cn)?.className
          : carSeries.find(c => c.carNumber === cn)?.className;
        return (cnCls || "") === (cls || "");
      });
      const idx = classMembers.indexOf(carNumber);
      return shadeColor(baseColor, Math.max(0, idx), classMembers.length);
    } else {
      // Class-filtered: individual colors
      const idx = carsInView.indexOf(carNumber);
      return INDIVIDUAL_COLORS[Math.max(0, idx) % INDIVIDUAL_COLORS.length];
    }
  }, [isClassFiltered, isContinuousMode, continuousData, carSeries, classColors]);

  // Build chart data
  const { chartData, maxPosition } = useMemo(() => {
    if (isContinuousMode) {
      const posKey = viewMode === "class" ? "pic_" : "car_";
      let maxPos = 0;
      const data = continuousData!.chartData.map(pt => {
        const filtered: Record<string, any> = { elapsed: pt.elapsed, elapsedLabel: pt.elapsedLabel };
        for (const cn of filteredCarNumbers) {
          const val = pt[`${posKey}${cn}`];
          if (val != null) {
            filtered[`car_${cn}`] = val;
            if (val > maxPos) maxPos = val;
          }
        }
        return filtered;
      });
      return { chartData: data, maxPosition: maxPos };
    }

    // Discrete mode
    const totalHours = hourSessions.length;
    const data: Record<string, any>[] = [];
    let maxPos = 0;

    for (let h = 1; h <= totalHours; h++) {
      const point: Record<string, any> = { hour: h, hourLabel: hourSessions[h - 1]?.name || `Hour ${h}` };
      for (const car of filteredSeries) {
        const p = car.points.find((pt) => pt.hour === h);
        const posKey = `car_${car.carNumber}`;
        if (p && p.position !== null) {
          const val = viewMode === "class" && p.classPosition ? parseInt(p.classPosition, 10) : p.position;
          point[posKey] = val;
          if (val && val > maxPos) maxPos = val;
        }
      }
      data.push(point);
    }

    return { chartData: data, maxPosition: maxPos };
  }, [isContinuousMode, continuousData, filteredCarNumbers, filteredSeries, hourSessions, viewMode]);

  // Tooltip lookup (discrete mode only)
  const tooltipLookup = useMemo(() => {
    if (isContinuousMode) return {};
    const lookup: Record<number, Record<string, CarHourPoint>> = {};
    for (const car of filteredSeries) {
      for (const pt of car.points) {
        if (!lookup[pt.hour]) lookup[pt.hour] = {};
        lookup[pt.hour][car.carNumber] = pt;
      }
    }
    return lookup;
  }, [filteredSeries, isContinuousMode]);

  const toggleClass = useCallback((cls: string) => {
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      return next;
    });
  }, []);

  const activeHourIndex = activeHourId
    ? hourSessions.findIndex((h) => h.id === activeHourId) + 1
    : null;

  // X-axis tick formatting for continuous mode
  const tickInterval = isContinuousMode
    ? getTickIntervalSeconds(continuousData!.duration)
    : null;

  const xAxisTicks = useMemo(() => {
    if (!isContinuousMode || !continuousData) return undefined;
    const ticks: number[] = [];
    const start = Math.ceil(continuousData.minElapsed / tickInterval!) * tickInterval!;
    for (let t = start; t <= continuousData.maxElapsed; t += tickInterval!) {
      ticks.push(t);
    }
    return ticks;
  }, [isContinuousMode, continuousData, tickInterval]);

  if (isLoading && !useContinuous) return null;
  if (!isContinuousMode && filteredSeries.length === 0 && carSeries.length === 0) return null;
  if (isContinuousMode && chartData.length === 0) return null;

  const showClassFilter = allClasses.length > 1;
  const carsToRender = isContinuousMode ? filteredCarNumbers : filteredSeries.map(c => c.carNumber);
  const carInfoForLegend = isContinuousMode
    ? continuousData!.carSeriesInfo.filter(c => filteredCarNumbers.includes(c.carNumber))
    : filteredSeries.map(c => ({ carNumber: c.carNumber, className: c.className, teamName: c.teamName }));

  return (
    <div className={compact ? "h-full flex flex-col" : "rounded-lg border border-border bg-card p-4 space-y-4"}>
      {!compact && (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-card-foreground">Position Progression</h3>
        <div className="flex flex-wrap items-center gap-2">
          {showClassFilter && allClasses.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {allClasses.map((cls) => (
                <Badge
                  key={cls}
                  variant={selectedClasses.has(cls) ? "default" : "outline"}
                  className="cursor-pointer text-[10px] select-none"
                  onClick={() => toggleClass(cls)}
                >
                  {cls}
                </Badge>
              ))}
              {selectedClasses.size > 0 && (
                <Badge
                  variant="secondary"
                  className="cursor-pointer text-[10px] select-none"
                  onClick={() => setSelectedClasses(new Set())}
                >
                  Clear
                </Badge>
              )}
            </div>
          )}
          {showClassFilter && (
            <button
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                viewMode === "class"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setViewMode((v) => (v === "overall" ? "class" : "overall"))}
            >
              {viewMode === "class" ? "Class Pos" : "Overall Pos"}
            </button>
          )}
        </div>
      </div>
      )}

      <div
        ref={chartContainerRef}
        className={`w-full relative ${compact ? "flex-1" : ""}`}
        style={compact ? undefined : { height: Math.min(500, Math.max(300, (maxPosition || 10) * 16 + 60)) }}
        onMouseLeave={() => { setHoveredCar(null); setTooltipPos(null); }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: compact ? 25 : 10, bottom: 10, left: compact ? 5 : 50 }}
            onMouseMove={(state: any) => {
              if (!state || state.activeTooltipIndex == null || !state.chartX || !state.chartY) return;

              const containerEl = chartContainerRef.current;
              const containerH = containerEl?.clientHeight || 400;
              const plotTop = 10;
              const plotBottom = containerH - 40;
              const plotHeight = plotBottom - plotTop;
              const yFrac = Math.max(0, Math.min(1, (state.chartY - plotTop) / plotHeight));
              const mousePos = 1 + yFrac * ((maxPosition || 1) - 1);

              if (isContinuousMode) {
                const pt = chartData[state.activeTooltipIndex];
                if (!pt) return;
                let nearestCar: string | null = null;
                let nearestDist = Infinity;
                for (const cn of carsToRender) {
                  const pos = pt[`car_${cn}`];
                  if (pos == null) continue;
                  const dist = Math.abs(pos - mousePos);
                  if (dist < nearestDist) { nearestDist = dist; nearestCar = cn; }
                }
                if (nearestCar && nearestDist < 3) {
                  setHoveredCar(nearestCar);
                  setHoveredHour(state.activeTooltipIndex);
                  setTooltipPos({ x: state.chartX + 60, y: state.chartY });
                } else {
                  setHoveredCar(null); setTooltipPos(null);
                }
              } else {
                const hourIdx = state.activeTooltipIndex;
                const hour = hourIdx + 1;
                if (hour < 1 || hour > hourSessions.length) return;
                const hourData = tooltipLookup[hour] || {};
                let nearestCar: string | null = null;
                let nearestDist = Infinity;
                for (const cn of Object.keys(hourData)) {
                  const pt = hourData[cn];
                  const pos = viewMode === "class" && pt.classPosition ? parseInt(pt.classPosition, 10) : pt.position;
                  if (pos === null) continue;
                  const dist = Math.abs(pos - mousePos);
                  if (dist < nearestDist) { nearestDist = dist; nearestCar = cn; }
                }
                if (nearestCar && nearestDist < 3) {
                  setHoveredCar(nearestCar);
                  setHoveredHour(hour);
                  setTooltipPos({ x: state.chartX + 60, y: state.chartY });
                } else {
                  setHoveredCar(null); setTooltipPos(null);
                }
              }
            }}
            onMouseLeave={() => { setHoveredCar(null); setTooltipPos(null); }}
          >
            {isContinuousMode ? (
              <XAxis
                dataKey="elapsed"
                type="number"
                domain={[continuousData!.minElapsed, continuousData!.maxElapsed]}
                ticks={xAxisTicks}
                tickFormatter={(v: number) => formatElapsedLabel(v)}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
            ) : (
              <XAxis
                dataKey="hourLabel"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
            )}
            <YAxis
              reversed
              domain={[1, maxPosition || 1]}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
              allowDecimals={false}
              width={compact ? 25 : 50}
              {...(!compact && { label: { value: viewMode === "class" ? "Class Position" : "Position", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" } } })}
            />
            <Tooltip content={() => null} wrapperStyle={{ display: "none" }} />
            {!isContinuousMode && activeHourIndex && activeHourIndex > 0 && (
              <ReferenceLine
                x={hourSessions[activeHourIndex - 1]?.name}
                stroke="hsl(var(--primary))"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
            )}
            {carsToRender.map((cn) => {
              const isActive = hoveredCar === cn || highlightedCar === cn;
              const anyHighlight = hoveredCar || highlightedCar;
              return (
                <Line
                  key={cn}
                  type="linear"
                  dataKey={`car_${cn}`}
                  stroke={getCarColor(cn, carsToRender)}
                  strokeWidth={isActive ? 3 : 1.5}
                  strokeOpacity={anyHighlight ? (isActive ? 1 : 0.12) : 0.8}
                  dot={isContinuousMode ? false : {
                    r: isActive ? 3.5 : 2.5,
                    strokeWidth: 0,
                    fill: getCarColor(cn, carsToRender),
                    fillOpacity: anyHighlight ? (isActive ? 1 : 0.12) : 0.8,
                  }}
                  activeDot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>

        {/* Custom tooltip */}
        {hoveredCar && hoveredHour != null && tooltipPos && (() => {
          const containerWidth = chartContainerRef.current?.clientWidth || 600;
          const flipX = tooltipPos.x > containerWidth - 200;

          if (isContinuousMode) {
            const pt = chartData[hoveredHour];
            if (!pt) return null;
            const meta = continuousData!.carSeriesInfo.find(c => c.carNumber === hoveredCar);
            const pos = pt[`car_${hoveredCar}`];
            const pic = continuousData!.chartData[hoveredHour]?.[`pic_${hoveredCar}`];
            return (
              <div
                className="pointer-events-none absolute rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg space-y-1 max-w-[220px]"
                style={{ left: flipX ? tooltipPos.x - 180 : tooltipPos.x + 10, top: Math.max(10, tooltipPos.y - 40), zIndex: 50 }}
              >
                <div className="font-semibold text-popover-foreground">#{hoveredCar}</div>
                {meta?.teamName && <div className="text-muted-foreground">{meta.teamName}</div>}
                <div className="flex gap-3 text-popover-foreground">
                  {pos && <span>P{pos}</span>}
                  {meta?.className && <span>{meta.className}</span>}
                  {pic && <span>PIC {pic}</span>}
                </div>
                <div className="text-muted-foreground">{pt.elapsedLabel}</div>
              </div>
            );
          }

          // Discrete mode tooltip
          const hour = hoveredHour;
          const pt = tooltipLookup[hour]?.[hoveredCar];
          if (!pt) return null;
          return (
            <div
              className="pointer-events-none absolute rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg space-y-1 max-w-[220px]"
              style={{ left: flipX ? tooltipPos.x - 180 : tooltipPos.x + 10, top: Math.max(10, tooltipPos.y - 40), zIndex: 50 }}
            >
              <div className="font-semibold text-popover-foreground">#{pt.carNumber}</div>
              {pt.teamName && <div className="text-muted-foreground">{pt.teamName}</div>}
              {pt.driverName && <div className="text-muted-foreground">{pt.driverName}</div>}
              <div className="flex gap-3 text-popover-foreground">
                <span>P{pt.position}</span>
                {pt.className && <span>{pt.className}</span>}
                {pt.classPosition && <span>PIC {pt.classPosition}</span>}
              </div>
              <div className="text-muted-foreground">{pt.hourLabel}</div>
            </div>
          );
        })()}
      </div>

      {/* Car legend */}
      {!compact && (
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
        {carInfoForLegend.map((car) => (
          <button
            key={car.carNumber}
            className={`inline-flex items-center gap-1 transition-opacity ${
              (highlightedCar || hoveredCar) && highlightedCar !== car.carNumber && hoveredCar !== car.carNumber ? "opacity-30" : "opacity-100"
            }`}
            onMouseEnter={() => setHighlightedCar(car.carNumber)}
            onMouseLeave={() => setHighlightedCar(null)}
            onClick={() =>
              setHighlightedCar((prev) => (prev === car.carNumber ? null : car.carNumber))
            }
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: getCarColor(car.carNumber, carsToRender) }}
            />
            <span className="text-muted-foreground">
              #{car.carNumber}
              {car.teamName ? ` ${car.teamName}` : ""}
            </span>
          </button>
        ))}
      </div>
      )}
    </div>
  );
}
