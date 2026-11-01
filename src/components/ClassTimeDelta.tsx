import { normalizeFlag } from "@/lib/flags";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { DEFAULT_CLASS_COLORS as SHARED_CLASS_COLORS } from "@/lib/classes";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CHART_FONT, chip, segItem, segWrap, useChartTheme } from "@/components/event-ui";

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

const DEFAULT_CLASS_ORDER = ["GTP", "LMP2", "LMP3", "GTDPRO", "GTD", "GS", "TCR"];

const DEFAULT_CLASS_COLORS: Record<string, string> = SHARED_CLASS_COLORS;

const INDIVIDUAL_COLORS = [
  "#3b82f6","#ef4444","#22c55e","#f59e0b","#8b5cf6","#ec4899","#06b6d4",
  "#f97316","#14b8a6","#a855f7","#e11d48","#84cc16","#0ea5e9","#d946ef",
  "#facc15","#64748b","#fb923c","#4ade80","#38bdf8","#c084fc","#f472b6",
  "#2dd4bf","#fbbf24","#a3e635","#818cf8","#fb7185","#34d399","#fef08a",
];

const FLAG_COLORS: Record<string, string> = {
  GREEN: "rgba(34, 197, 94, 0.035)", YELLOW: "rgba(234, 179, 8, 0.12)",
  FCY: "rgba(251, 146, 60, 0.12)", RED: "rgba(239, 68, 68, 0.12)",
  SC: "rgba(251, 146, 60, 0.12)",
  VSC: "rgba(251, 191, 36, 0.12)", CAUTION: "rgba(234, 179, 8, 0.12)", CODE60: "rgba(124, 58, 237, 0.10)",
};

// ── Helpers ─────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Smallest step from `steps` that is >= raw (falls back to the largest) */
function niceStep(raw: number, steps: number[]): number {
  return steps.find((s) => s >= raw) ?? steps[steps.length - 1];
}

function formatDelta(d: number): string {
  if (Math.abs(d) < 60) return `${d}s`;
  if (d >= 3600) {
    const h = Math.floor(d / 3600);
    const mm = Math.round((d % 3600) / 60);
    return mm ? `${h}h${mm.toString().padStart(2, "0")}` : `${h}h`;
  }
  const m = Math.floor(d / 60);
  const s = Math.round(d % 60);
  return s ? `${m}m${s.toString().padStart(2, "0")}` : `${m}m`;
}

function shadeColor(hex: string, index: number, total: number): string {
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
  seasonClasses?: { class_name: string; color: string; sort_order: number }[];
}

export default function ClassTimeDelta({ sessionId, teamNameMap, isMulticlass, compact, seasonClasses }: ClassTimeDeltaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  // null = "All" view
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [deltaMode, setDeltaMode] = useState<"leader" | "interval">("leader");
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [yZoomRange, setYZoomRange] = useState<[number, number] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPx, setDragStartPx] = useState<{ x: number; y: number } | null>(null);
  const [dragEndPx, setDragEndPx] = useState<{ x: number; y: number } | null>(null);
  const theme = useChartTheme();

  // ── Data fetching ─────────────────────────────────────────────

  const { data: lapTimes = [], isLoading } = useQuery({
    queryKey: ["lap_times", sessionId],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      const allRows: LapTime[] = [];
      let offset = 0;
      let done = false;
      while (!done) {
        const { data } = await supabase
          .from("v2_lap_times" as any)
          .select("car_number, lap_number, elapsed")
          .eq("session_id", sessionId)
          .order("car_number")
          .order("elapsed", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        const rows = data || [];
        for (const r of rows) {
          allRows.push({
            car_number: (r as any).car_number,
            lap_number: (r as any).lap_number,
            elapsed: Number((r as any).elapsed),
          });
        }
        if (rows.length < PAGE_SIZE) done = true;
        else offset += PAGE_SIZE;
      }
      return allRows;
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

  const allClasses = useMemo(() => {
    const classes = new Set<string>();
    for (const [, m] of carMetaMap) if (m.className) classes.add(m.className);
    return Array.from(classes).sort((a, b) => {
      const ai = classOrder.indexOf(a);
      const aiU = ai === -1 ? classOrder.indexOf(a.toUpperCase()) : ai;
      const bi = classOrder.indexOf(b);
      const biU = bi === -1 ? classOrder.indexOf(b.toUpperCase()) : bi;
      return (aiU === -1 ? 999 : aiU) - (biU === -1 ? 999 : biU);
    });
  }, [carMetaMap, classOrder]);

  // "All" when selectedClass is null, otherwise filter to specific class
  const isAllView = selectedClass === null;
  const activeClass = !isAllView && selectedClass && allClasses.includes(selectedClass) ? selectedClass : null;

  // Group lap times by car, filter by class (or show all)
  const classLapData = useMemo(() => {
    const targetCars = new Set<string>();
    for (const [cn, m] of carMetaMap) {
      if (isAllView || m.className === activeClass) targetCars.add(cn);
    }
    const map = new Map<string, LapTime[]>();
    for (const lt of lapTimes) {
      if (!targetCars.has(lt.car_number)) continue;
      if (!map.has(lt.car_number)) map.set(lt.car_number, []);
      map.get(lt.car_number)!.push(lt);
    }
    return map;
  }, [lapTimes, carMetaMap, isAllView, activeClass]);

  // Compute delta series for each car
  const deltaSeries = useMemo(() => {
    if (classLapData.size === 0) return new Map<string, { elapsed: number; delta: number }[]>();

    const cars = Array.from(classLapData.keys()).sort((a, b) => {
      if (isAllView) {
        const pa = carMetaMap.get(a)?.position || 999;
        const pb = carMetaMap.get(b)?.position || 999;
        return pa - pb;
      }
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
      for (const cn of cars) result.set(cn, []);
      for (let lap = 1; lap <= maxLap; lap++) {
        // When in "All" view, leader = overall leader (min elapsed across ALL cars)
        // When in class view, leader = class leader
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
      for (const cn of cars) result.set(cn, []);
      for (let lap = 1; lap <= maxLap; lap++) {
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
  }, [classLapData, carMetaMap, deltaMode, isAllView]);

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

  const viewRange = zoomRange || timeRange;
  const viewDuration = viewRange[1] - viewRange[0] || 1;

  // Visible max delta for Y-axis (auto-scale using 90th percentile to avoid outliers)
  const autoMaxDelta = useMemo(() => {
    const visibleDeltas: number[] = [];
    for (const [, series] of deltaSeries) {
      for (const pt of series) {
        if (pt.elapsed >= viewRange[0] && pt.elapsed <= viewRange[1]) {
          visibleDeltas.push(pt.delta);
        }
      }
    }
    if (visibleDeltas.length === 0) return 5;
    visibleDeltas.sort((a, b) => a - b);
     const p95Index = Math.floor(visibleDeltas.length * 0.95);
    const p95 = visibleDeltas[Math.min(p95Index, visibleDeltas.length - 1)];
    return Math.max(p95 * 1.2, 5);
  }, [deltaSeries, viewRange]);

  const visMaxDelta = yZoomRange ? yZoomRange[1] : autoMaxDelta;
  const visMinDelta = yZoomRange ? yZoomRange[0] : 0;
  const deltaRange = visMaxDelta - visMinDelta || 1;

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

  // Reset zoom when class changes
  useEffect(() => {
    setZoomRange(null);
    setYZoomRange(null);
  }, [selectedClass]);

  // ── Color logic ───────────────────────────────────────────────

  const isSingleClass = allClasses.length <= 1;

  const getCarColor = useCallback((cn: string, index: number, totalInGroup: number) => {
    if (isSingleClass || !isAllView) {
      // Single-class series or specific class view: individual car colors
      return INDIVIDUAL_COLORS[index % INDIVIDUAL_COLORS.length];
    }
    // Multi-class "All" view: color by class with shading
    const meta = carMetaMap.get(cn);
    const cls = meta?.className || "";
    const baseColor = classColors[cls] || classColors[cls.toUpperCase()] || DEFAULT_CLASS_COLORS[cls.toUpperCase()] || "#6b7280";
    const classMembers = Array.from(carMetaMap.entries()).filter(([, m]) => m.className === cls);
    const idxInClass = classMembers.findIndex(([c]) => c === cn);
    return shadeColor(baseColor, idxInClass, classMembers.length);
  }, [isAllView, isSingleClass, carMetaMap, classColors]);

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

    const x = (elapsed: number) => MARGIN.left + ((elapsed - viewRange[0]) / viewDuration) * chartW;
    const y = (delta: number) => MARGIN.top + ((delta - visMinDelta) / deltaRange) * chartH;

    // ── Flag bands ──
    for (const seg of flagSegments) {
      const s = Number(seg.start_elapsed);
      const e = Number(seg.end_elapsed);
      if (e <= viewRange[0] || s >= viewRange[1]) continue;
      const x1 = Math.max(x(s), MARGIN.left);
      const x2 = Math.min(x(e), MARGIN.left + chartW);
      const color = FLAG_COLORS[normalizeFlag(seg.flag_state)] || "rgba(107, 114, 128, 0.05)";
      ctx.fillStyle = color;
      ctx.fillRect(x1, MARGIN.top, x2 - x1, chartH);
    }

    // ── Grid lines (Y axis) ──
    ctx.strokeStyle = theme.a("--muted-foreground", theme.dark ? 0.14 : 0.18);
    ctx.lineWidth = 1;
    const yTickInterval = niceStep(deltaRange / Math.max(3, Math.floor(chartH / 44)), [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200]);
    const firstYTick = Math.ceil(visMinDelta / yTickInterval) * yTickInterval;
    for (let d = firstYTick; d <= visMaxDelta; d += yTickInterval) {
      const yy = y(d);
      if (yy < MARGIN.top || yy > MARGIN.top + chartH) continue;
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, yy);
      ctx.lineTo(MARGIN.left + chartW, yy);
      ctx.stroke();
      if (!compact) {
        ctx.fillStyle = theme.muted;
        ctx.font = `10px ${CHART_FONT.mono}`;
        ctx.textAlign = "right";
        ctx.fillText(formatDelta(d), MARGIN.left - 6, yy + 3);
      }
    }

    // ── Time axis ticks (X) ──
    const tickInterval = niceStep(viewDuration / Math.max(2, Math.floor(chartW / 80)), [60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600]);
    const firstTick = Math.ceil(viewRange[0] / tickInterval) * tickInterval;
    ctx.fillStyle = theme.muted;
    ctx.font = `10px ${CHART_FONT.mono}`;
    ctx.textAlign = "center";
    for (let t = firstTick; t <= viewRange[1]; t += tickInterval) {
      const xx = x(t);
      if (xx < MARGIN.left || xx > MARGIN.left + chartW) continue;
      if (!compact) ctx.fillText(formatElapsed(t), xx, height - MARGIN.bottom + 14);
      ctx.strokeStyle = theme.a("--muted-foreground", theme.dark ? 0.1 : 0.14);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xx, MARGIN.top);
      ctx.lineTo(xx, MARGIN.top + chartH);
      ctx.stroke();
    }

    // ── Zero baseline ──
    if (visMinDelta <= 0 && visMaxDelta >= 0) {
      ctx.strokeStyle = theme.a("--muted-foreground", 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y(0));
      ctx.lineTo(MARGIN.left + chartW, y(0));
      ctx.stroke();
    }

    // ── Draw lines ──
    const cars = Array.from(deltaSeries.keys()).sort((a, b) => {
      if (isAllView) {
        return (carMetaMap.get(a)?.position || 999) - (carMetaMap.get(b)?.position || 999);
      }
      return (carMetaMap.get(a)?.classPosition || 999) - (carMetaMap.get(b)?.classPosition || 999);
    });

    for (let ci = 0; ci < cars.length; ci++) {
      const cn = cars[ci];
      const series = deltaSeries.get(cn)!;
      if (series.length < 2) continue;

      const color = getCarColor(cn, ci, cars.length);
      ctx.strokeStyle = color;
      ctx.lineWidth = ci === 0 ? 2 : 1.2;
      ctx.globalAlpha = ci === 0 ? 1 : 0.7;
      ctx.beginPath();
      let started = false;
      for (const pt of series) {
        if (pt.elapsed < viewRange[0] || pt.elapsed > viewRange[1]) continue;
        const clampedDelta = Math.max(visMinDelta, Math.min(pt.delta, visMaxDelta));
        const px = x(pt.elapsed);
        const py = y(clampedDelta);
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── Axis labels ──
    if (!compact) {
      ctx.fillStyle = theme.muted;
      ctx.font = `600 11px ${CHART_FONT.display}`;
      ctx.textAlign = "center";
      ctx.fillText("SESSION ELAPSED TIME", MARGIN.left + chartW / 2, height - 4);

      ctx.save();
      ctx.translate(12, MARGIN.top + chartH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(deltaMode === "leader" ? "GAP TO LEADER (S)" : "INTERVAL TO CAR AHEAD (S)", 0, 0);
      ctx.restore();
    }

    // ── Drag selection overlay (2D rectangle) ──
    if (isDragging && dragStartPx && dragEndPx) {
      const x1 = Math.min(dragStartPx.x, dragEndPx.x);
      const x2 = Math.max(dragStartPx.x, dragEndPx.x);
      const y1 = Math.min(dragStartPx.y, dragEndPx.y);
      const y2 = Math.max(dragStartPx.y, dragEndPx.y);
      ctx.fillStyle = theme.a("--primary", 0.12);
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.strokeStyle = theme.a("--primary", 0.6);
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }
  }, [deltaSeries, flagSegments, viewRange, viewDuration, compact, isDragging, dragStartPx, dragEndPx, isAllView, carMetaMap, deltaMode, MARGIN, getCarColor, visMinDelta, visMaxDelta, deltaRange, theme]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  useEffect(() => {
    const obs = new ResizeObserver(() => drawCanvas());
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [drawCanvas]);

  // ── Mouse handlers (2D drag-to-zoom) ──────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    setIsDragging(true);
    setDragStartPx({ x: relX, y: relY });
    setDragEndPx({ x: relX, y: relY });
  }, []);

  const lastMoveTime = useRef(0);
  const rafId = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    if (isDragging) {
      setDragEndPx({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setTooltip(null);
      return;
    }

    // Throttle tooltip to ~30fps
    const now = performance.now();
    if (now - lastMoveTime.current < 33) return;
    lastMoveTime.current = now;

    if (rafId.current) cancelAnimationFrame(rafId.current);
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;

    rafId.current = requestAnimationFrame(() => {
      const chartW = container.clientWidth - MARGIN.left - MARGIN.right;
      const height = compact ? 260 : 400;
      const chartH = height - MARGIN.top - MARGIN.bottom;

      if (relX < MARGIN.left || relX > MARGIN.left + chartW || relY < MARGIN.top || relY > MARGIN.top + chartH) {
        setTooltip(null);
        return;
      }

      const hoverElapsed = viewRange[0] + ((relX - MARGIN.left) / chartW) * viewDuration;
      const yScale = (d: number) => MARGIN.top + ((d - visMinDelta) / deltaRange) * chartH;

      let bestCar: string | null = null;
      let bestDist = Infinity;
      let bestDelta = 0;
      let bestElapsed = 0;

      for (const [cn, series] of deltaSeries) {
        let lo = 0, hi = series.length - 1;
        while (lo < hi - 1) {
          const mid = (lo + hi) >> 1;
          if (series[mid].elapsed <= hoverElapsed) lo = mid; else hi = mid;
        }
        for (const idx of [lo, hi]) {
          if (idx < 0 || idx >= series.length) continue;
          const pt = series[idx];
          const px = MARGIN.left + ((pt.elapsed - viewRange[0]) / viewDuration) * chartW;
          const py = yScale(Math.min(Math.max(pt.delta, visMinDelta), visMaxDelta));
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
    });
  }, [isDragging, deltaSeries, carMetaMap, viewRange, viewDuration, compact, deltaMode, MARGIN, visMinDelta, visMaxDelta, deltaRange]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && dragStartPx && dragEndPx) {
      const container = containerRef.current;
      if (container) {
        const chartW = container.clientWidth - MARGIN.left - MARGIN.right;
        const height = compact ? 260 : 400;
        const chartH = height - MARGIN.top - MARGIN.bottom;

        const px1 = Math.min(dragStartPx.x, dragEndPx.x);
        const px2 = Math.max(dragStartPx.x, dragEndPx.x);
        const py1 = Math.min(dragStartPx.y, dragEndPx.y);
        const py2 = Math.max(dragStartPx.y, dragEndPx.y);

        const xSpan = px2 - px1;
        const ySpan = py2 - py1;

        if (xSpan > 10 || ySpan > 10) {
          // X zoom
          if (xSpan > 10) {
            const e1 = viewRange[0] + ((px1 - MARGIN.left) / chartW) * viewDuration;
            const e2 = viewRange[0] + ((px2 - MARGIN.left) / chartW) * viewDuration;
            setZoomRange([Math.max(e1, timeRange[0]), Math.min(e2, timeRange[1])]);
          }
          // Y zoom
          if (ySpan > 10) {
            const d1 = visMinDelta + ((py1 - MARGIN.top) / chartH) * deltaRange;
            const d2 = visMinDelta + ((py2 - MARGIN.top) / chartH) * deltaRange;
            setYZoomRange([Math.max(0, Math.min(d1, d2)), Math.max(d1, d2)]);
          }
        }
      }
    }
    setIsDragging(false);
    setDragStartPx(null);
    setDragEndPx(null);
  }, [isDragging, dragStartPx, dragEndPx, viewRange, viewDuration, timeRange, MARGIN, compact, visMinDelta, deltaRange]);

  // ── Render ────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="p-4 text-xs text-muted-foreground">Loading lap data…</div>;
  }

  if (lapTimes.length === 0) {
    return <div className="p-4 text-xs text-muted-foreground">No lap timing data available for this session.</div>;
  }

  const leaderPresets =
    deltaMode === "leader"
      ? [
          { label: "Auto", max: null },
          { label: "30s", max: 30 },
          { label: "60s", max: 60 },
          { label: "3m", max: 180 },
          { label: "5m", max: 300 },
        ]
      : [
          { label: "Auto", max: null },
          { label: "5s", max: 5 },
          { label: "15s", max: 15 },
          { label: "30s", max: 30 },
          { label: "60s", max: 60 },
        ];

  return (
    <div className={compact ? "space-y-0" : "space-y-3"}>
      {/* Controls */}
      {!compact && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Class filter with "All" — hide if single class */}
            {allClasses.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setSelectedClass(null)} className={chip(isAllView)}>
                  All
                </button>
                {allClasses.map((cls) => {
                  const c = classColors[cls] || classColors[cls.toUpperCase()] || "#6b7280";
                  const active = cls === activeClass;
                  return (
                    <button
                      key={cls}
                      onClick={() => setSelectedClass(cls)}
                      className={chip(active)}
                      style={active ? { backgroundColor: c, borderColor: c, color: "#fff" } : undefined}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? "#fff" : c }} />
                      {cls}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Mode toggle */}
            <div className={`${segWrap} sm:ml-auto`}>
              <button onClick={() => setDeltaMode("leader")} className={segItem(deltaMode === "leader")}>
                Gap to leader
              </button>
              <button onClick={() => setDeltaMode("interval")} className={segItem(deltaMode === "interval")}>
                Interval
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Delta range presets */}
            <div className="flex min-w-0 max-w-full items-center gap-2">
              <span className="label-caps shrink-0">Δ range</span>
              <div className={segWrap}>
                {leaderPresets.map((p) => {
                  const isActive = p.max === null ? yZoomRange === null : !!(yZoomRange && yZoomRange[0] === 0 && yZoomRange[1] === p.max);
                  return (
                    <button key={p.label} onClick={() => setYZoomRange(p.max === null ? null : [0, p.max])} className={segItem(isActive)}>
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time zoom presets + reset */}
            <div className="flex min-w-0 max-w-full items-center gap-2">
              <span className="label-caps shrink-0">Window</span>
              <div className={segWrap}>
                {zoomPresets.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setZoomRange(p.range);
                    }}
                    className={segItem(
                      (p.range === null && zoomRange === null) || !!(p.range && zoomRange && p.range[0] === zoomRange[0] && p.range[1] === zoomRange[1]),
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {(zoomRange || yZoomRange) && (
                <button
                  onClick={() => {
                    setZoomRange(null);
                    setYZoomRange(null);
                  }}
                  className={chip(false)}
                >
                  Reset zoom
                </button>
              )}
            </div>
            <span className="hidden text-[11px] text-muted-foreground lg:inline">Drag on the chart to zoom</span>
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
            className="pointer-events-none absolute z-50 rounded-sm border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y - 10,
              maxWidth: 280,
            }}
          >
            {tooltip.lines.map((line, i) => (
              <div key={i} className={i === 0 ? "font-semibold text-foreground" : "num text-[11px] text-muted-foreground"}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      {!compact && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-3">
          {Array.from(deltaSeries.keys())
            .sort((a, b) => {
              if (isAllView) return (carMetaMap.get(a)?.position || 999) - (carMetaMap.get(b)?.position || 999);
              return (carMetaMap.get(a)?.classPosition || 999) - (carMetaMap.get(b)?.classPosition || 999);
            })
            .map((cn, i, arr) => {
              const meta = carMetaMap.get(cn);
              const color = getCarColor(cn, i, arr.length);
              return (
                <div key={cn} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <div className="h-0.5 w-3" style={{ backgroundColor: color }} />
                  <span className="num text-foreground">#{cn}</span>
                  {meta?.teamName && <span className="opacity-60">{meta.teamName.split(" ").slice(0, 2).join(" ")}</span>}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
