import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Maximize2 } from "lucide-react";
import FlagImage from "@/components/FlagImage";
import { computeTrackMetrics, categoryHexColor } from "@/lib/track-calculations";
import StrategyTimeline from "@/components/StrategyTimeline";
import PositionProgressionChart from "@/components/PositionProgressionChart";

// ── Types ────────────────────────────────────────────────────────────

interface WinnerEntry {
  position: number;
  car_number: string | null;
  gap_to_leader: string | null;
  team_id: string | null;
  teamName: string;
  className: string;
  drivers: { id: string | null; name: string; nationality: string | null }[];
  liveryUrl: string | null;
}

interface EventHeroDashboardProps {
  event: any;
  sessions: any[];
  allSessions: any[];
  hourSessions: any[];
  teamNameMap: Record<string, string>;
  weatherMap: Record<string, any>;
  isMulticlass: boolean;
  layout: any;
  raceSession: any | null;
  annotationSections: any[];
}

// ── Weather Card ─────────────────────────────────────────────────────

function WeatherCard({ weather }: { weather: any }) {
  if (!weather) return null;
  const emoji = weather.condition_emoji || "🌤️";
  return (
    <div className="rounded-lg border border-border bg-card p-4 h-full">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Weather</h4>
      <div className="space-y-1.5 text-sm">
        <p>
          <span className="mr-1.5">{emoji}</span>
          <span className="text-foreground font-medium">{weather.condition_summary || "No data"}</span>
        </p>
        {(weather.air_temp_min != null || weather.air_temp_max != null) && (
          <p className="text-muted-foreground text-xs">Air: {weather.air_temp_min}–{weather.air_temp_max} °C</p>
        )}
        {(weather.track_temp_min != null || weather.track_temp_max != null) && (
          <p className="text-muted-foreground text-xs">Track: {weather.track_temp_min}–{weather.track_temp_max} °C</p>
        )}
        {weather.rain_mm != null && weather.rain_mm > 0 && (
          <p className="text-muted-foreground text-xs">Rain: {weather.rain_mm} mm{weather.rain_detail ? ` (${weather.rain_detail})` : ""}</p>
        )}
        {weather.wind_summary && (
          <p className="text-muted-foreground text-xs">Wind: {weather.wind_summary}</p>
        )}
      </div>
    </div>
  );
}

// ── Race Control Mini ────────────────────────────────────────────────

function RaceControlMini({ sections }: { sections: any[] }) {
  const items = useMemo(() => {
    const all: any[] = [];
    for (const s of sections) {
      for (const item of (s.v2_annotation_items || []).sort((a: any, b: any) => a.sort_order - b.sort_order)) {
        all.push(item);
      }
    }
    return all;
  }, [sections]);

  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 h-full flex flex-col">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Race Control</h4>
      <div className="flex-1 max-h-32 overflow-y-auto space-y-0.5 pr-1">
        {items.map((item: any) => (
          <div key={item.id} className="text-[11px] text-muted-foreground border-l-2 pl-2 py-0.5" style={{ borderColor: item.color }}>
            {item.description}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Winner Card ──────────────────────────────────────────────────────

function WinnerCard({ entry, showGap, showPosition }: { entry: WinnerEntry; showGap?: boolean; showPosition?: boolean }) {
  const posLabel = entry.position === 1 ? "Winner" : `P${entry.position}`;

  return (
    <div className="flex items-center gap-4 py-2.5">
      <div className="shrink-0 w-8 text-center">
        {showPosition ? (
          <span className="text-lg font-bold text-foreground">{entry.position}</span>
        ) : (
          <span className="text-xs font-semibold text-primary uppercase">{posLabel}</span>
        )}
      </div>

      <div className="shrink-0 w-[200px]">
        {entry.liveryUrl ? (
          <img
            src={entry.liveryUrl}
            alt={`#${entry.car_number}`}
            className="w-full h-auto object-contain"
            style={{ aspectRatio: "922/235" }}
          />
        ) : (
          <div
            className="w-full bg-muted/30 border border-border rounded flex items-center justify-center"
            style={{ aspectRatio: "922/235" }}
          >
            <span className="text-xs text-muted-foreground font-mono">#{entry.car_number || "?"}</span>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-col gap-0.5">
          {entry.drivers.map((d, i) => (
            <span key={i} className="text-sm font-medium text-foreground whitespace-nowrap flex items-center gap-1">
              <FlagImage nationality={d.nationality} size={14} />
              {d.id ? (
                <Link to={`/driver/${d.id}`} className="hover:text-primary transition-colors">{d.name}</Link>
              ) : d.name}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          {entry.car_number && <span className="font-mono">#{entry.car_number}</span>}
          {entry.team_id ? (
            <Link to={`/team/${entry.team_id}`} className="hover:text-primary transition-colors">{entry.teamName}</Link>
          ) : (
            <span>{entry.teamName}</span>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <span className="text-xs font-semibold text-muted-foreground">{entry.className}</span>
        {showGap && entry.gap_to_leader && entry.position > 1 && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{entry.gap_to_leader}</p>
        )}
      </div>
    </div>
  );
}

// ── Mini Timeline/Progression tabs ───────────────────────────────────

function MiniVisualization({
  raceSession,
  hourSessions,
  teamNameMap,
  isMulticlass,
}: {
  raceSession: any;
  hourSessions: any[];
  teamNameMap: Record<string, string>;
  isMulticlass: boolean;
}) {
  const hasHours = hourSessions.length > 0;
  const tabs = useMemo(() => ["strategy", ...(hasHours ? ["progression"] : [])], [hasHours]);
  const [activeVizTab, setActiveVizTab] = useState<string>("strategy");
  const [userInteracted, setUserInteracted] = useState(false);

  useEffect(() => {
    if (userInteracted || tabs.length < 2) return;
    const interval = setInterval(() => {
      setActiveVizTab(prev => {
        const idx = tabs.indexOf(prev);
        return tabs[(idx + 1) % tabs.length];
      });
    }, 12000);
    return () => clearInterval(interval);
  }, [userInteracted, tabs]);

  const handleTabClick = (tab: string) => {
    setUserInteracted(true);
    setActiveVizTab(tab);
  };

  const scrollToFull = () => {
    const el = document.querySelector('[data-session-bottom-tabs]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex gap-0.5">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => handleTabClick(tab)}
              className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors ${
                activeVizTab === tab
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "strategy" ? "Strategy Timeline" : "Position Progression"}
            </button>
          ))}
        </div>
        <button onClick={scrollToFull} className="text-muted-foreground hover:text-foreground transition-colors" title="View full size">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="h-[280px] overflow-hidden relative">
        {activeVizTab === "strategy" && (
          <div className="h-full">
            <StrategyTimeline sessionId={raceSession.id} teamNameMap={teamNameMap} isMulticlass={isMulticlass} compact />
          </div>
        )}
        {activeVizTab === "progression" && hasHours && (
          <div className="h-full">
            <PositionProgressionChart hourSessions={hourSessions} teamNameMap={teamNameMap} isMulticlass={isMulticlass} compact />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export default function EventHeroDashboard({
  event,
  sessions,
  allSessions,
  hourSessions,
  teamNameMap,
  weatherMap,
  isMulticlass,
  layout,
  raceSession,
  annotationSections,
}: EventHeroDashboardProps) {
  const seasonId = (event as any)?.v2_seasons?.id;
  const isEndurance = raceSession?.session_type === "endurance_race";
  const resultsSessionId = isEndurance && hourSessions.length > 0
    ? hourSessions[hourSessions.length - 1].id
    : raceSession?.id;

  const { data: raceResults = [] } = useQuery({
    queryKey: ["hero_race_results", resultsSessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_race_results" as any)
        .select("*, v2_drivers(id, full_name, nationality), v2_teams(id, full_name, short_name)")
        .eq("session_id", resultsSessionId)
        .order("position");
      const grouped = new Map<string, any>();
      for (const row of (data || []) as any[]) {
        const key = row.car_number ? `${row.car_number}-${row.position}` : row.id;
        if (grouped.has(key)) {
          const existing = grouped.get(key);
          if (!existing._drivers) existing._drivers = [{ id: existing.v2_drivers?.id, name: existing.v2_drivers?.full_name, nationality: existing.v2_drivers?.nationality }];
          existing._drivers.push({ id: row.v2_drivers?.id, name: row.v2_drivers?.full_name, nationality: row.v2_drivers?.nationality });
        } else {
          grouped.set(key, { ...row, _drivers: [{ id: row.v2_drivers?.id, name: row.v2_drivers?.full_name, nationality: row.v2_drivers?.nationality }] });
        }
      }
      return [...grouped.values()];
    },
    enabled: !!resultsSessionId,
  });

  const { data: liveries = [] } = useQuery({
    queryKey: ["car_liveries", seasonId],
    queryFn: async () => {
      const { data } = await supabase.from("v2_car_liveries" as any).select("*").eq("season_id", seasonId);
      return (data || []) as any[];
    },
    enabled: !!seasonId,
  });

  const liveryMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const l of liveries) m[l.car_number] = l.image_url;
    return m;
  }, [liveries]);

  const winners = useMemo(() => {
    if (raceResults.length === 0) return [];
    const classBuckets: Record<string, any[]> = {};
    for (const r of raceResults) {
      const cls = (r.extra_data as any)?.Class || "Overall";
      if (!classBuckets[cls]) classBuckets[cls] = [];
      classBuckets[cls].push(r);
    }
    const classNames = Object.keys(classBuckets);
    const showTop3 = classNames.length <= 2;
    const entries: WinnerEntry[] = [];
    for (const cls of classNames) {
      const sorted = classBuckets[cls].sort((a: any, b: any) => (a.position || 999) - (b.position || 999));
      const count = showTop3 ? 3 : 1;
      for (let i = 0; i < Math.min(count, sorted.length); i++) {
        const r = sorted[i];
        const teamId = r.v2_teams?.id || r.team_id;
        const teamName = teamId && teamNameMap[teamId] ? teamNameMap[teamId] : r.v2_teams?.short_name || r.v2_teams?.full_name || "—";
        entries.push({
          position: i + 1,
          car_number: r.car_number,
          gap_to_leader: r.gap_to_leader,
          team_id: teamId,
          teamName,
          className: cls,
          drivers: r._drivers || [{ id: r.v2_drivers?.id, name: r.v2_drivers?.full_name, nationality: r.v2_drivers?.nationality }],
          liveryUrl: r.car_number ? liveryMap[r.car_number] || null : null,
        });
      }
    }
    return entries;
  }, [raceResults, liveryMap, teamNameMap]);

  // Layout/fingerprint
  const layoutId = raceSession?.layout_id || event?.layout_id;
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

  const raceWeather = raceSession ? weatherMap[raceSession.id] || null : null;
  const raceAnnotations = annotationSections.filter((s: any) => (s.v2_annotation_items || []).length > 0);

  const classNames = [...new Set(winners.map(w => w.className))];
  const showTop3 = classNames.length <= 2;

  // Early return AFTER all hooks
  if (!raceSession) return null;
  if (winners.length === 0 && !hasFingerprint && !raceWeather) return null;

  return (
    <div className="border-b border-border pb-6 mb-2">
      <div className="container">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT — Winners/Podium */}
          <div className="space-y-3">
            {classNames.map(cls => (
              <div key={cls} className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  {cls} {showTop3 ? "Podium" : "Winner"}
                </h3>
                {winners
                  .filter(w => w.className === cls)
                  .map((w, i) => (
                    <WinnerCard key={`${cls}-${i}`} entry={w} showGap={showTop3} showPosition={showTop3} />
                  ))}
              </div>
            ))}
          </div>

          {/* RIGHT — Visualizations */}
          <div className="space-y-3">
            <MiniVisualization
              raceSession={raceSession}
              hourSessions={hourSessions}
              teamNameMap={teamNameMap}
              isMulticlass={isMulticlass}
            />

            {hasFingerprint && layoutData && trackMetrics && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-5">
                  {layoutData.layout_image_url && (
                    <div className="shrink-0 w-[120px]">
                      <img
                        src={layoutData.layout_image_url}
                        alt={layoutData.name ? `${layoutData.name} layout` : "Circuit layout"}
                        className="w-full h-auto object-contain"
                      />
                    </div>
                  )}
                  <div className="shrink-0">
                    {layoutData.name && (
                      <span className="font-display text-sm font-semibold text-card-foreground">{layoutData.name}</span>
                    )}
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {layoutData.length_km && <span>{Number(layoutData.length_km).toFixed(3)} km</span>}
                      {layoutData.turns != null && <span>{layoutData.turns} turns</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 ml-auto">
                    {trackMetrics.tdi != null && trackMetrics.tdiCategory && (
                      <div className="text-center">
                        <span className="font-display text-2xl font-bold" style={{ color: computeTrackMetrics ? categoryHexColor(trackMetrics.tdiCategory) : undefined }}>{Math.round(trackMetrics.tdi)}</span>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Demand</p>
                      </div>
                    )}
                    {trackMetrics.tcs100 != null && trackMetrics.tcsCategory && (
                      <div className="text-center">
                        <span className="font-display text-2xl font-bold" style={{ color: categoryHexColor(trackMetrics.tcsCategory) }}>{Math.round(trackMetrics.tcs100)}</span>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Character</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {raceWeather && <WeatherCard weather={raceWeather} />}
              {raceAnnotations.length > 0 && <RaceControlMini sections={raceAnnotations} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
