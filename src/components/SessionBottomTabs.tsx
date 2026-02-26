import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
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
      <div className="rounded-lg rounded-tl-none border border-border bg-card overflow-hidden" style={{ minHeight: "340px" }}>
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
          <ScrollArea className="h-[340px]">
            <div className="p-5 space-y-4">
              {raceControlSections.map((section: any) => {
                const items = (section.v2_annotation_items || []).sort((a: any, b: any) => a.sort_order - b.sort_order);
                return (
                  <div key={section.id} className="space-y-1">
                    {raceControlSections.length > 1 && (
                      <h4 className="text-xs font-semibold text-muted-foreground mb-1">{section.title}</h4>
                    )}
                    {items.map((item: any) => (
                      <div key={item.id} className="text-xs text-muted-foreground border-l-2 pl-3 py-1" style={{ borderColor: item.color }}>
                        {item.description}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
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
      </div>
    </div>
  );
}
