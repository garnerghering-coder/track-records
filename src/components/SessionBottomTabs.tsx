import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { chip } from "@/components/event-ui";
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
  const [searchQuery, setSearchQuery] = useState("");

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
    <div>
      {/* Search + Filter chips */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages…"
            className="h-8 w-full rounded-sm border bg-background pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/40 focus:outline-none"
          />
        </div>
        {availableFilters.size > 1 &&
          (["flags", "penalties", "incidents"] as RaceControlFilter[])
            .filter((f) => availableFilters.has(f))
            .map((f) => (
              <button key={f} type="button" onClick={() => toggleFilter(f)} className={chip(activeFilters.has(f))}>
                {filterLabels[f].label}
              </button>
            ))}
      </div>

      {/* Items — scrollable compact list */}
      <div className="max-h-[420px] overflow-y-auto">
        {classifiedSections.map((section: any) => {
          const lowerSearch = searchQuery.toLowerCase();
          const filteredItems = section._classifiedItems.filter((item: any) => {
            const matchFilter = showAll || activeFilters.has(item._category);
            const matchSearch = !searchQuery || (item.description || "").toLowerCase().includes(lowerSearch);
            return matchFilter && matchSearch;
          });
          if (filteredItems.length === 0) return null;
          return (
            <div key={section.id}>
              {classifiedSections.length > 1 && (
                <div className="label-caps sticky top-0 z-10 border-b bg-card px-4 py-1.5">{section.title}</div>
              )}
              <div className="divide-y">
                {filteredItems.map((item: any) => (
                  <div
                    key={item.id}
                    className="px-4 py-2 text-[13px] text-muted-foreground"
                    style={{ boxShadow: `inset 3px 0 0 ${item.color || "hsl(var(--border))"}` }}
                  >
                    {item.description}
                  </div>
                ))}
              </div>
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
        layoutData.length_km,
        layoutData.turns,
        layoutData.total_straight_length_km,
        layoutData.total_elevation_change_m,
        layoutData.heavy_braking_corners
      )
    : null;
  const hasFingerprint = trackMetrics && (trackMetrics.tcs100 != null || trackMetrics.ei != null || trackMetrics.csi != null);
  // Race Control (annotation sections)
  const raceControlSections = annotationSections.filter((s: any) => {
    const items = s.v2_annotation_items || [];
    return items.length > 0;
  });

  // Position Progression (computed below after lapTimeCount query)

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

  // Position Progression (endurance with hour sessions OR any session with lap time data)
  const hasProgression = (hourSessions && hourSessions.length > 0) || lapTimeCount > 0;

  // Build tabs in desired order: Time Delta, Strategy, Progression, Race Control, Fingerprint
  if (lapTimeCount > 0) tabs.push({ id: "time-delta", label: "Time delta" });
  if (stintCount > 0) tabs.push({ id: "strategy", label: "Strategy" });
  if (hasProgression) tabs.push({ id: "progression", label: "Progression" });
  if (raceControlSections.length > 0) tabs.push({ id: "race-control", label: "Race control" });
  if (hasFingerprint) tabs.push({ id: "fingerprint", label: "Circuit fingerprint" });

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
      <section className="scroll-mt-32" data-session-bottom-tabs>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <div className="label-caps mb-1">Beyond the classification</div>
            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-foreground">Session analysis</h2>
          </div>
        </div>
        <div className="overflow-hidden rounded border bg-card">
          {/* Tab strip */}
          <div className="flex overflow-x-auto border-b bg-background/40 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
            {tabs.map((tab) => {
              const isActive = tab.id === resolvedTab;
              return (
                <div key={tab.id} className={`relative flex shrink-0 items-center border-r ${isActive ? "bg-card" : ""}`}>
                  <button
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`h-11 pl-4 pr-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                  {tabHelpText[tab.id] && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="mr-3 inline-flex">
                          <HelpCircle className="h-3 w-3 cursor-help text-muted-foreground/40 hover:text-muted-foreground" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px]">
                        <p className="text-xs">{tabHelpText[tab.id]}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <span className={`absolute inset-x-0 top-0 h-0.5 ${isActive ? "bg-signal" : "bg-transparent"}`} />
                </div>
              );
            })}
          </div>

          {/* Content */}
          {resolvedTab === "fingerprint" && hasFingerprint && layoutData && trackMetrics && (
            <div className="p-4 sm:p-5">
              <TrackFingerprint
                metrics={trackMetrics}
                layoutImageUrl={layoutData.layout_image_url}
                layoutName={layoutData.name}
                lengthKm={layoutData.length_km}
                turns={layoutData.turns}
              />
            </div>
          )}

          {resolvedTab === "race-control" && <RaceControlContent sections={raceControlSections} />}

          {resolvedTab === "progression" && hasProgression && (
            <div className="p-4 sm:p-5">
              <PositionProgressionChart
                hourSessions={hourSessions || []}
                teamNameMap={teamNameMap}
                activeHourId={activeHourId}
                isMulticlass={isMulticlass}
                parentSessionId={parentSessionId || session.id}
                seasonClasses={seasonClasses}
              />
            </div>
          )}

          {resolvedTab === "strategy" && (
            <div className="p-4 sm:p-5">
              <StrategyTimeline sessionId={session.id} teamNameMap={teamNameMap} isMulticlass={isMulticlass} seasonClasses={seasonClasses} />
            </div>
          )}

          {resolvedTab === "time-delta" && (
            <div className="p-4 sm:p-5">
              <ClassTimeDelta sessionId={session.id} teamNameMap={teamNameMap} isMulticlass={isMulticlass} seasonClasses={seasonClasses} />
            </div>
          )}
        </div>
      </section>
    </TooltipProvider>
  );
}
