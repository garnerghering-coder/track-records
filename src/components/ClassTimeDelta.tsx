import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Types ───────────────────────────────────────────────────────────

interface LapTime {
  car_number: string;
  lap_number: number;
  elapsed: number;
}

interface FlagSegment {
  flag_state: string;
  start_elapsed: number;
  end_elapsed: number;
}

interface CarMeta {
  carNumber: string;
  className: string;
  teamName: string;
  position: number | null;
  classPosition: number | null;
}

// ── Constants ───────────────────────────────────────────────────────

const CLASS_ORDER = ["GTP", "LMP2", "LMP3", "GTDPRO", "GTD", "GS", "TCR"];

const CLASS_COLORS: Record<string, string> = {
  GTP: "#e63946", GTDPRO: "#457b9d", GTD: "#2a9d8f",
  LMP2: "#e9c46a", LMP3: "#f4a261", GS: "#264653", TCR: "#a855f7",
};

const FLAG_COLORS: Record<string, string> = {
  GREEN: "rgba(34, 197, 94, 0.08)", YELLOW: "rgba(234, 179, 8, 0.12)",
  FCY: "rgba(251, 146, 60, 0.12)", RED: "rgba(239, 68, 68, 0.12)",
  SC: "rgba(251, 146, 60, 0.12)",
};

// ── Helpers ─────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function shadeColor(hex: string, index: number, total: number): string {
  // Subtle shade variation within class color
  if (total <= 1) return hex;
  const factor = 0.7 + (0.6 * index) / Math.max(total - 1, 1);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v * factor)));
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}

// ── Component ───────────────────────────────────────────────────────

interface ClassTimeDeltaProps {
  sessionId: string;
  teamNameMap: Record<string, string>;
  isMulticlass?: boolean;
  compact?: boolean;
}

export default function ClassTimeDelta({ sessionId, teamNameMap, isMulticlass, compact }: ClassTimeDeltaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [deltaMode, setDeltaMode] = useState<"leader" | "interval">("leader");
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);

  // ── Data fetching ─────────────────────────────────────────────

  const { data: lapTimes = [], isLoading } = useQuery({
    queryKey: ["lap_times", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_lap_times" as any)
        .select("car_number, lap_number, elapsed")
        .eq("session_id", sessionId)
        .order("car_number")
        .order("elapsed", { ascending: true });
      return (data || []).map((r: any) => ({
        car_number: r.car_number,
        lap_number: r.lap_number,
        elapsed: Number(r.elapsed),
      })) as LapTime[];
    },
  });

  const { data: flagSegments = [] } = useQuery({
    queryKey: ["flag_segments_delta", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_flag_segments" as any)
        .select("*")
        .eq("session_id", sessionId)
        .order("start_elapsed", { ascending: true });
      return (data || []).map((s: any) => ({
        flag_state: s.flag_state,
        start_elapsed: Number(s.start_elapsed),
        end_elapsed: Number(s.end_elapsed),
      })) as FlagSegment[];
    },
  });

  const { data: raceResults = [] } = useQuery({
    queryKey: ["delta_results", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_race_results" as any)
        .select("car_number, position, team_id, extra_data, v2_teams(full_name)")
        .eq("session_id", sessionId)
        .order("position", { ascending: true });
      return (data || []) as any[];
    },
  });

  // ── Derived data ──────────────────────────────────────────────

  const carMetaMap = useMemo(() => {
    const map = new Map<string, CarMeta>();
    // Group by class to compute PIC
    const byClass: Record<string, any[]> = {};
    for (const r of raceResults) {
      const cls = r.extra_data?.Class || r.extra_data?.class || "";
      if (!byClass[cls]) byClass[cls] = [];
      byClass[cls].push(r);
    }
    for (const cls of Object.keys(byClass)) {
      byClass[cls].sort((a: any, b: any) => (a.position || 999) - (b.position || 999));
      byClass[cls].forEach((r: any, idx: number) => {
        const cn = r.car_number;
        if (!cn || map.has(cn)) return;
        map.set(cn, {
          carNumber: cn,
          className: cls,
          teamName: r.v2_teams?.full_name || teamNameMap[r.team_id] || "",
          position: r.position,
          classPosition: idx + 1,
        });
      });
    }
    return map;
  }, [raceResults, teamNameMap]);

  const allClasses = useMemo(() => {
    const classes = new Set<string>();
    for (const [, m] of carMetaMap) if (m.className) classes.add(m.className);
    return Array.from(classes).sort((a, b) => {
      const ai = CLASS_ORDER.indexOf(a.toUpperCase());
      const bi = CLASS_ORDER.indexOf(b.toUpperCase());
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [carMetaMap]);

  // Auto-select first class
  const activeClass = selectedClass && allClasses.includes(selectedClass) ? selectedClass : allClasses[0] || null;

  // Group lap times by car, filter to active class
  const classLapData = useMemo(() => {
    if (!activeClass) return new Map<string, LapTime[]>();
    const carsInClass = new Set<string>();
    for (const [cn, m] of carMetaMap) {
      if (m.className === activeClass) carsInClass.add(cn);
    }
    const map = new Map<string, LapTime[]>();
    for (const lt of lapTimes) {
      if (!carsInClass.has(lt.car_number)) continue;
      if (!map.has(lt.car_number)) map.set(lt.car_number, []);
      map.get(lt.car_number)!.push(lt);
    }
    return map;
  }, [lapTimes, carMetaMap, activeClass]);

  // Compute delta series for each car
  const deltaSeries = useMemo(() => {
    if (classLapData.size === 0) return new Map<string, { elapsed: number; delta: number }[]>();

    // Build a unified timeline: at each lap crossing for any car, compute all cars' elapsed
    // For "Gap to Leader": leader at each timestamp has delta=0, others = their_elapsed - leader_elapsed
    // For "Interval": gap to car immediately ahead in class position order at that timestamp

    // First, build interpolation functions per car
    const carElapsedFns = new Map<string, (t: number) => number | null>();
    const carTimeRanges = new Map<string, [number, number]>();

    for (const [cn, laps] of classLapData) {
      if (laps.length < 2) continue;
      carTimeRanges.set(cn, [laps[0].elapsed, laps[laps.length - 1].elapsed]);
      carElapsedFns.set(cn, (t: number) => {
        // Binary search for the two surrounding laps
        if (t <= laps[0].elapsed) return laps[0].elapsed;
        if (t >= laps[laps.length - 1].elapsed) return laps[laps.length - 1].elapsed;
        let lo = 0, hi = laps.length - 1;
        while (lo < hi - 1) {
          const mid = (lo + hi) >> 1;
          if (laps[mid].elapsed <= t) lo = mid; else hi = mid;
        }
        // Linear interpolation of "laps completed" as a progress metric
        const frac = (t - laps[lo].elapsed) / (laps[hi].elapsed - laps[lo].elapsed);
        return lo + frac; // fractional lap index
      });
    }

    // Collect all unique timestamps (lap crossings) across all cars in this class
    const allTimestamps = new Set<number>();
    for (const [, laps] of classLapData) {
      for (const l of laps) allTimestamps.add(l.elapsed);
    }
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    // For performance with large grids, sample every Nth timestamp
    const maxSamples = compact ? 500 : 2000;
    let sampledTimestamps = sortedTimestamps;
    if (sortedTimestamps.length > maxSamples) {
      const step = Math.ceil(sortedTimestamps.length / maxSamples);
      sampledTimestamps = sortedTimestamps.filter((_, i) => i % step === 0);
      // Always include first and last
      if (sampledTimestamps[sampledTimestamps.length - 1] !== sortedTimestamps[sortedTimestamps.length - 1]) {
        sampledTimestamps.push(sortedTimestamps[sortedTimestamps.length - 1]);
      }
    }

    // At each timestamp, compute each car's cumulative elapsed time (directly from their lap data)
    // The "time delta" is simply: car_elapsed_at_this_lap - leader_elapsed_at_same_lap_count
    // But we need a different approach: for a given session time T, each car has completed
    // a certain elapsed time. The leader is the car with the most elapsed at time T.
    // Actually, for gap-to-leader, we compute: for each car's lap completion time,
    // what's the time difference between this car and the class leader at the same "distance" (lap count).

    // Simpler approach: use lap-indexed deltas
    // For each car, at lap N, the elapsed time is known.
    // The class leader at lap N is the car with the minimum elapsed at lap N.
    // Delta = car_elapsed_at_lap_N - min_elapsed_at_lap_N

    const cars = Array.from(classLapData.keys()).sort((a, b) => {
      const pa = carMetaMap.get(a)?.classPosition || 999;
      const pb = carMetaMap.get(b)?.classPosition || 999;
      return pa - pb;
    });

    // Build lap-indexed elapsed maps
    const carLapElapsed = new Map<string, Map<number, number>>();
    let maxLap = 0;
    for (const cn of cars) {
      const laps = classLapData.get(cn)!;
      const lapMap = new Map<number, number>();
      for (const l of laps) {
        lapMap.set(l.lap_number, l.elapsed);
        if (l.lap_number > maxLap) maxLap = l.lap_number;
      }
      carLapElapsed.set(cn, lapMap);
    }

    const result = new Map<string, { elapsed: number; delta: number }[]>();

    if (deltaMode === "leader") {
      // For each lap, find the minimum elapsed (leader), compute delta for each car
      for (const cn of cars) result.set(cn, []);

      for (let lap = 1; lap <= maxLap; lap++) {
        let minElapsed = Infinity;
        for (const cn of cars) {
          const e = carLapElapsed.get(cn)?.get(lap);
          if (e != null && e < minElapsed) minElapsed = e;
        }
        if (!isFinite(minElapsed)) continue;

        for (const cn of cars) {
          const e = carLapElapsed.get(cn)?.get(lap);
          if (e == null) continue;
          result.get(cn)!.push({ elapsed: e, delta: e - minElapsed });
        }
      }
    } else {
      // Interval mode: gap to car immediately ahead at each lap
      for (const cn of cars) result.set(cn, []);

      for (let lap = 1; lap <= maxLap; lap++) {
        // Get all cars that completed this lap, sorted by elapsed (fastest = ahead)
        const atLap: { cn: string; elapsed: number }[] = [];
        for (const cn of cars) {
          const e = carLapElapsed.get(cn)?.get(lap);
          if (e != null) atLap.push({ cn, elapsed: e });
        }
        atLap.sort((a, b) => a.elapsed - b.elapsed);

        for (let i = 0; i < atLap.length; i++) {
          const delta = i === 0 ? 0 : atLap[i].elapsed - atLap[i - 1].elapsed;
          result.get(atLap[i].cn)!.push({ elapsed: atLap[i].elapsed, delta });
        }
      }
    }

    return result;
  }, [classLapData, carMetaMap, deltaMode, compact]);

  // Time range
  const timeRange = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const [, series] of deltaSeries) {
      for (const pt of series) {
        if (pt.elapsed < min) min = pt.elapsed;
        if (pt.elapsed > max) max = pt.elapsed;
      }
    }
    if (!isFinite(min)) { min = 0; max = 3600; }
    return [min, max] as [number, number];
  }, [deltaSeries]);

  // Max delta for Y axis
  const maxDelta = useMemo(() => {
    let max = 0;
    for (const [, series] of deltaSeries) {
      for (const pt of series) {
        if (pt.delta > max) max = pt.delta;
      }
    }
    return Math.max(max, 10); // minimum 10s range
  }, [deltaSeries]);

  const viewRange = zoomRange || timeRange;
  const viewDuration = viewRange[1] - viewRange[0] || 1;

  // Zoom presets
  const totalDurationH = Math.ceil((timeRange[1] - timeRange[0]) / 3600);
  const zoomPresets = useMemo(() => {
    const presets: { label: string; range: [number, number] | null }[] = [
      { label: "Full Race", range: null },
    ];
    if (totalDurationH > 6) {
      for (let i = 0; i < totalDurationH; i += 6) {
        const end = Math.min(i + 6, totalDurationH);
        presets.push({ label: `${i}–${end}h`, range: [timeRange[0] + i * 3600, timeRange[0] + end * 3600] });
      }
    }
    if (totalDurationH > 1) {
      presets.push({ label: "Last 30m", range: [timeRange[1] - 1800, timeRange[1]] });
    }
    return presets;
  }, [totalDurationH, timeRange]);

  // ── Canvas rendering ──────────────────────────────────────────

  const MARGIN = { top: compact ? 10 : 30, right: compact ? 10 : 50, bottom: compact ? 20 : 40, left: compact ? 30 : 60 };

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = compact ? 260 : 400;
    const chartW = width - MARGIN.left - MARGIN.right;
    const chartH = height - MARGIN.top - MARGIN.bottom;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Visible delta range: auto-scale Y to visible data
    let visMaxDelta = 0;
    for (const [, series] of deltaSeries) {
      for (const pt of series) {
        if (pt.elapsed >= viewRange[0] && pt.elapsed <= viewRange[1]) {
          if (pt.delta > visMaxDelta) visMaxDelta = pt.delta;
        }
      }
    }
    visMaxDelta = Math.max(visMaxDelta * 1.1, 5); // 10% padding, min 5s

    const x = (elapsed: number) => MARGIN.left + ((elapsed - viewRange[0]) / viewDuration) * chartW;
    const y = (delta: number) => MARGIN.top + (delta / visMaxDelta) * chartH;

    // ── Flag bands ──
    for (const seg of flagSegments) {
      const s = Number(seg.start_elapsed);
      const e = Number(seg.end_elapsed);
      if (e <= viewRange[0] || s >= viewRange[1]) continue;
      const x1 = Math.max(x(s), MARGIN.left);
      const x2 = Math.min(x(e), MARGIN.left + chartW);
      const color = FLAG_COLORS[seg.flag_state] || "rgba(107, 114, 128, 0.05)";
      ctx.fillStyle = color;
      ctx.fillRect(x1, MARGIN.top, x2 - x1, chartH);
    }

    // ── Grid lines (Y axis) ──
    ctx.strokeStyle = "rgba(107, 114, 128, 0.15)";
    ctx.lineWidth = 0.5;
    const yTickInterval = visMaxDelta > 300 ? 60 : visMaxDelta > 60 ? 10 : visMaxDelta > 20 ? 5 : 1;
    for (let d = 0; d <= visMaxDelta; d += yTickInterval) {
      const yy = y(d);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, yy);
      ctx.lineTo(MARGIN.left + chartW, yy);
      ctx.stroke();
      if (!compact) {
        ctx.fillStyle = "#6b7280";
        ctx.font = "9px system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`${d}s`, MARGIN.left - 6, yy + 3);
      }
    }

    // ── Time axis ticks (X) ──
    const tickInterval = viewDuration > 14400 ? 3600 : viewDuration > 3600 ? 1800 : viewDuration > 600 ? 300 : 60;
    const firstTick = Math.ceil(viewRange[0] / tickInterval) * tickInterval;
    ctx.fillStyle = "#6b7280";
    ctx.font = "9px system-ui, sans-serif";
    ctx.textAlign = "center";
    for (let t = firstTick; t <= viewRange[1]; t += tickInterval) {
      const xx = x(t);
      if (xx < MARGIN.left || xx > MARGIN.left + chartW) continue;
      if (!compact) ctx.fillText(formatElapsed(t), xx, height - MARGIN.bottom + 14);
      ctx.strokeStyle = "rgba(107, 114, 128, 0.1)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(xx, MARGIN.top);
      ctx.lineTo(xx, MARGIN.top + chartH);
      ctx.stroke();
    }

    // ── Zero baseline ──
    ctx.strokeStyle = "rgba(107, 114, 128, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, y(0));
    ctx.lineTo(MARGIN.left + chartW, y(0));
    ctx.stroke();

    // ── Draw lines ──
    const cars = Array.from(deltaSeries.keys()).sort((a, b) => {
      const pa = carMetaMap.get(a)?.classPosition || 999;
      const pb = carMetaMap.get(b)?.classPosition || 999;
      return pa - pb;
    });
    const classColor = CLASS_COLORS[activeClass?.toUpperCase() || ""] || "#6b7280";

    for (let ci = 0; ci < cars.length; ci++) {
      const cn = cars[ci];
      const series = deltaSeries.get(cn)!;
      if (series.length < 2) continue;

      const color = shadeColor(classColor, ci, cars.length);
      ctx.strokeStyle = color;
      ctx.lineWidth = ci === 0 ? 2 : 1.2;
      ctx.globalAlpha = ci === 0 ? 1 : 0.7;
      ctx.beginPath();
      let started = false;
      for (const pt of series) {
        if (pt.elapsed < viewRange[0] || pt.elapsed > viewRange[1]) continue;
        const px = x(pt.elapsed);
        const py = y(Math.min(pt.delta, visMaxDelta));
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── Axis labels ──
    if (!compact) {
      ctx.fillStyle = "#9ca3af";
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Session Elapsed Time", MARGIN.left + chartW / 2, height - 4);

      ctx.save();
      ctx.translate(12, MARGIN.top + chartH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(deltaMode === "leader" ? "Gap to Class Leader (s)" : "Interval to Car Ahead (s)", 0, 0);
      ctx.restore();
    }

    // ── Drag selection overlay ──
    if (isDragging && dragStart != null && dragEnd != null) {
      const x1 = Math.min(dragStart, dragEnd);
      const x2 = Math.max(dragStart, dragEnd);
      ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
      ctx.fillRect(x1, MARGIN.top, x2 - x1, chartH);
      ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, MARGIN.top, x2 - x1, chartH);
    }
  }, [deltaSeries, flagSegments, viewRange, viewDuration, compact, isDragging, dragStart, dragEnd, activeClass, carMetaMap, deltaMode, MARGIN]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  useEffect(() => {
    const obs = new ResizeObserver(() => drawCanvas());
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [drawCanvas]);

  // ── Mouse handlers ────────────────────────────────────────────

  const pixelToElapsed = useCallback((px: number) => {
    const container = containerRef.current;
    if (!container) return viewRange[0];
    const rect = container.getBoundingClientRect();
    const relX = px - rect.left;
    const chartW = container.clientWidth - MARGIN.left - MARGIN.right;
    const frac = (relX - MARGIN.left) / chartW;
    return viewRange[0] + frac * viewDuration;
  }, [viewRange, viewDuration, MARGIN]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const elapsed = pixelToElapsed(e.clientX);
    setIsDragging(true);
    setDragStart(e.clientX - (containerRef.current?.getBoundingClientRect().left || 0));
    setDragEnd(e.clientX - (containerRef.current?.getBoundingClientRect().left || 0));
  }, [pixelToElapsed]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    if (isDragging) {
      setDragEnd(e.clientX - rect.left);
      setTooltip(null);
      return;
    }

    // Tooltip: find nearest line
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const chartW = container.clientWidth - MARGIN.left - MARGIN.right;
    const height = compact ? 260 : 400;
    const chartH = height - MARGIN.top - MARGIN.bottom;

    if (relX < MARGIN.left || relX > MARGIN.left + chartW || relY < MARGIN.top || relY > MARGIN.top + chartH) {
      setTooltip(null);
      return;
    }

    const hoverElapsed = viewRange[0] + ((relX - MARGIN.left) / chartW) * viewDuration;

    // Find closest car line at this elapsed
    let bestCar: string | null = null;
    let bestDist = Infinity;
    let bestDelta = 0;
    let bestElapsed = 0;

    let visMaxDelta = 0;
    for (const [, series] of deltaSeries) {
      for (const pt of series) {
        if (pt.elapsed >= viewRange[0] && pt.elapsed <= viewRange[1] && pt.delta > visMaxDelta) visMaxDelta = pt.delta;
      }
    }
    visMaxDelta = Math.max(visMaxDelta * 1.1, 5);

    const yScale = (d: number) => MARGIN.top + (d / visMaxDelta) * chartH;

    for (const [cn, series] of deltaSeries) {
      // Binary search for closest point
      let lo = 0, hi = series.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (series[mid].elapsed <= hoverElapsed) lo = mid; else hi = mid;
      }
      for (const idx of [lo, hi]) {
        if (idx < 0 || idx >= series.length) continue;
        const pt = series[idx];
        const px = MARGIN.left + ((pt.elapsed - viewRange[0]) / viewDuration) * chartW;
        const py = yScale(Math.min(pt.delta, visMaxDelta));
        const dist = Math.sqrt((relX - px) ** 2 + (relY - py) ** 2);
        if (dist < bestDist && dist < 30) {
          bestDist = dist;
          bestCar = cn;
          bestDelta = pt.delta;
          bestElapsed = pt.elapsed;
        }
      }
    }

    if (bestCar) {
      const meta = carMetaMap.get(bestCar);
      const lines = [
        `#${bestCar} ${meta?.teamName || ""}`,
        `Class: ${meta?.className || "?"} | P${meta?.position || "?"} | PIC ${meta?.classPosition || "?"}`,
        `${deltaMode === "leader" ? "Gap to Leader" : "Interval"}: ${bestDelta.toFixed(3)}s`,
        `Elapsed: ${formatElapsed(bestElapsed)}`,
      ];
      setTooltip({ x: relX, y: relY, lines });
    } else {
      setTooltip(null);
    }
  }, [isDragging, deltaSeries, carMetaMap, viewRange, viewDuration, compact, deltaMode, MARGIN]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && dragStart != null && dragEnd != null) {
      const container = containerRef.current;
      if (container) {
        const chartW = container.clientWidth - MARGIN.left - MARGIN.right;
        const x1 = Math.min(dragStart, dragEnd);
        const x2 = Math.max(dragStart, dragEnd);
        if (x2 - x1 > 10) {
          const e1 = viewRange[0] + ((x1 - MARGIN.left) / chartW) * viewDuration;
          const e2 = viewRange[0] + ((x2 - MARGIN.left) / chartW) * viewDuration;
          setZoomRange([Math.max(e1, timeRange[0]), Math.min(e2, timeRange[1])]);
        }
      }
    }
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, viewRange, viewDuration, timeRange, MARGIN]);

  // ── Render ────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="text-xs text-muted-foreground p-4">Loading lap data…</div>;
  }

  if (lapTimes.length === 0) {
    return <div className="text-xs text-muted-foreground p-4">No lap timing data available for this session.</div>;
  }

  return (
    <div className="space-y-2">
      {/* Controls */}
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Class filter */}
          <div className="flex gap-1">
            {allClasses.map(cls => (
              <button
                key={cls}
                onClick={() => setSelectedClass(cls)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-all ${
                  cls === activeClass
                    ? "border-primary/30 text-primary bg-primary/10"
                    : "border-border text-muted-foreground bg-muted/50 hover:text-foreground"
                }`}
                style={cls === activeClass ? { borderColor: CLASS_COLORS[cls.toUpperCase()] + "60", color: CLASS_COLORS[cls.toUpperCase()] } : {}}
              >
                {cls}
              </button>
            ))}
          </div>

          {/* Mode toggle */}
          <div className="flex border border-border rounded overflow-hidden ml-auto">
            <button
              onClick={() => setDeltaMode("leader")}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                deltaMode === "leader" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Gap to Leader
            </button>
            <button
              onClick={() => setDeltaMode("interval")}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                deltaMode === "interval" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Interval
            </button>
          </div>

          {/* Zoom presets */}
          <div className="flex gap-1">
            {zoomPresets.map((p, i) => (
              <button
                key={i}
                onClick={() => setZoomRange(p.range)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
                  (p.range === null && zoomRange === null) || (p.range && zoomRange && p.range[0] === zoomRange[0] && p.range[1] === zoomRange[1])
                    ? "border-primary/30 text-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative select-none cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); setTooltip(null); }}
      >
        <canvas ref={canvasRef} />

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-50 pointer-events-none rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y - 10,
              maxWidth: 280,
            }}
          >
            {tooltip.lines.map((line, i) => (
              <div key={i} className={i === 0 ? "font-medium text-foreground" : "text-muted-foreground"}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend (non-compact) */}
      {!compact && activeClass && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-1">
          {Array.from(deltaSeries.keys())
            .sort((a, b) => (carMetaMap.get(a)?.classPosition || 999) - (carMetaMap.get(b)?.classPosition || 999))
            .map((cn, i, arr) => {
              const meta = carMetaMap.get(cn);
              const color = shadeColor(CLASS_COLORS[activeClass.toUpperCase()] || "#6b7280", i, arr.length);
              return (
                <div key={cn} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: color }} />
                  <span>#{cn}</span>
                  {meta?.teamName && <span className="opacity-60">{meta.teamName.split(" ").slice(0, 2).join(" ")}</span>}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
