import { useMemo, useState, useCallback, useRef } from "react";
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
}

// ── Deterministic color palette ──────────────────────────────────────

const COLORS = [
  "#3b82f6","#ef4444","#22c55e","#f59e0b","#8b5cf6","#ec4899","#06b6d4",
  "#f97316","#14b8a6","#a855f7","#e11d48","#84cc16","#0ea5e9","#d946ef",
  "#facc15","#64748b","#fb923c","#4ade80","#38bdf8","#c084fc","#f472b6",
  "#2dd4bf","#fbbf24","#a3e635","#818cf8","#fb7185","#34d399","#fde047",
  "#67e8f9","#c4b5fd","#f9a8d4","#5eead4","#fdba74","#bef264","#93c5fd",
  "#fda4af","#6ee7b7","#fef08a","#a5f3fc","#ddd6fe","#fbcfe8","#99f6e4",
];

function getCarColor(carNumber: string, allCars: string[]): string {
  const idx = allCars.indexOf(carNumber);
  return COLORS[idx % COLORS.length];
}

// ── Component ────────────────────────────────────────────────────────

export default function PositionProgressionChart({
  hourSessions,
  teamNameMap,
  activeHourId,
  isMulticlass,
  compact,
}: Props) {
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [highlightedCar, setHighlightedCar] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"overall" | "class">("overall");
  const [hoveredCar, setHoveredCar] = useState<string | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Fetch all hour results in one batch
  const hourIds = hourSessions.map((h) => h.id);
  const { data: allHourResults = [], isLoading } = useQuery({
    queryKey: ["position_progression", hourIds.join(",")],
    queryFn: async () => {
      if (hourIds.length === 0) return [];
      // Fetch in batches to avoid Supabase's 1000-row default limit
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
    enabled: hourIds.length > 0,
  });

  // Build per-car time series
  const { carSeries, allClasses, allCarNumbers } = useMemo(() => {
    if (allHourResults.length === 0) return { carSeries: [], allClasses: [] as string[], allCarNumbers: [] as string[] };

    // Map session_id -> hour index
    const hourIndexMap: Record<string, number> = {};
    const hourLabelMap: Record<string, string> = {};
    hourSessions.forEach((h, i) => {
      hourIndexMap[h.id] = i + 1;
      hourLabelMap[h.id] = h.name;
    });

    // Group by car_number
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

    // Detect DNF: if laps stop progressing for the remaining hours
    const totalHours = hourSessions.length;
    const series: CarTimeSeries[] = [];
    const carNumbers: string[] = [];

    for (const [cn, points] of carMap.entries()) {
      points.sort((a, b) => a.hour - b.hour);
      carNumbers.push(cn);

      // Detect DNF by checking if laps stall permanently
      let retired = false;
      if (points.length > 0 && points[points.length - 1].hour < totalHours) {
        // Car doesn't appear in later hours - likely retired
        retired = true;
      } else if (points.length >= 2) {
        // Check if laps stall at the end
        let lastProgressHour = 0;
        for (let i = 1; i < points.length; i++) {
          const prevLaps = points[i - 1].lapsCompleted;
          const currLaps = points[i].lapsCompleted;
          if (prevLaps !== null && currLaps !== null && currLaps > prevLaps) {
            lastProgressHour = i;
          }
        }
        // If laps stopped progressing for the final 2+ hours, mark as retired
        // But only trim if there's genuinely no progress at the very end
        if (lastProgressHour < points.length - 2) {
          // Keep points up through lastProgressHour + 1 (the first stall hour)
          const trimmedPoints = points.slice(0, lastProgressHour + 2);
          series.push({
            carNumber: cn,
            className: carClassMap.get(cn) || null,
            teamName: carTeamMap.get(cn) || null,
            points: trimmedPoints,
            retired: true,
          });
          continue;
        }
      }

      series.push({
        carNumber: cn,
        className: carClassMap.get(cn) || null,
        teamName: carTeamMap.get(cn) || null,
        points,
        retired,
      });
    }

    // Sort car numbers numerically
    carNumbers.sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    return {
      carSeries: series,
      allClasses: Array.from(classSet).sort(),
      allCarNumbers: carNumbers,
    };
  }, [allHourResults, hourSessions, teamNameMap]);

  // Filter by class
  const filteredSeries = useMemo(() => {
    if (selectedClasses.size === 0) return carSeries;
    return carSeries.filter((c) => c.className && selectedClasses.has(c.className));
  }, [carSeries, selectedClasses]);

  // Build recharts data: each hour is a data point, with car_XX keys for each car
  const { chartData, maxPosition } = useMemo(() => {
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
  }, [filteredSeries, hourSessions, viewMode]);

  // Build tooltip lookup: hour -> carNumber -> point data
  const tooltipLookup = useMemo(() => {
    const lookup: Record<number, Record<string, CarHourPoint>> = {};
    for (const car of filteredSeries) {
      for (const pt of car.points) {
        if (!lookup[pt.hour]) lookup[pt.hour] = {};
        lookup[pt.hour][car.carNumber] = pt;
      }
    }
    return lookup;
  }, [filteredSeries]);

  const toggleClass = useCallback((cls: string) => {
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      return next;
    });
  }, []);

  // Active hour index for reference line
  const activeHourIndex = activeHourId
    ? hourSessions.findIndex((h) => h.id === activeHourId) + 1
    : null;

  if (isLoading) return null;
  if (filteredSeries.length === 0 && carSeries.length === 0) return null;

  const showClassFilter = allClasses.length > 1;

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
        style={compact ? undefined : { height: Math.min(500, Math.max(300, maxPosition * 16 + 60)) }}
        onMouseLeave={() => { setHoveredCar(null); setTooltipPos(null); }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: compact ? 25 : 10, bottom: 10, left: compact ? 5 : 50 }}
            onMouseMove={(state: any) => {
              if (!state || state.activeTooltipIndex == null || !state.chartX || !state.chartY) {
                return;
              }
              const hourIdx = state.activeTooltipIndex;
              const hour = hourIdx + 1;
              if (hour < 1 || hour > hourSessions.length) return;

              // Map chartY to position using the Y axis scale (reversed)
              // Fallback: estimate from chart dimensions
              const containerEl = chartContainerRef.current;
              const containerH = containerEl?.clientHeight || 400;
              // Recharts margins: top 10, bottom 10 + axis ~20
              const plotTop = 10;
              const plotBottom = containerH - 40;
              const plotHeight = plotBottom - plotTop;
              const yFrac = Math.max(0, Math.min(1, (state.chartY - plotTop) / plotHeight));
              const mousePos = 1 + yFrac * ((maxPosition || 1) - 1);

              // Find nearest car at this hour
              const hourData = tooltipLookup[hour] || {};
              let nearestCar: string | null = null;
              let nearestDist = Infinity;

              for (const cn of Object.keys(hourData)) {
                const pt = hourData[cn];
                const pos = viewMode === "class" && pt.classPosition ? parseInt(pt.classPosition, 10) : pt.position;
                if (pos === null) continue;
                const dist = Math.abs(pos - mousePos);
                if (dist < nearestDist) {
                  nearestDist = dist;
                  nearestCar = cn;
                }
              }

              if (nearestCar && nearestDist < 3) {
                setHoveredCar(nearestCar);
                setHoveredHour(hour);
                setTooltipPos({ x: state.chartX + 60, y: state.chartY });
              } else {
                setHoveredCar(null);
                setTooltipPos(null);
              }
            }}
            onMouseLeave={() => { setHoveredCar(null); setTooltipPos(null); }}
          >
            <XAxis
              dataKey="hourLabel"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
            />
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
            {activeHourIndex && activeHourIndex > 0 && (
              <ReferenceLine
                x={hourSessions[activeHourIndex - 1]?.name}
                stroke="hsl(var(--primary))"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
            )}
            {filteredSeries.map((car) => {
              const isActive = hoveredCar === car.carNumber || highlightedCar === car.carNumber;
              const anyHighlight = hoveredCar || highlightedCar;
              return (
                <Line
                  key={car.carNumber}
                  type="linear"
                  dataKey={`car_${car.carNumber}`}
                  stroke={getCarColor(car.carNumber, allCarNumbers)}
                  strokeWidth={isActive ? 3 : 1.5}
                  strokeOpacity={anyHighlight ? (isActive ? 1 : 0.12) : 0.8}
                  dot={{
                    r: isActive ? 3.5 : 2.5,
                    strokeWidth: 0,
                    fill: getCarColor(car.carNumber, allCarNumbers),
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

        {/* Custom tooltip near cursor */}
        {hoveredCar && hoveredHour && tooltipPos && tooltipLookup[hoveredHour]?.[hoveredCar] && (() => {
          const pt = tooltipLookup[hoveredHour][hoveredCar];
          const containerWidth = chartContainerRef.current?.clientWidth || 600;
          const flipX = tooltipPos.x > containerWidth - 200;
          return (
            <div
              className="pointer-events-none absolute rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg space-y-1 max-w-[220px]"
              style={{
                left: flipX ? tooltipPos.x - 180 : tooltipPos.x + 10,
                top: Math.max(10, tooltipPos.y - 40),
                zIndex: 50,
              }}
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

      {/* Car legend — hidden in compact mode */}
      {!compact && (
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
        {filteredSeries.map((car) => (
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
              style={{ backgroundColor: getCarColor(car.carNumber, allCarNumbers) }}
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
