import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Types ───────────────────────────────────────────────────────────

interface FlagSegment {
  flag_state: string;
  start_elapsed: number;
  end_elapsed: number;
}

interface Stint {
  id: string;
  car_number: string;
  driver_id: string | null;
  start_elapsed: number;
  end_elapsed: number;
  start_lap: number | null;
  end_lap: number | null;
  driverName?: string;
}

interface PitStop {
  id: string;
  car_number: string;
  pit_in_elapsed: number;
  pit_out_elapsed: number | null;
  stop_duration: string | null;
  flag_status: string | null;
  lap_number: number | null;
}

interface CarInfo {
  carNumber: string;
  teamName: string;
  className: string;
  position: number | null;
}

interface HourPosition {
  carNumber: string;
  hourNumber: number;
  elapsed: number; // hour boundary in seconds
  position: number;
  gap: string | null;
}

// ── Constants ───────────────────────────────────────────────────────

const CLASS_ORDER: string[] = ["GTP", "LMP2", "LMP3", "GTDPRO", "GTD", "GS", "TCR"];

const CLASS_COLORS: Record<string, string> = {
  GTP: "#e63946",
  GTDPRO: "#457b9d",
  GTD: "#2a9d8f",
  LMP2: "#e9c46a",
  LMP3: "#f4a261",
  GS: "#264653",
  TCR: "#a855f7",
};

const FLAG_COLORS: Record<string, { bg: string; strip: string }> = {
  GREEN: { bg: "rgba(34, 197, 94, 0.06)", strip: "#22c55e" },
  YELLOW: { bg: "rgba(234, 179, 8, 0.10)", strip: "#eab308" },
  FCY: { bg: "rgba(251, 146, 60, 0.10)", strip: "#fb923c" },
  RED: { bg: "rgba(239, 68, 68, 0.10)", strip: "#ef4444" },
  SC: { bg: "rgba(251, 146, 60, 0.10)", strip: "#fb923c" },
};

const DEFAULT_CARS_PER_CLASS = 5;
const ROW_HEIGHT = 22;
const COMPARE_ROW_HEIGHT = 32;
const ROW_GAP = 2;
const HEADER_HEIGHT = 20;
const STRIP_HEIGHT = 18;
const TOP_MARGIN = 40;
const LABEL_WIDTH = 70;
const RIGHT_PAD = 16;

// ── Helpers ─────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getClassColor(cls: string): string {
  return CLASS_COLORS[cls.toUpperCase()] || "#6b7280";
}

/** Compute green-flag duration within a stint by intersecting with flag segments */
function computeGreenFlagDuration(stint: Stint, flagSegments: FlagSegment[]): number {
  let greenDuration = 0;
  for (const seg of flagSegments) {
    if (seg.flag_state !== "GREEN") continue;
    const s = Number(seg.start_elapsed);
    const e = Number(seg.end_elapsed);
    const overlapStart = Math.max(stint.start_elapsed, s);
    const overlapEnd = Math.min(stint.end_elapsed, e);
    if (overlapEnd > overlapStart) {
      greenDuration += overlapEnd - overlapStart;
    }
  }
  return greenDuration;
}

function formatLapTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  if (m > 0) return `${m}:${s.toFixed(1).padStart(4, "0")}`;
  return `${s.toFixed(1)}s`;
}

// ── Component ───────────────────────────────────────────────────────

interface StrategyTimelineProps {
  sessionId: string;
  teamNameMap: Record<string, string>;
  isMulticlass?: boolean;
  compact?: boolean;
}

export default function StrategyTimeline({ sessionId, teamNameMap, isMulticlass, compact }: StrategyTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string[] } | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [highlightedCar, setHighlightedCar] = useState<string | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareCars, setCompareCars] = useState<Set<string>>(new Set());
  const [showPositions, setShowPositions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Data fetching ──────────────────────────────────────────────

  const { data: flagSegments = [] } = useQuery({
    queryKey: ["flag_segments", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_flag_segments" as any)
        .select("*")
        .eq("session_id", sessionId)
        .order("start_elapsed", { ascending: true });
      return (data || []) as unknown as FlagSegment[];
    },
  });

  const { data: stints = [] } = useQuery({
    queryKey: ["strategy_stints_v2", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_stints" as any)
        .select("*, v2_drivers(full_name)")
        .eq("session_id", sessionId)
        .order("car_number")
        .order("start_elapsed", { ascending: true });
      return (data || []).map((s: any) => ({
        ...s,
        start_elapsed: Number(s.start_elapsed),
        end_elapsed: Number(s.end_elapsed),
        driverName: s.v2_drivers?.full_name || null,
      })) as Stint[];
    },
  });

  const { data: pitStops = [] } = useQuery({
    queryKey: ["strategy_pits_v2", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_pit_stops" as any)
        .select("*")
        .eq("session_id", sessionId)
        .order("car_number")
        .order("pit_in_elapsed", { ascending: true });
      return (data || []).map((p: any) => ({
        ...p,
        pit_in_elapsed: Number(p.pit_in_elapsed),
        pit_out_elapsed: p.pit_out_elapsed != null ? Number(p.pit_out_elapsed) : null,
      })) as PitStop[];
    },
  });

  // Fetch race results to get class, team, and position per car
  const { data: raceResults = [] } = useQuery({
    queryKey: ["strategy_results", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_race_results" as any)
        .select("car_number, position, team_id, extra_data, v2_teams(full_name)")
        .eq("session_id", sessionId)
        .order("position", { ascending: true });
      return (data || []) as any[];
    },
  });

  // Fetch hourly position data for position overlays
  const { data: hourPositions = [] } = useQuery({
    queryKey: ["strategy_hour_positions", sessionId],
    enabled: showPositions,
    queryFn: async () => {
      // Get hour sub-sessions
      const { data: hourSessions } = await supabase
        .from("v2_sessions" as any)
        .select("id, name")
        .eq("parent_session_id", sessionId)
        .order("name");
      if (!hourSessions || hourSessions.length === 0) return [];

      const positions: HourPosition[] = [];
      for (const hs of hourSessions as any[]) {
        const hourMatch = (hs.name as string).match(/Hour\s*(\d+)/i);
        if (!hourMatch) continue;
        const hourNum = parseInt(hourMatch[1]);

        const { data: results } = await supabase
          .from("v2_race_results" as any)
          .select("car_number, position, gap_to_leader")
          .eq("session_id", hs.id)
          .order("position", { ascending: true });

        if (results) {
          for (const r of results as any[]) {
            if (r.car_number && r.position != null) {
              positions.push({
                carNumber: r.car_number,
                hourNumber: hourNum,
                elapsed: hourNum * 3600,
                position: r.position,
                gap: r.gap_to_leader || null,
              });
            }
          }
        }
      }
      return positions;
    },
  });

  // ── Derived data ───────────────────────────────────────────────

  const carInfoMap = useMemo(() => {
    const map = new Map<string, CarInfo>();
    for (const r of raceResults) {
      const cn = r.car_number;
      if (!cn || map.has(cn)) continue;
      const cls = r.extra_data?.Class || r.extra_data?.class || "";
      const teamName = r.v2_teams?.full_name || teamNameMap[r.team_id] || "";
      map.set(cn, { carNumber: cn, teamName, className: cls, position: r.position });
    }
    return map;
  }, [raceResults, teamNameMap]);

  const allClasses = useMemo(() => {
    const classes = new Set<string>();
    for (const [, info] of carInfoMap) {
      if (info.className) classes.add(info.className);
    }
    return Array.from(classes).sort((a, b) => {
      const ai = CLASS_ORDER.indexOf(a.toUpperCase());
      const bi = CLASS_ORDER.indexOf(b.toUpperCase());
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [carInfoMap]);

  const effectiveClasses = selectedClasses.size > 0 ? selectedClasses : new Set(allClasses);

  // Group cars by class, sort by position
  const carsByClass = useMemo(() => {
    const groups: Record<string, CarInfo[]> = {};
    for (const [, info] of carInfoMap) {
      const cls = info.className || "Other";
      if (!effectiveClasses.has(cls)) continue;
      if (!groups[cls]) groups[cls] = [];
      groups[cls].push(info);
    }
    for (const cls of Object.keys(groups)) {
      groups[cls].sort((a, b) => (a.position || 999) - (b.position || 999));
    }
    return groups;
  }, [carInfoMap, effectiveClasses]);

  // Build position lookup: car_number -> hour -> position
  const positionLookup = useMemo(() => {
    const map = new Map<string, Map<number, HourPosition>>();
    for (const hp of hourPositions) {
      if (!map.has(hp.carNumber)) map.set(hp.carNumber, new Map());
      map.get(hp.carNumber)!.set(hp.hourNumber, hp);
    }
    return map;
  }, [hourPositions]);

  // Build visible cars list
  const visibleCars = useMemo(() => {
    const cars: CarInfo[] = [];

    if (compareMode && compareCars.size > 0) {
      // In compare mode, show only selected cars in class order
      for (const cls of allClasses.filter(c => effectiveClasses.has(c))) {
        const group = carsByClass[cls] || [];
        for (const car of group) {
          if (compareCars.has(car.carNumber)) cars.push(car);
        }
      }
      return cars;
    }

    for (const cls of allClasses.filter(c => effectiveClasses.has(c))) {
      const group = carsByClass[cls] || [];
      const isExpanded = expandedClasses.has(cls);
      const shown = isExpanded ? group : group.slice(0, DEFAULT_CARS_PER_CLASS);
      cars.push(...shown);
    }
    return cars;
  }, [allClasses, carsByClass, effectiveClasses, expandedClasses, compareMode, compareCars]);

  // Time range
  const timeRange = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const s of stints) {
      if (s.start_elapsed < min) min = s.start_elapsed;
      if (s.end_elapsed > max) max = s.end_elapsed;
    }
    for (const p of pitStops) {
      if (p.pit_in_elapsed < min) min = p.pit_in_elapsed;
      if (p.pit_out_elapsed != null && p.pit_out_elapsed > max) max = p.pit_out_elapsed;
    }
    for (const f of flagSegments) {
      if (Number(f.start_elapsed) < min) min = Number(f.start_elapsed);
      if (Number(f.end_elapsed) > max) max = Number(f.end_elapsed);
    }
    if (!isFinite(min)) min = 0;
    if (!isFinite(max)) max = 3600;
    return [min, max] as [number, number];
  }, [stints, pitStops, flagSegments]);

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

  // Filtered cars by search
  const searchFilteredCars = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    const matching = new Set<string>();
    for (const [cn, info] of carInfoMap) {
      if (
        cn.toLowerCase().includes(q) ||
        info.teamName.toLowerCase().includes(q) ||
        info.className.toLowerCase().includes(q)
      ) {
        matching.add(cn);
      }
    }
    return matching;
  }, [searchQuery, carInfoMap]);

  // ── Canvas rendering ───────────────────────────────────────────

  const effectiveRowHeight = compareMode ? COMPARE_ROW_HEIGHT : ROW_HEIGHT;

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const chartWidth = width - LABEL_WIDTH - RIGHT_PAD;

    // Calculate total height
    let totalRows = 0;
    let classHeaders = 0;

    if (compareMode && compareCars.size > 0) {
      totalRows = compareCars.size;
      classHeaders = 0;
    } else {
      for (const cls of allClasses.filter(c => effectiveClasses.has(c))) {
        classHeaders++;
        const group = carsByClass[cls] || [];
        const shown = expandedClasses.has(cls) ? group.length : Math.min(group.length, DEFAULT_CARS_PER_CLASS);
        totalRows += shown;
      }
    }

    const totalHeight = TOP_MARGIN + STRIP_HEIGHT + 8 + classHeaders * HEADER_HEIGHT + totalRows * (effectiveRowHeight + ROW_GAP) + 20;

    canvas.width = width * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${totalHeight}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, totalHeight);

    const elapsed2x = (elapsed: number) => LABEL_WIDTH + ((elapsed - viewRange[0]) / viewDuration) * chartWidth;

    // ── Race Control Strip (top) ──
    const stripY = TOP_MARGIN - STRIP_HEIGHT - 4;
    for (const seg of flagSegments) {
      const s = Number(seg.start_elapsed);
      const e = Number(seg.end_elapsed);
      if (e <= viewRange[0] || s >= viewRange[1]) continue;
      const x1 = Math.max(elapsed2x(s), LABEL_WIDTH);
      const x2 = Math.min(elapsed2x(e), LABEL_WIDTH + chartWidth);
      const color = FLAG_COLORS[seg.flag_state]?.strip || "#9ca3af";
      ctx.fillStyle = color;
      ctx.fillRect(x1, stripY, Math.max(x2 - x1, 1), STRIP_HEIGHT);
    }
    // Strip label
    ctx.fillStyle = "#9ca3af";
    ctx.font = "9px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("FLAGS", LABEL_WIDTH - 6, stripY + STRIP_HEIGHT / 2 + 3);

    // ── Time axis ticks ──
    const axisY = TOP_MARGIN - STRIP_HEIGHT - 8;
    ctx.fillStyle = "#6b7280";
    ctx.font = "9px system-ui, sans-serif";
    ctx.textAlign = "center";
    const tickInterval = viewDuration > 14400 ? 3600 : viewDuration > 3600 ? 1800 : viewDuration > 600 ? 300 : 60;
    const firstTick = Math.ceil(viewRange[0] / tickInterval) * tickInterval;
    for (let t = firstTick; t <= viewRange[1]; t += tickInterval) {
      const x = elapsed2x(t);
      if (x < LABEL_WIDTH || x > LABEL_WIDTH + chartWidth) continue;
      ctx.fillText(formatElapsed(t), x, axisY);
      ctx.strokeStyle = "rgba(107, 114, 128, 0.15)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, TOP_MARGIN);
      ctx.lineTo(x, totalHeight - 10);
      ctx.stroke();
    }

    // ── Flag bands (full height behind rows) ──
    const rowsTop = TOP_MARGIN;
    const rowsBottom = totalHeight - 10;
    for (const seg of flagSegments) {
      const s = Number(seg.start_elapsed);
      const e = Number(seg.end_elapsed);
      if (e <= viewRange[0] || s >= viewRange[1]) continue;
      if (seg.flag_state === "GREEN") continue;
      const x1 = Math.max(elapsed2x(s), LABEL_WIDTH);
      const x2 = Math.min(elapsed2x(e), LABEL_WIDTH + chartWidth);
      const color = FLAG_COLORS[seg.flag_state]?.bg || "rgba(107, 114, 128, 0.05)";
      ctx.fillStyle = color;
      ctx.fillRect(x1, rowsTop, Math.max(x2 - x1, 1), rowsBottom - rowsTop);
    }

    // ── Drag selection overlay ──
    if (isDragging && dragStart != null && dragEnd != null) {
      const x1 = Math.min(dragStart, dragEnd);
      const x2 = Math.max(dragStart, dragEnd);
      ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
      ctx.fillRect(x1, TOP_MARGIN, x2 - x1, rowsBottom - TOP_MARGIN);
      ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, TOP_MARGIN, x2 - x1, rowsBottom - TOP_MARGIN);
    }

    // ── Draw car rows ──
    const drawCarRow = (car: CarInfo, y: number, classColor: string) => {
      const isHighlighted = highlightedCar === car.carNumber;
      const isCompared = compareCars.has(car.carNumber);
      const isFaded = (highlightedCar != null && !isHighlighted) ||
        (searchFilteredCars != null && !searchFilteredCars.has(car.carNumber));
      const alpha = isFaded ? 0.15 : 1;

      // Car label
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#d1d5db";
      ctx.font = compareMode ? "bold 11px monospace" : "10px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`#${car.carNumber}`, LABEL_WIDTH - 6, y + effectiveRowHeight / 2 + 3);

      // Compare mode: show team name below car number
      if (compareMode) {
        ctx.fillStyle = "#9ca3af";
        ctx.font = "8px system-ui, sans-serif";
        ctx.fillText(car.teamName.substring(0, 12), LABEL_WIDTH - 6, y + effectiveRowHeight / 2 + 13);
      }

      // Background
      ctx.fillStyle = isCompared && !compareMode
        ? "rgba(59, 130, 246, 0.08)"
        : "rgba(107, 114, 128, 0.06)";
      ctx.fillRect(LABEL_WIDTH, y, chartWidth, effectiveRowHeight);

      // Stints for this car
      const carStints = stints.filter(s => s.car_number === car.carNumber);
      for (const stint of carStints) {
        if (stint.end_elapsed <= viewRange[0] || stint.start_elapsed >= viewRange[1]) continue;
        const x1 = Math.max(elapsed2x(stint.start_elapsed), LABEL_WIDTH);
        const x2 = Math.min(elapsed2x(stint.end_elapsed), LABEL_WIDTH + chartWidth);
        const w = Math.max(x2 - x1, 2);

        ctx.fillStyle = classColor;
        ctx.globalAlpha = alpha * 0.75;

        // Rounded rect
        const r = 2;
        const ry = y + 2;
        const rh = effectiveRowHeight - 4;
        ctx.beginPath();
        ctx.moveTo(x1 + r, ry);
        ctx.lineTo(x1 + w - r, ry);
        ctx.quadraticCurveTo(x1 + w, ry, x1 + w, ry + r);
        ctx.lineTo(x1 + w, ry + rh - r);
        ctx.quadraticCurveTo(x1 + w, ry + rh, x1 + w - r, ry + rh);
        ctx.lineTo(x1 + r, ry + rh);
        ctx.quadraticCurveTo(x1, ry + rh, x1, ry + rh - r);
        ctx.lineTo(x1, ry + r);
        ctx.quadraticCurveTo(x1, ry, x1 + r, ry);
        ctx.fill();

        // In compare mode, show driver name inside stint if wide enough
        if (compareMode && stint.driverName && w > 40) {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = "#fff";
          ctx.font = "bold 8px system-ui, sans-serif";
          ctx.textAlign = "left";
          const shortName = stint.driverName.split(" ").pop() || stint.driverName;
          ctx.fillText(shortName, x1 + 4, y + effectiveRowHeight / 2 + 3);
        }
      }

      // Driver change initials (non-compare mode)
      if (!compareMode) {
        let prevDriverId: string | null = null;
        for (const stint of carStints) {
          if (stint.end_elapsed <= viewRange[0] || stint.start_elapsed >= viewRange[1]) {
            prevDriverId = stint.driver_id;
            continue;
          }
          const isDriverChange = prevDriverId != null && stint.driver_id != null && stint.driver_id !== prevDriverId;
          if (isDriverChange && stint.driverName) {
            const x1 = Math.max(elapsed2x(stint.start_elapsed), LABEL_WIDTH);
            const x2 = Math.min(elapsed2x(stint.end_elapsed), LABEL_WIDTH + chartWidth);
            const w = Math.max(x2 - x1, 2);
            if (w > 18) {
              const initials = stint.driverName
                .split(/\s+/)
                .map(p => p[0]?.toUpperCase() || "")
                .join("");
              ctx.globalAlpha = alpha * 0.9;
              ctx.fillStyle = "#fff";
              ctx.font = "bold 7px system-ui, sans-serif";
              ctx.textAlign = "left";
              ctx.fillText(initials, x1 + 3, y + effectiveRowHeight / 2 + 2.5);
            }
          }
          prevDriverId = stint.driver_id;
        }
      }

      // Position overlays at hour boundaries
      if (showPositions && positionLookup.has(car.carNumber)) {
        const carPositions = positionLookup.get(car.carNumber)!;
        ctx.globalAlpha = alpha;
        for (const [, hp] of carPositions) {
          const hx = elapsed2x(hp.elapsed);
          if (hx < LABEL_WIDTH || hx > LABEL_WIDTH + chartWidth) continue;

          // Position badge
          const posText = `P${hp.position}`;
          ctx.font = "bold 7px system-ui, sans-serif";
          const textW = ctx.measureText(posText).width;
          const badgeW = textW + 4;
          const badgeH = 10;
          const badgeX = hx - badgeW / 2;
          const badgeY = y + 1;

          // Badge background
          const posColor = hp.position <= 3 ? "#22c55e" :
            hp.position <= 10 ? "#3b82f6" : "#6b7280";
          ctx.fillStyle = posColor;
          ctx.globalAlpha = alpha * 0.85;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 2);
          ctx.fill();

          // Badge text
          ctx.globalAlpha = alpha;
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.fillText(posText, hx, badgeY + badgeH - 2.5);
        }
      }

      ctx.globalAlpha = 1;
    };

    // ── Render rows ──
    let y = TOP_MARGIN;

    if (compareMode && compareCars.size > 0) {
      // Compare mode: flat list, no class headers
      for (const car of visibleCars) {
        const classColor = getClassColor(car.className);
        drawCarRow(car, y, classColor);
        y += effectiveRowHeight + ROW_GAP;
      }
    } else {
      for (const cls of allClasses.filter(c => effectiveClasses.has(c))) {
        const group = carsByClass[cls] || [];
        const isExpanded = expandedClasses.has(cls);
        const shown = isExpanded ? group : group.slice(0, DEFAULT_CARS_PER_CLASS);
        const classColor = getClassColor(cls);

        // Class header
        ctx.fillStyle = classColor;
        ctx.font = "bold 10px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`${cls} (${group.length})`, 4, y + HEADER_HEIGHT / 2 + 3);
        if (!isExpanded && group.length > DEFAULT_CARS_PER_CLASS) {
          ctx.fillStyle = "#9ca3af";
          ctx.font = "9px system-ui, sans-serif";
          ctx.fillText(`+${group.length - DEFAULT_CARS_PER_CLASS} more`, LABEL_WIDTH - 8, y + HEADER_HEIGHT / 2 + 3);
        }
        y += HEADER_HEIGHT;

        for (const car of shown) {
          drawCarRow(car, y, classColor);
          y += effectiveRowHeight + ROW_GAP;
        }
      }
    }
  }, [stints, pitStops, flagSegments, visibleCars, allClasses, carsByClass, effectiveClasses, expandedClasses, highlightedCar, viewRange, viewDuration, isDragging, dragStart, dragEnd, compareMode, compareCars, effectiveRowHeight, showPositions, positionLookup, searchFilteredCars]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  useEffect(() => {
    const handleResize = () => drawCanvas();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawCanvas]);

  // ── Mouse interaction ──────────────────────────────────────────

  const getMousePos = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const x2elapsed = useCallback((x: number) => {
    const container = containerRef.current;
    if (!container) return 0;
    const chartWidth = container.clientWidth - LABEL_WIDTH - RIGHT_PAD;
    return viewRange[0] + ((x - LABEL_WIDTH) / chartWidth) * viewDuration;
  }, [viewRange, viewDuration]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = getMousePos(e);
    const container = containerRef.current;
    if (!container) return;
    const chartWidth = container.clientWidth - LABEL_WIDTH - RIGHT_PAD;
    const elapsed = x2elapsed(x);

    if (isDragging && dragStart != null) {
      setDragEnd(x);
      return;
    }

    // Find hovered element
    let rowY = TOP_MARGIN;
    let found = false;

    const iterateRows = (callback: (car: CarInfo, rowTop: number) => boolean) => {
      if (compareMode && compareCars.size > 0) {
        for (const car of visibleCars) {
          if (callback(car, rowY)) return true;
          rowY += effectiveRowHeight + ROW_GAP;
        }
      } else {
        for (const cls of allClasses.filter(c => effectiveClasses.has(c))) {
          const group = carsByClass[cls] || [];
          const isExpanded = expandedClasses.has(cls);
          const shown = isExpanded ? group : group.slice(0, DEFAULT_CARS_PER_CLASS);
          rowY += HEADER_HEIGHT;
          for (const car of shown) {
            if (callback(car, rowY)) return true;
            rowY += effectiveRowHeight + ROW_GAP;
          }
        }
      }
      return false;
    };

    found = iterateRows((car, carY) => {
      if (y >= carY && y < carY + effectiveRowHeight && x >= LABEL_WIDTH && x <= LABEL_WIDTH + chartWidth) {
        // Check pit stop hover
        const carPits = pitStops.filter(p => p.car_number === car.carNumber);
        const hitPit = carPits.find(p => Math.abs(elapsed - p.pit_in_elapsed) < viewDuration * 0.005);
        if (hitPit) {
          const lines = [
            `Pit Stop — #${car.carNumber} ${car.teamName}`,
            `In: ${formatElapsed(hitPit.pit_in_elapsed)}`,
            hitPit.pit_out_elapsed != null ? `Out: ${formatElapsed(hitPit.pit_out_elapsed)}` : "",
            hitPit.stop_duration ? `Duration: ${hitPit.stop_duration}` : "",
            hitPit.flag_status ? `Flag: ${hitPit.flag_status}` : "",
          ].filter(Boolean);
          setTooltip({ x: e.clientX, y: e.clientY, content: lines });
          return true;
        }

        // Check stint hover — with green-flag analytics
        const carStints = stints.filter(s => s.car_number === car.carNumber);
        const hitStint = carStints.find(s => elapsed >= s.start_elapsed && elapsed <= s.end_elapsed);
        if (hitStint) {
          const duration = hitStint.end_elapsed - hitStint.start_elapsed;
          const laps = hitStint.start_lap != null && hitStint.end_lap != null
            ? hitStint.end_lap - hitStint.start_lap
            : null;

          // Green-flag performance analytics
          const greenDuration = computeGreenFlagDuration(hitStint, flagSegments);
          const greenPct = duration > 0 ? Math.round((greenDuration / duration) * 100) : 0;
          const avgLapTime = laps && laps > 0 && greenDuration > 30
            ? greenDuration / laps
            : null;

          const lines = [
            `#${car.carNumber} ${car.teamName}`,
            hitStint.driverName ? `Driver: ${hitStint.driverName}` : "",
            `Start: ${formatElapsed(hitStint.start_elapsed)}  →  End: ${formatElapsed(hitStint.end_elapsed)}`,
            `Duration: ${formatElapsed(duration)}`,
            laps != null ? `Laps: ${laps}` : "",
            ``,
            `Green-flag: ${formatElapsed(greenDuration)} (${greenPct}%)`,
            avgLapTime != null && avgLapTime > 30 && avgLapTime < 300
              ? `Avg lap (green): ${formatLapTime(avgLapTime)}`
              : "",
          ].filter(Boolean);
          setTooltip({ x: e.clientX, y: e.clientY, content: lines });
          return true;
        }
      }
      return false;
    });

    // Check flag strip hover
    if (!found && y >= TOP_MARGIN - STRIP_HEIGHT - 4 && y < TOP_MARGIN - 4 && x >= LABEL_WIDTH) {
      const seg = flagSegments.find(s => {
        const se = Number(s.start_elapsed);
        const ee = Number(s.end_elapsed);
        return elapsed >= se && elapsed <= ee;
      });
      if (seg) {
        const duration = Number(seg.end_elapsed) - Number(seg.start_elapsed);
        setTooltip({
          x: e.clientX, y: e.clientY,
          content: [
            `${seg.flag_state}`,
            `Start: ${formatElapsed(Number(seg.start_elapsed))}`,
            `End: ${formatElapsed(Number(seg.end_elapsed))}`,
            `Duration: ${formatElapsed(duration)}`,
          ],
        });
        found = true;
      }
    }

    if (!found) setTooltip(null);
  }, [getMousePos, x2elapsed, isDragging, dragStart, allClasses, effectiveClasses, carsByClass, expandedClasses, pitStops, stints, flagSegments, viewDuration, compareMode, compareCars, visibleCars, effectiveRowHeight]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const { x } = getMousePos(e);
    if (x >= LABEL_WIDTH) {
      setIsDragging(true);
      setDragStart(x);
      setDragEnd(x);
    }
  }, [getMousePos]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && dragStart != null && dragEnd != null) {
      const x1 = Math.min(dragStart, dragEnd);
      const x2 = Math.max(dragStart, dragEnd);
      if (x2 - x1 > 10) {
        const e1 = x2elapsed(x1);
        const e2 = x2elapsed(x2);
        setZoomRange([Math.max(e1, timeRange[0]), Math.min(e2, timeRange[1])]);
      }
    }
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, x2elapsed, timeRange]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const { x, y } = getMousePos(e);

    if (compareMode) {
      // In compare mode, clicks toggle car selection
      let rowY = TOP_MARGIN;
      for (const cls of allClasses.filter(c => effectiveClasses.has(c))) {
        const group = carsByClass[cls] || [];
        rowY += HEADER_HEIGHT;
        const isExpanded = expandedClasses.has(cls);
        const shown = isExpanded ? group : group.slice(0, DEFAULT_CARS_PER_CLASS);
        for (const car of shown) {
          if (y >= rowY && y < rowY + effectiveRowHeight) {
            setCompareCars(prev => {
              const next = new Set(prev);
              if (next.has(car.carNumber)) next.delete(car.carNumber);
              else next.add(car.carNumber);
              return next;
            });
            return;
          }
          rowY += effectiveRowHeight + ROW_GAP;
        }
      }
      return;
    }

    // Check class header clicks for expand/collapse
    let rowY = TOP_MARGIN;
    for (const cls of allClasses.filter(c => effectiveClasses.has(c))) {
      const group = carsByClass[cls] || [];
      if (y >= rowY && y < rowY + HEADER_HEIGHT) {
        setExpandedClasses(prev => {
          const next = new Set(prev);
          if (next.has(cls)) next.delete(cls); else next.add(cls);
          return next;
        });
        return;
      }
      rowY += HEADER_HEIGHT;
      const isExpanded = expandedClasses.has(cls);
      const shown = isExpanded ? group.length : Math.min(group.length, DEFAULT_CARS_PER_CLASS);
      rowY += shown * (effectiveRowHeight + ROW_GAP);
    }

    // Check car row clicks for highlighting
    rowY = TOP_MARGIN;
    for (const cls of allClasses.filter(c => effectiveClasses.has(c))) {
      const group = carsByClass[cls] || [];
      const isExpanded = expandedClasses.has(cls);
      const shown = isExpanded ? group : group.slice(0, DEFAULT_CARS_PER_CLASS);
      rowY += HEADER_HEIGHT;
      for (const car of shown) {
        if (y >= rowY && y < rowY + effectiveRowHeight) {
          setHighlightedCar(prev => prev === car.carNumber ? null : car.carNumber);
          return;
        }
        rowY += effectiveRowHeight + ROW_GAP;
      }
    }
  }, [getMousePos, allClasses, effectiveClasses, carsByClass, expandedClasses, compareMode, effectiveRowHeight]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }
  }, [isDragging]);

  // ── Loading state ──────────────────────────────────────────────

  if (stints.length === 0 && pitStops.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        No strategy data available for this session.
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className={compact ? "h-full flex flex-col" : "space-y-3"}>
      {/* Controls — hidden in compact mode */}
      {!compact && (
        <>
          {/* Controls Row 1: Class filters + Zoom presets */}
          <div className="flex flex-wrap items-center gap-2">
            {allClasses.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {allClasses.map(cls => {
                  const isActive = selectedClasses.size === 0 || selectedClasses.has(cls);
                  const color = getClassColor(cls);
                  return (
                    <button
                      key={cls}
                      onClick={() => {
                        setSelectedClasses(prev => {
                          const next = new Set(prev);
                          if (next.has(cls)) next.delete(cls); else next.add(cls);
                          if (next.size === allClasses.length) return new Set();
                          return next;
                        });
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all"
                      style={{
                        borderColor: isActive ? color : "transparent",
                        backgroundColor: isActive ? `${color}18` : "rgba(107, 114, 128, 0.1)",
                        color: isActive ? color : "#9ca3af",
                      }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color, opacity: isActive ? 1 : 0.3 }} />
                      {cls}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-1 ml-auto">
              {zoomPresets.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => setZoomRange(preset.range)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all border ${
                    (preset.range === null && zoomRange === null) ||
                    (preset.range && zoomRange && preset.range[0] === zoomRange[0] && preset.range[1] === zoomRange[1])
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Controls Row 2: Feature toggles + Search */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setCompareMode(prev => !prev);
                if (compareMode) setCompareCars(new Set());
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                compareMode
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              🔀 Compare {compareMode && compareCars.size > 0 ? `(${compareCars.size})` : ""}
            </button>

            <button
              onClick={() => setShowPositions(prev => !prev)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                showPositions
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              🏆 Positions
            </button>

            <input
              type="text"
              placeholder="Search car # or team..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="px-2 py-1 rounded text-[10px] border border-border bg-muted/30 text-foreground placeholder:text-muted-foreground/60 w-36 focus:outline-none focus:border-primary/40"
            />

            {compareMode && compareCars.size > 0 && (
              <button
                onClick={() => setCompareCars(new Set())}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear selection
              </button>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 rounded-sm" style={{ background: FLAG_COLORS.GREEN.strip }} /> Green
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 rounded-sm" style={{ background: FLAG_COLORS.YELLOW.strip }} /> Yellow
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 rounded-sm" style={{ background: FLAG_COLORS.FCY.strip }} /> FCY/SC
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 rounded-sm" style={{ background: FLAG_COLORS.RED.strip }} /> Red
            </span>
            <span className="text-[9px] text-muted-foreground/60 ml-2">
              {compareMode
                ? "Click cars to add/remove from comparison"
                : "Click class header to expand · Click car row to highlight · Drag to zoom"}
            </span>
          </div>
        </>
      )}

      {/* Canvas */}
      <div ref={containerRef} className={`overflow-x-auto cursor-crosshair select-none ${compact ? "flex-1" : ""}`}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          onMouseLeave={handleMouseLeave}
        />
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs text-popover-foreground"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 8,
            maxWidth: 300,
          }}
        >
          {tooltip.content.map((line, i) => (
            <div key={i} className={i === 0 ? "font-semibold mb-1" : line === "" ? "h-1" : "text-muted-foreground"}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
