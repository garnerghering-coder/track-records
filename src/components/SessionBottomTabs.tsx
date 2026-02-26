import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import TrackFingerprint from "@/components/TrackFingerprint";
import PositionProgressionChart from "@/components/PositionProgressionChart";
import { computeTrackMetrics } from "@/lib/track-calculations";

interface SessionBottomTabsProps {
  session: any;
  event: any;
  layout?: any;
  annotationSections: any[];
  isOverallEnduranceView?: boolean;
  hourSessions?: any[];
  teamNameMap: Record<string, string>;
  isMulticlass?: boolean;
  activeHourId?: string;
}

// ── Race Control with multi-select filters ────────────────────────────

type RaceControlFilter = "flags" | "penalties" | "incidents";

function RaceControlContent({ sections }: { sections: any[] }) {
  const [activeFilters, setActiveFilters] = useState<Set<RaceControlFilter>>(new Set());

  // Classify each item into categories based on color and description keywords
  const classifiedSections = useMemo(() => {
    return sections.map((section: any) => {
      const items = (section.v2_annotation_items || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((item: any) => {
          const desc = (item.description || "").toLowerCase();
          const color = (item.color || "").toLowerCase();
          let category: RaceControlFilter = "flags";
          if (
            desc.includes("penalty") || desc.includes("penalt") ||
            desc.includes("time penalty") || desc.includes("drive-through") ||
            desc.includes("stop and go") || desc.includes("warning") ||
            desc.includes("reprimand") || desc.includes("disqualif")
          ) {
            category = "penalties";
          } else if (
            desc.includes("incident") || desc.includes("collision") ||
            desc.includes("contact") || desc.includes("crash") ||
            desc.includes("investigation") || desc.includes("stewards")
          ) {
            category = "incidents";
          }
          return { ...item, _category: category };
        });
      return { ...section, _classifiedItems: items };
    });
  }, [sections]);

  // Determine available filter categories
  const availableFilters = useMemo(() => {
    const cats = new Set<RaceControlFilter>();
    for (const s of classifiedSections) {
      for (const item of s._classifiedItems) {
        cats.add(item._category);
      }
    }
    return cats;
  }, [classifiedSections]);

  const toggleFilter = (f: RaceControlFilter) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  };

  const showAll = activeFilters.size === 0;

  const filterLabels: Record<RaceControlFilter, { label: string; emoji: string }> = {
    flags: { label: "Flags", emoji: "🏁" },
    penalties: { label: "Penalties", emoji: "⚠️" },
    incidents: { label: "Incidents", emoji: "💥" },
  };

  return (
    <div className="p-5 space-y-3">
      {/* Filter chips */}
      {availableFilters.size > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {(["flags", "penalties", "incidents"] as RaceControlFilter[])
            .filter(f => availableFilters.has(f))
            .map(f => {
              const isActive = activeFilters.has(f);
              return (
                <button
                  key={f}
                  onClick={() => toggleFilter(f)}
                  className={`
                    inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all
                    ${isActive
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:border-border"
                    }
                  `}
                >
                  {filterLabels[f].emoji} {filterLabels[f].label}
                </button>
              );
            })}
        </div>
      )}

      {/* Items */}
      <div className="space-y-4">
        {classifiedSections.map((section: any) => {
          const filteredItems = section._classifiedItems.filter(
            (item: any) => showAll || activeFilters.has(item._category)
          );
          if (filteredItems.length === 0) return null;
          return (
            <div key={section.id} className="space-y-1">
              {classifiedSections.length > 1 && (
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">{section.title}</h4>
              )}
              {filteredItems.map((item: any) => (
                <div key={item.id} className="text-xs text-muted-foreground border-l-2 pl-3 py-1" style={{ borderColor: item.color }}>
                  {item.description}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Strategy Chart ────────────────────────────────────────────────────

function StrategyChart({
  sessionId,
  teamNameMap,
  isMulticlass,
}: {
  sessionId: string;
  teamNameMap: Record<string, string>;
  isMulticlass?: boolean;
}) {
  const { data: stints = [] } = useQuery({
    queryKey: ["strategy_stints", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_stints" as any)
        .select("*, v2_drivers(full_name)")
        .eq("session_id", sessionId)
        .order("car_number")
        .order("start_elapsed", { ascending: true });
      return (data || []) as any[];
    },
  });

  const { data: pitStops = [] } = useQuery({
    queryKey: ["strategy_pits", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_pit_stops" as any)
        .select("*, v2_drivers(full_name)")
        .eq("session_id", sessionId)
        .order("car_number")
        .order("pit_in_elapsed", { ascending: true });
      return (data || []) as any[];
    },
  });

  if (stints.length === 0 && pitStops.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        No strategy data available for this session.
      </div>
    );
  }

  // Compute session time bounds
  const allElapsed: number[] = [];
  for (const s of stints) {
    if (s.start_elapsed != null) allElapsed.push(Number(s.start_elapsed));
    if (s.end_elapsed != null) allElapsed.push(Number(s.end_elapsed));
  }
  for (const p of pitStops) {
    if (p.pit_in_elapsed != null) allElapsed.push(Number(p.pit_in_elapsed));
    if (p.pit_out_elapsed != null) allElapsed.push(Number(p.pit_out_elapsed));
  }
  if (allElapsed.length === 0) {
    return <div className="text-center text-sm text-muted-foreground py-8">No timing data available.</div>;
  }

  const minTime = Math.min(...allElapsed);
  const maxTime = Math.max(...allElapsed);
  const sessionDuration = maxTime - minTime || 1;

  // Group stints by car number
  const carNumbers = [...new Set(stints.map((s: any) => s.car_number))].sort();
  const pitsByCarNum: Record<string, any[]> = {};
  for (const p of pitStops) {
    const cn = p.car_number || "?";
    if (!pitsByCarNum[cn]) pitsByCarNum[cn] = [];
    pitsByCarNum[cn].push(p);
  }

  // Use distinct driver colors from a palette
  const driverColors = [
    "hsl(var(--primary))",
    "hsl(220 70% 55%)",
    "hsl(280 60% 55%)",
    "hsl(160 60% 45%)",
    "hsl(30 80% 55%)",
    "hsl(350 70% 55%)",
    "hsl(200 70% 50%)",
    "hsl(100 50% 45%)",
  ];
  const driverColorMap: Record<string, string> = {};
  let colorIdx = 0;
  for (const s of stints) {
    const driverId = s.driver_id || "unknown";
    if (!driverColorMap[driverId]) {
      driverColorMap[driverId] = driverColors[colorIdx % driverColors.length];
      colorIdx++;
    }
  }

  const barHeight = 20;
  const rowGap = 4;
  const labelWidth = 60;
  const chartPadding = 12;

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`;
    return `${m}m`;
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-card-foreground">Strategy Chart</h4>
      <div className="overflow-x-auto">
        <svg
          width={Math.max(600, labelWidth + chartPadding * 2 + 500)}
          height={carNumbers.length * (barHeight + rowGap) + 40}
          className="text-foreground"
        >
          {/* Time axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map(frac => {
            const t = minTime + frac * sessionDuration;
            const x = labelWidth + chartPadding + frac * 500;
            return (
              <text key={frac} x={x} y={12} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {formatElapsed(t)}
              </text>
            );
          })}

          {/* Car rows */}
          {carNumbers.map((car, i) => {
            const y = 24 + i * (barHeight + rowGap);
            const carStints = stints.filter((s: any) => s.car_number === car);
            const carPits = pitsByCarNum[car] || [];

            return (
              <g key={car}>
                {/* Car label */}
                <text x={labelWidth - 4} y={y + barHeight / 2 + 4} textAnchor="end" className="fill-foreground text-[11px] font-mono">
                  #{car}
                </text>

                {/* Background bar */}
                <rect
                  x={labelWidth + chartPadding}
                  y={y}
                  width={500}
                  height={barHeight}
                  rx={3}
                  className="fill-muted/30"
                />

                {/* Stint bars */}
                {carStints.map((stint: any, si: number) => {
                  const start = stint.start_elapsed != null ? (Number(stint.start_elapsed) - minTime) / sessionDuration : 0;
                  const end = stint.end_elapsed != null ? (Number(stint.end_elapsed) - minTime) / sessionDuration : 1;
                  const sx = labelWidth + chartPadding + start * 500;
                  const sw = Math.max(2, (end - start) * 500);
                  const color = driverColorMap[stint.driver_id || "unknown"];
                  return (
                    <rect
                      key={si}
                      x={sx}
                      y={y + 2}
                      width={sw}
                      height={barHeight - 4}
                      rx={2}
                      fill={color}
                      opacity={0.8}
                    >
                      <title>
                        {stint.v2_drivers?.full_name || "Unknown"} — {formatElapsed(Number(stint.start_elapsed || 0))} to {formatElapsed(Number(stint.end_elapsed || 0))}
                      </title>
                    </rect>
                  );
                })}

                {/* Pit stop markers */}
                {carPits.map((pit: any, pi: number) => {
                  const pitTime = pit.pit_in_elapsed != null ? Number(pit.pit_in_elapsed) : null;
                  if (pitTime === null) return null;
                  const frac = (pitTime - minTime) / sessionDuration;
                  const px = labelWidth + chartPadding + frac * 500;
                  return (
                    <line
                      key={pi}
                      x1={px}
                      y1={y}
                      x2={px}
                      y2={y + barHeight}
                      stroke="hsl(var(--destructive))"
                      strokeWidth={1.5}
                      strokeDasharray="2,2"
                    >
                      <title>Pit {pi + 1}{pit.stop_duration ? ` — ${pit.stop_duration}` : ""}{pit.flag_status ? ` (${pit.flag_status})` : ""}</title>
                    </line>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {Object.entries(driverColorMap).map(([driverId, color]) => {
          const driverName = stints.find((s: any) => s.driver_id === driverId)?.v2_drivers?.full_name || driverId;
          return (
            <span key={driverId} className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-2 rounded-sm" style={{ background: color }} />
              {driverName}
            </span>
          );
        })}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 border-t border-dashed border-destructive" />
          Pit stop
        </span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export default function SessionBottomTabs({
  session,
  event,
  layout,
  annotationSections,
  isOverallEnduranceView,
  hourSessions,
  teamNameMap,
  isMulticlass,
  activeHourId,
}: SessionBottomTabsProps) {
  // Determine which tabs are available
  const tabs: { id: string; label: string }[] = [];

  // 1. Circuit Fingerprint
  const layoutId = session?.layout_id || event?.layout_id;
  const layoutData = layout && Array.isArray(layout)
    ? layout.find((l: any) => l.id === layoutId) || (layout.length === 1 ? layout[0] : null)
    : null;
  const trackMetrics = layoutData
    ? computeTrackMetrics(
        layoutData.length_km ? Number(layoutData.length_km) : null,
        layoutData.turns,
        layoutData.total_straight_length_km ? Number(layoutData.total_straight_length_km) : null,
        layoutData.total_elevation_change_m ? Number(layoutData.total_elevation_change_m) : null,
        layoutData.heavy_braking_corners
      )
    : null;
  const hasFingerprint = trackMetrics && (trackMetrics.tcs100 != null || trackMetrics.ei != null || trackMetrics.csi != null);
  if (hasFingerprint) tabs.push({ id: "fingerprint", label: "Circuit Fingerprint" });

  // 2. Race Control (annotation sections)
  const raceControlSections = annotationSections.filter((s: any) => {
    const items = s.v2_annotation_items || [];
    return items.length > 0;
  });
  if (raceControlSections.length > 0) tabs.push({ id: "race-control", label: "Race Control" });

  // 3. Position Progression (only for endurance with hour sessions)
  const hasProgression = hourSessions && hourSessions.length > 0;
  if (hasProgression) tabs.push({ id: "progression", label: "Position Progression" });

  // 4. Strategy Chart (check if stint data exists)
  const { data: stintCount = 0 } = useQuery({
    queryKey: ["strategy_check", session.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("v2_stints" as any)
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id);
      return count || 0;
    },
  });
  if (stintCount > 0) tabs.push({ id: "strategy", label: "Strategy Chart" });

  const [activeTab, setActiveTab] = useState<string>("");

  // Auto-select first tab
  const resolvedTab = activeTab && tabs.some(t => t.id === activeTab) ? activeTab : tabs[0]?.id || "";

  if (tabs.length === 0) return null;

  return (
    <div className="mt-6">
      {/* Manila folder tabs */}
      <div className="flex items-end gap-0.5">
        {tabs.map(tab => {
          const isActive = tab.id === resolvedTab;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                relative px-4 py-2 text-xs sm:text-sm font-semibold transition-colors
                rounded-t-lg border border-b-0
                ${isActive
                  ? "bg-card text-card-foreground border-border z-10"
                  : "bg-muted/50 text-muted-foreground border-transparent hover:text-foreground hover:bg-muted"
                }
              `}
              style={isActive ? { marginBottom: "-1px" } : {}}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content box */}
      <div className="rounded-lg rounded-tl-none border border-border bg-card overflow-hidden">
        {resolvedTab === "fingerprint" && hasFingerprint && layoutData && trackMetrics && (
          <div className="p-5">
            <TrackFingerprint
              metrics={trackMetrics}
              layoutImageUrl={layoutData.layout_image_url}
              layoutName={layoutData.name}
              lengthKm={layoutData.length_km}
              turns={layoutData.turns}
            />
          </div>
        )}

        {resolvedTab === "race-control" && (
          <RaceControlContent sections={raceControlSections} />
        )}

        {resolvedTab === "progression" && hasProgression && (
          <div className="p-5">
            <PositionProgressionChart
              hourSessions={hourSessions!}
              teamNameMap={teamNameMap}
              activeHourId={activeHourId}
              isMulticlass={isMulticlass}
            />
          </div>
        )}

        {resolvedTab === "strategy" && (
          <div className="p-5">
            <StrategyChart sessionId={session.id} teamNameMap={teamNameMap} isMulticlass={isMulticlass} />
          </div>
        )}
      </div>
    </div>
  );
}
