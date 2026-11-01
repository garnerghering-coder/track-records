import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowDown, HelpCircle } from "lucide-react";
import FlagImage from "@/components/FlagImage";
import { computeTrackMetrics, categoryHexColor } from "@/lib/track-calculations";
import StrategyTimeline from "@/components/StrategyTimeline";
import PositionProgressionChart from "@/components/PositionProgressionChart";
import ClassTimeDelta from "@/components/ClassTimeDelta";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ClassBadge, Pos } from "@/components/tr/primitives";
import { WeatherIcons } from "@/components/WeatherBubble";
import { getClassColor } from "@/lib/classes";
import { segItem, segWrap } from "@/components/event-ui";

// ── Types ────────────────────────────────────────────────────────────

interface WinnerEntry {
  position: number;
  car_number: string | null;
  gap_to_leader: string | null;
  team_id: string | null;
  teamName: string;
  carName: string | null;
  className: string;
  drivers: { id: string | null; name: string; nationality: string | null }[];
  liveryUrl: string | null;
  laps_completed: number | null;
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
  seasonClasses?: { class_name: string; color: string; sort_order: number }[];
}

// ── Panel header ─────────────────────────────────────────────────────

function PanelHead({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex min-h-[40px] items-center justify-between gap-3 border-b px-4 py-2">
      <div className="label-caps flex min-w-0 items-center gap-2">{title}</div>
      {right}
    </div>
  );
}

// ── Weather Card ─────────────────────────────────────────────────────

function WeatherCard({ weather }: { weather: any }) {
  if (!weather) return null;
  const range = (a: number | null, b: number | null) => (a != null && b != null && a !== b ? `${a}–${b}` : `${a ?? b}`);
  const stats: { label: string; value: ReactNode }[] = [];
  if (weather.air_temp_min != null || weather.air_temp_max != null) stats.push({ label: "Air °C", value: range(weather.air_temp_min, weather.air_temp_max) });
  if (weather.track_temp_min != null || weather.track_temp_max != null)
    stats.push({ label: "Track °C", value: range(weather.track_temp_min, weather.track_temp_max) });
  if (weather.rain_mm != null && weather.rain_mm > 0) stats.push({ label: "Rain mm", value: weather.rain_mm });
  return (
    <div className="flex h-full flex-col rounded border bg-card">
      <PanelHead title="Race weather" right={<WeatherIcons weather={weather} size={15} className="text-muted-foreground" />} />
      <div className="flex-1 px-4 py-3">
        <p className="font-display text-base font-semibold uppercase leading-tight tracking-wide text-foreground">{weather.condition_summary || "No data"}</p>
        {stats.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="label-caps text-[10px]">{s.label}</div>
                <div className="num text-sm text-foreground">{s.value}</div>
              </div>
            ))}
          </div>
        )}
        {(weather.wind_summary || weather.rain_detail) && (
          <p className="mt-2 text-xs text-muted-foreground">
            {weather.wind_summary && (
              <>
                <span className="label-caps mr-1.5 text-[10px]">Wind</span>
                {weather.wind_summary}
              </>
            )}
            {weather.wind_summary && weather.rain_detail && " · "}
            {weather.rain_detail}
          </p>
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
    <div className="flex h-full flex-col rounded border bg-card">
      <PanelHead
        title={
          <>
            Race control <span className="num normal-case tracking-normal text-foreground">{items.length}</span>
          </>
        }
      />
      <div className="max-h-36 flex-1 divide-y overflow-y-auto">
        {items.map((item: any) => (
          <div key={item.id} className="px-4 py-1.5 text-xs text-muted-foreground" style={{ boxShadow: `inset 3px 0 0 ${item.color || "hsl(var(--border))"}` }}>
            {item.description}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Winner row ───────────────────────────────────────────────────────

function WinnerRow({ entry, showGap, lead, classColor }: { entry: WinnerEntry; showGap?: boolean; lead?: ReactNode; classColor?: string }) {
  const isWinner = entry.position === 1;
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:gap-4">
      <div className={`flex shrink-0 items-center ${lead ? "w-[4.5rem]" : "w-8"}`}>{lead ?? <Pos value={entry.position} />}</div>

      <div className="min-w-0">
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {entry.drivers.map((d, i) => (
            <span key={i} className={`inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-foreground ${isWinner ? "text-[15px]" : "text-sm"}`}>
              <FlagImage nationality={d.nationality} size={14} />
              {d.id ? (
                <Link to={`/driver/${d.id}`} className="transition-colors hover:text-primary">
                  {d.name}
                </Link>
              ) : (
                d.name
              )}
            </span>
          ))}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {entry.car_number && <span className="num shrink-0 font-semibold text-foreground">#{entry.car_number}</span>}
          {entry.team_id ? (
            <Link to={`/team/${entry.team_id}`} className="truncate transition-colors hover:text-foreground">
              {entry.teamName}
            </Link>
          ) : (
            <span className="truncate">{entry.teamName}</span>
          )}
          {entry.carName && <span className="hidden truncate text-muted-foreground/70 xl:inline">· {entry.carName}</span>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className={`hidden shrink-0 sm:block ${isWinner ? "w-[170px] xl:w-[200px]" : "w-[130px] xl:w-[150px]"}`}>
          {entry.liveryUrl ? (
            <img
              src={entry.liveryUrl}
              alt={`#${entry.car_number}`}
              loading="lazy"
              className="h-auto w-full object-contain"
              style={{ aspectRatio: "922/235" }}
            />
          ) : (
            <div
              className="flex w-full items-center justify-center rounded-sm border border-dashed"
              style={{ aspectRatio: "922/235", borderColor: classColor ? `${classColor}55` : undefined }}
            >
              <span className="num text-[11px] text-muted-foreground">#{entry.car_number || "?"}</span>
            </div>
          )}
        </div>
        <div className="min-w-[3.5rem] text-right">
          {entry.laps_completed != null && (
            <div className="num text-xs text-foreground">
              {entry.laps_completed}
              <span className="ml-1 text-muted-foreground">L</span>
            </div>
          )}
          {showGap && entry.gap_to_leader && entry.position > 1 && <div className="num text-[11px] text-muted-foreground">{entry.gap_to_leader}</div>}
        </div>
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
  seasonClasses,
}: {
  raceSession: any;
  hourSessions: any[];
  teamNameMap: Record<string, string>;
  isMulticlass: boolean;
  seasonClasses?: { class_name: string; color: string; sort_order: number }[];
}) {
  const hasHours = hourSessions.length > 0;

  // Check for lap timing data for time delta / progression charts
  const { data: hasLapTimes = false } = useQuery({
    queryKey: ["hero_lap_times_check", raceSession?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("v2_lap_times" as any)
        .select("id", { count: "exact", head: true })
        .eq("session_id", raceSession.id);
      return (count || 0) > 0;
    },
    enabled: !!raceSession?.id,
  });

  // Check for stint data (strategy tab)
  const { data: hasStints = false } = useQuery({
    queryKey: ["hero_stints_check", raceSession?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("v2_stints" as any)
        .select("id", { count: "exact", head: true })
        .eq("session_id", raceSession.id);
      return (count || 0) > 0;
    },
    enabled: !!raceSession?.id,
  });

  const hasProgression = hasHours || hasLapTimes;

  const helpText: Record<string, string> = {
    "time-delta": "Gap between cars over time — see who's closing in or pulling away",
    strategy: "Pit stop strategy and stint timelines for each car",
    progression: "Position changes throughout the race",
  };

  const tabs = useMemo(
    () => [...(hasLapTimes ? ["time-delta"] : []), ...(hasStints ? ["strategy"] : []), ...(hasProgression ? ["progression"] : [])],
    [hasHours, hasLapTimes, hasStints, hasProgression],
  );

  const [activeVizTab, setActiveVizTab] = useState<string>("");
  const [userInteracted, setUserInteracted] = useState(false);

  // Set initial tab
  const resolvedVizTab = activeVizTab && tabs.includes(activeVizTab) ? activeVizTab : tabs[0] || "strategy";

  useEffect(() => {
    if (userInteracted || tabs.length < 2) return;
    const interval = setInterval(() => {
      setActiveVizTab((prev) => {
        const current = prev && tabs.includes(prev) ? prev : tabs[0];
        const idx = tabs.indexOf(current);
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
    const el = document.querySelector("[data-session-bottom-tabs]");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const tabLabel = (tab: string) => {
    if (tab === "strategy") return "Strategy";
    if (tab === "time-delta") return "Time Delta";
    if (tab === "progression") return "Progression";
    return tab;
  };

  if (tabs.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-hidden rounded border bg-card">
        <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
          <div className="flex min-w-0 items-center overflow-x-auto" role="tablist">
            {tabs.map((tab) => {
              const active = resolvedVizTab === tab;
              return (
                <div key={tab} className="flex shrink-0 items-center">
                  <button
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleTabClick(tab)}
                    className={`relative h-8 px-2.5 font-display text-xs font-semibold uppercase tracking-[0.1em] transition-colors ${
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tabLabel(tab)}
                    <span className={`absolute inset-x-2.5 -bottom-1.5 h-0.5 ${active ? "bg-signal" : "bg-transparent"}`} />
                  </button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="mr-1 h-3 w-3 cursor-help text-muted-foreground/50 hover:text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[200px]">
                      <p className="text-xs">{helpText[tab]}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
          </div>
          <button
            onClick={scrollToFull}
            className="inline-flex shrink-0 items-center gap-1 px-2 font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
            title="Jump to the full-size charts"
          >
            Full <ArrowDown className="h-3 w-3" />
          </button>
        </div>
        <div className="relative h-[280px] overflow-hidden">
          {resolvedVizTab === "strategy" && (
            <div className="h-full">
              <StrategyTimeline sessionId={raceSession.id} teamNameMap={teamNameMap} isMulticlass={isMulticlass} compact seasonClasses={seasonClasses} />
            </div>
          )}
          {resolvedVizTab === "time-delta" && hasLapTimes && (
            <div className="h-full px-1 pt-2">
              <ClassTimeDelta sessionId={raceSession.id} teamNameMap={teamNameMap} isMulticlass={isMulticlass} compact seasonClasses={seasonClasses} />
            </div>
          )}
          {resolvedVizTab === "progression" && hasProgression && (
            <div className="h-full">
              <PositionProgressionChart
                hourSessions={hourSessions}
                teamNameMap={teamNameMap}
                isMulticlass={isMulticlass}
                compact
                seasonClasses={seasonClasses}
                parentSessionId={raceSession.id}
              />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
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
  seasonClasses,
}: EventHeroDashboardProps) {
  const seasonId = (event as any)?.v2_seasons?.id;

  // Detect multiple race sessions (not endurance hour sub-sessions)
  const raceSessions = useMemo(() => {
    return sessions.filter((s: any) => s.session_type === "race" || s.session_type === "sprint_race" || s.session_type === "endurance_race");
  }, [sessions]);

  const [selectedRaceIdx, setSelectedRaceIdx] = useState(0);
  const activeRaceSession = raceSessions.length > 0 ? raceSessions[selectedRaceIdx] || raceSessions[0] : raceSession;

  const isEndurance = activeRaceSession?.session_type === "endurance_race";
  const activeHourSessions = useMemo(() => {
    if (!isEndurance || !activeRaceSession) return [];
    return allSessions.filter((s: any) => (s as any).parent_session_id === activeRaceSession.id).sort((a: any, b: any) => a.sort_order - b.sort_order);
  }, [isEndurance, activeRaceSession, allSessions]);

  const resultsSessionId = isEndurance && activeHourSessions.length > 0 ? activeHourSessions[activeHourSessions.length - 1].id : activeRaceSession?.id;

  // Fetch position data from last hour session (1 driver per car)
  const { data: raceResults = [] } = useQuery({
    queryKey: ["hero_race_results", resultsSessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_race_results" as any)
        .select("*, v2_drivers(id, full_name, nationality), v2_teams(id, full_name, short_name), v2_cars(id, model_name, manufacturer)")
        .eq("session_id", resultsSessionId)
        .order("position");
      return (data || []) as any[];
    },
    enabled: !!resultsSessionId,
  });

  const enduranceDriverSessionId = isEndurance ? activeRaceSession?.id : null;
  const { data: enduranceDrivers = [] } = useQuery({
    queryKey: ["hero_endurance_drivers", enduranceDriverSessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_race_results" as any)
        .select("car_number, v2_drivers(id, full_name, nationality)")
        .eq("session_id", enduranceDriverSessionId);
      return (data || []) as any[];
    },
    enabled: !!enduranceDriverSessionId,
  });

  // Build a map of car_number -> all drivers (for endurance)
  const enduranceDriverMap = useMemo(() => {
    const m: Record<string, { id: string | null; name: string; nationality: string | null }[]> = {};
    for (const row of enduranceDrivers) {
      if (!row.car_number || !row.v2_drivers) continue;
      if (!m[row.car_number]) m[row.car_number] = [];
      const driver = { id: row.v2_drivers.id, name: row.v2_drivers.full_name, nationality: row.v2_drivers.nationality };
      // Avoid duplicates
      if (!m[row.car_number].some((d: any) => d.id === driver.id)) {
        m[row.car_number].push(driver);
      }
    }
    return m;
  }, [enduranceDrivers]);

  const { data: liveries = [] } = useQuery({
    queryKey: ["car_liveries", seasonId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v2_car_liveries" as any)
        .select("*")
        .eq("season_id", seasonId);
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
        const carName = r.v2_cars ? (r.v2_cars.manufacturer ? `${r.v2_cars.manufacturer} ${r.v2_cars.model_name}` : r.v2_cars.model_name) : null;
        // Use endurance driver map if available, otherwise fallback to single driver from results
        const drivers =
          r.car_number && enduranceDriverMap[r.car_number]?.length > 0
            ? enduranceDriverMap[r.car_number]
            : [{ id: r.v2_drivers?.id, name: r.v2_drivers?.full_name, nationality: r.v2_drivers?.nationality }];
        entries.push({
          position: i + 1,
          car_number: r.car_number,
          gap_to_leader: r.gap_to_leader,
          team_id: teamId,
          teamName,
          carName,
          className: cls,
          drivers,
          liveryUrl: r.car_number ? liveryMap[r.car_number] || null : null,
          laps_completed: r.laps_completed ?? null,
        });
      }
    }
    return entries;
  }, [raceResults, liveryMap, teamNameMap, enduranceDriverMap]);

  // Layout/fingerprint
  const layoutId = activeRaceSession?.layout_id || event?.layout_id;
  const layoutData = layout && Array.isArray(layout) ? layout.find((l: any) => l.id === layoutId) || (layout.length === 1 ? layout[0] : null) : null;
  const trackMetrics = layoutData
    ? computeTrackMetrics(
        layoutData.length_km ? Number(layoutData.length_km) : null,
        layoutData.turns,
        layoutData.total_straight_length_km ? Number(layoutData.total_straight_length_km) : null,
        layoutData.total_elevation_change_m ? Number(layoutData.total_elevation_change_m) : null,
        layoutData.heavy_braking_corners,
      )
    : null;
  const hasFingerprint = trackMetrics && (trackMetrics.tcs100 != null || trackMetrics.ei != null || trackMetrics.csi != null);

  const raceWeather = activeRaceSession ? weatherMap[activeRaceSession.id] || null : null;
  const raceAnnotations = annotationSections.filter((s: any) => (s.v2_annotation_items || []).length > 0);

  const classNames = [...new Set(winners.map((w) => w.className))];
  const showTop3 = classNames.length <= 2;

  // Early return AFTER all hooks
  if (!activeRaceSession) return null;
  if (winners.length === 0 && !hasFingerprint && !raceWeather) return null;

  const classColorMap: Record<string, string> = {};
  for (const sc of seasonClasses || []) if (sc?.class_name && sc?.color) classColorMap[sc.class_name] = sc.color;
  const realClasses = classNames.filter((c) => c !== "Overall");
  const fingerprintStats = trackMetrics
    ? ([
        {
          key: "tdi",
          label: "Demand",
          value: trackMetrics.tdi,
          cat: trackMetrics.tdiCategory,
          help: "Overall difficulty (0–100). Higher = more demanding on car and driver.",
        },
        {
          key: "tcs",
          label: "Character",
          value: trackMetrics.tcs100,
          cat: trackMetrics.tcsCategory,
          help: "Layout style (0–100). Low = tight corners. High = long straights.",
        },
        {
          key: "ei",
          label: "Elevation",
          value: trackMetrics.ei,
          cat: trackMetrics.eiCategory,
          help: "Altitude change (0–100). Higher = hillier terrain with more climbs and descents.",
        },
        {
          key: "csi",
          label: "Braking",
          value: trackMetrics.csi,
          cat: trackMetrics.csiCategory,
          help: "Braking intensity (0–100). What % of corners need heavy braking.",
        },
      ].filter((m) => m.value != null && m.cat) as { key: string; label: string; value: number; cat: string; help: string }[])
    : [];

  return (
    <section className="container py-6 md:py-8">
      <div
        className={`grid items-start gap-4 ${winners.length > 0 || raceWeather || raceAnnotations.length > 0 ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" : ""}`}
      >
        {/* LEFT — Winners / podium + conditions */}
        {winners.length > 0 || raceWeather || raceAnnotations.length > 0 ? (
          <div className="grid min-w-0 content-start gap-4">
            {winners.length > 0 && (
              <div className="overflow-hidden rounded border bg-card">
                <PanelHead
                  title={
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-signal" />
                      <span>{showTop3 ? "Podium" : "Class winners"}</span>
                  {showTop3 && realClasses.length === 1 && <ClassBadge name={realClasses[0]} color={getClassColor(realClasses[0], classColorMap)} />}
                      <span aria-hidden>·</span>
                      <span className="truncate text-foreground">{activeRaceSession.name}</span>
                    </>
                  }
                  right={
                    raceSessions.length > 1 && (
                      <div className={segWrap}>
                        {raceSessions.map((rs: any, idx: number) => (
                          <button key={rs.id} onClick={() => setSelectedRaceIdx(idx)} className={segItem(idx === selectedRaceIdx)}>
                            {rs.name}
                          </button>
                        ))}
                      </div>
                    )
                  }
                />
                <div className="divide-y">
                  {classNames.map((cls) => {
                    const color = cls === "Overall" ? undefined : getClassColor(cls, classColorMap);
                    const rows = winners.filter((w) => w.className === cls);
                    if (showTop3) {
                      return (
                        <div key={cls}>
                          {realClasses.length > 1 && cls !== "Overall" && (
                            <div className="flex items-center gap-2 border-b bg-background/40 px-4 py-1.5">
                              <ClassBadge name={cls} color={color} />
                              <span className="label-caps">Podium</span>
                            </div>
                          )}
                          <div className="divide-y">
                            {rows.map((w, i) => (
                              <WinnerRow key={`${cls}-${i}`} entry={w} showGap classColor={color} />
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return rows.map((w, i) => (
                      <WinnerRow
                        key={`${cls}-${i}`}
                        entry={w}
                        classColor={color}
                        lead={cls === "Overall" ? <span className="label-caps">Winner</span> : <ClassBadge name={cls} color={color} />}
                      />
                    ));
                  })}
                </div>
              </div>
            )}
            {(raceWeather || raceAnnotations.length > 0) && (
              <div className={`grid gap-4 ${raceWeather && raceAnnotations.length > 0 ? "sm:grid-cols-[2fr_3fr]" : "grid-cols-1"}`}>
                {raceWeather && <WeatherCard weather={raceWeather} />}
                {raceAnnotations.length > 0 && <RaceControlMini sections={raceAnnotations} />}
              </div>
            )}
          </div>
        ) : null}

        {/* RIGHT — Analysis, circuit, conditions */}
        <div className="grid min-w-0 content-start gap-4">
          <MiniVisualization
            raceSession={activeRaceSession}
            hourSessions={activeHourSessions}
            teamNameMap={teamNameMap}
            isMulticlass={isMulticlass}
            seasonClasses={seasonClasses}
          />

          {hasFingerprint && layoutData && trackMetrics && (
            <TooltipProvider delayDuration={200}>
              <div className="overflow-hidden rounded border bg-card">
                <PanelHead
                  title="Circuit"
                  right={
                    <span className="num truncate text-[11px] text-muted-foreground">
                      {layoutData.length_km && <>{Number(layoutData.length_km).toFixed(3)} km</>}
                      {layoutData.length_km && layoutData.turns != null && " · "}
                      {layoutData.turns != null && <>{layoutData.turns} turns</>}
                    </span>
                  }
                />
                <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-px bg-border sm:grid-cols-[132px_minmax(0,1fr)]">
                  <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-card p-3">
                    {layoutData.layout_image_url && (
                      <img
                        src={layoutData.layout_image_url}
                        alt={layoutData.name ? `${layoutData.name} layout` : "Circuit layout"}
                        className="logo-adapt h-auto w-full max-w-[110px] object-contain"
                      />
                    )}
                    {layoutData.name && <span className="text-center text-[11px] leading-tight text-muted-foreground">{layoutData.name}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                    {fingerprintStats.map((m) => (
                      <Tooltip key={m.key}>
                        <TooltipTrigger asChild>
                          <div className="cursor-default bg-card px-3 py-2.5">
                            <div className="label-caps text-[10px]">{m.label}</div>
                            <div className="mt-1 font-accent text-2xl leading-none text-foreground">{Math.round(m.value)}</div>
                            <div className="mt-2 h-[3px] w-full bg-muted">
                              <div className="h-full" style={{ width: `${Math.max(2, Math.min(100, m.value))}%`, backgroundColor: categoryHexColor(m.cat) }} />
                            </div>
                            <div className="mt-1 truncate text-[11px] text-muted-foreground">{m.cat}</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[240px]">
                          <p className="text-xs font-medium">{m.cat}</p>
                          <p className="text-[11px] text-muted-foreground">{m.help}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              </div>
            </TooltipProvider>
          )}
        </div>
      </div>
    </section>
  );
}
