import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import TrackFingerprint from "@/components/TrackFingerprint";
import PositionProgressionChart from "@/components/PositionProgressionChart";
import StrategyTimeline from "@/components/StrategyTimeline";
import ClassTimeDelta from "@/components/ClassTimeDelta";
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
  parentSessionId?: string;
  seasonClasses?: { class_name: string; color: string; sort_order: number }[];
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

  const filterLabels: Record<RaceControlFilter, { label: string }> = {
    flags: { label: "Flags" },
    penalties: { label: "Penalties" },
    incidents: { label: "Incidents" },
  };

  return (
    <div className="px-5 py-3 space-y-2">
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
                  {filterLabels[f].label}
                </button>
              );
            })}
        </div>
      )}

      {/* Items — scrollable compact list */}
      <div className="max-h-48 overflow-y-auto space-y-3 pr-1">
        {classifiedSections.map((section: any) => {
          const filteredItems = section._classifiedItems.filter(
            (item: any) => showAll || activeFilters.has(item._category)
          );
          if (filteredItems.length === 0) return null;
          return (
            <div key={section.id} className="space-y-0.5">
              {classifiedSections.length > 1 && (
                <h4 className="text-xs font-semibold text-muted-foreground mb-0.5">{section.title}</h4>
              )}
              {filteredItems.map((item: any) => (
                <div key={item.id} className="text-xs text-muted-foreground border-l-2 pl-3 py-0.5" style={{ borderColor: item.color }}>
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

// Strategy Chart has been replaced by StrategyTimeline component

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
  parentSessionId,
  seasonClasses,
}: SessionBottomTabsProps) {
  // Determine which tabs are available (ordered: Strategy, Progression, Race Control, Fingerprint)
  const tabs: { id: string; label: string }[] = [];
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
  // Race Control (annotation sections)
  const raceControlSections = annotationSections.filter((s: any) => {
    const items = s.v2_annotation_items || [];
    return items.length > 0;
  });

  // Position Progression (only for endurance with hour sessions)
  const hasProgression = hourSessions && hourSessions.length > 0;

  // 4. Strategy Chart (check if stint data exists)
  const { data: stintCount = 0 } = useQuery({
    queryKey: ["strategy_check", session.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("v2_stints" as any)
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id);
      return count ?? 0;
    },
  });

  // 5. Class Time Delta (check if lap timing data exists)
  const { data: lapTimeCount = 0 } = useQuery({
    queryKey: ["lap_times_check", session.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("v2_lap_times" as any)
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id);
      return count || 0;
    },
  });

  // Build tabs in desired order: Time Delta, Strategy, Progression, Race Control, Fingerprint
  if (lapTimeCount > 0) tabs.push({ id: "time-delta", label: "Class Time Delta" });
  if (stintCount > 0) tabs.push({ id: "strategy", label: "Strategy Timeline" });
  if (hasProgression) tabs.push({ id: "progression", label: "Position Progression" });
  if (raceControlSections.length > 0) tabs.push({ id: "race-control", label: "Race Control" });
  if (hasFingerprint) tabs.push({ id: "fingerprint", label: "Circuit Fingerprint" });

  const [activeTab, setActiveTab] = useState<string>("");

  // Auto-select first tab
  const resolvedTab = activeTab && tabs.some(t => t.id === activeTab) ? activeTab : tabs[0]?.id || "";

  if (tabs.length === 0) return null;

  const tabHelpText: Record<string, string> = {
    "time-delta": "Visualizes the gap between cars over time — see who's closing in or pulling away",
    "strategy": "Pit stop strategy and stint timelines for each car throughout the race",
    "progression": "How positions changed throughout the race, hour by hour",
    "race-control": "Flags, penalties, and incidents reported during the session",
    "fingerprint": "Circuit performance characteristics based on layout geometry",
  };

  return (
    <TooltipProvider delayDuration={200}>
    <div className="mt-6" data-session-bottom-tabs>
      {/* Manila folder tabs */}
      <div className="flex items-end gap-0.5">
        {tabs.map(tab => {
          const isActive = tab.id === resolvedTab;
          return (
            <div key={tab.id} className="flex items-center">
              <button
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
              {tabHelpText[tab.id] && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground/40 hover:text-muted-foreground cursor-help -ml-1 mr-1" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px]">
                    <p className="text-xs">{tabHelpText[tab.id]}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
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
              parentSessionId={parentSessionId}
              seasonClasses={seasonClasses}
            />
          </div>
        )}

        {resolvedTab === "strategy" && (
          <div className="p-5">
            <StrategyTimeline sessionId={session.id} teamNameMap={teamNameMap} isMulticlass={isMulticlass} seasonClasses={seasonClasses} />
          </div>
        )}

        {resolvedTab === "time-delta" && (
          <div className="p-5">
            <ClassTimeDelta sessionId={session.id} teamNameMap={teamNameMap} isMulticlass={isMulticlass} seasonClasses={seasonClasses} />
          </div>
        )}
      </div>
    </div>
    </TooltipProvider>
  );
}
