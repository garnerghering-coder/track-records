import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarDays, FileDown, FileText, Flag, Info, MapPin, Play, TriangleIcon } from "lucide-react";
import { exportEventPdf, type SessionExportData } from "@/lib/pdf-export";
import PdfExportDialog from "@/components/PdfExportDialog";
import FlagImage from "@/components/FlagImage";
import { parseTime } from "@/lib/time-calc";
import WeatherBubble from "@/components/WeatherBubble";
import SessionBottomTabs from "@/components/SessionBottomTabs";
import EventHeroDashboard from "@/components/EventHeroDashboard";
import EnduranceTimeScrubber from "@/components/EnduranceTimeScrubber";
import SessionSummaryLightbox from "@/components/SessionSummaryLightbox";
import HighlightsLightbox from "@/components/HighlightsLightbox";
import { ClassBadge, EmptyState, PageHeader, Pos, RowsSkeleton, SectionHeader } from "@/components/tr/primitives";
import { chip, toolButton } from "@/components/event-ui";
import { getClassColor, sortClasses } from "@/lib/classes";
import { formatDateRange } from "@/lib/date-utils";

export default function EventPage() {
  const { slug } = useParams();
  const [activeTab, setActiveTab] = useState<string>("");
  const [activeSubTab, setActiveSubTab] = useState<string>("race-results");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [highlightsOpen, setHighlightsOpen] = useState(false);

  const { data: event, isLoading } = useQuery({
    queryKey: ["public_event", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v2_events")
        .select("*, v2_seasons(id, year, is_multiclass, v2_series(name, short_name)), v2_circuits(name, country, layout_image_url, v2_circuit_layouts(*))")
        .eq("id", slug!)
        .eq("status", "published" as any)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const seasonId2 = (event as any)?.v2_seasons?.id;
  const isMulticlass = !!(event as any)?.v2_seasons?.is_multiclass;

  const { data: seasonClasses = [] } = useQuery({
    queryKey: ["v2_season_classes", seasonId2],
    queryFn: async () => {
      const { data } = await supabase.from("v2_season_classes" as any).select("*").eq("season_id", seasonId2).order("sort_order");
      return (data || []) as any[];
    },
    enabled: !!seasonId2 && isMulticlass,
  });

  const { data: allSessions = [] } = useQuery({
    queryKey: ["public_sessions", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v2_sessions")
        .select("*")
        .eq("event_id", slug!)
        .eq("status", "published" as any)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!event,
  });

  // Split into top-level sessions (no parent) and child sessions
  const sessions = allSessions.filter((s: any) => !(s as any).parent_session_id);
  const childSessions = allSessions.filter((s: any) => !!(s as any).parent_session_id);

  // Set initial active tab
  if (sessions.length > 0 && !activeTab) {
    setActiveTab(sessions[0].id);
  }

  // Fetch team season display names
  const seasonId = (event as any)?.v2_seasons?.id;
  const { data: teamSeasonNames = [] } = useQuery({
    queryKey: ["team_season_names", seasonId],
    queryFn: async () => {
      const { data } = await supabase.from("v2_team_season_names" as any).select("*").eq("season_id", seasonId);
      return (data || []) as any[];
    },
    enabled: !!seasonId,
  });

  const teamNameMap: Record<string, string> = {};
  for (const tsn of teamSeasonNames) {
    teamNameMap[tsn.team_id] = tsn.display_name;
  }

  // Fetch weather data
  const sessionIds = allSessions.map((s: any) => s.id);
  const { data: weatherData = [] } = useQuery({
    queryKey: ["public_weather", slug],
    queryFn: async () => {
      if (sessionIds.length === 0) return [];
      const { data } = await supabase.from("v2_session_weather" as any).select("*").in("session_id", sessionIds);
      return (data || []) as any[];
    },
    enabled: sessionIds.length > 0,
  });

  const weatherMap: Record<string, any> = {};
  for (const w of weatherData) {
    weatherMap[w.session_id] = w;
  }

  // Find the race session for the hero dashboard
  const raceSessionForHero = sessions.find((s: any) =>
    s.session_type === "race" || s.session_type === "sprint_race" || s.session_type === "endurance_race"
  );
  const heroHourSessions = raceSessionForHero?.session_type === "endurance_race"
    ? childSessions
        .filter((s: any) => (s as any).parent_session_id === raceSessionForHero.id)
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
    : [];

  // Fetch annotation sections for the race session (for hero Race Control mini)
  const { data: heroAnnotations = [] } = useQuery({
    queryKey: ["hero_annotations", raceSessionForHero?.id],
    queryFn: async () => {
      const { data } = await supabase.from("v2_annotation_sections" as any).select("*, v2_annotation_items(*)").eq("session_id", raceSessionForHero!.id).order("sort_order");
      return (data || []) as any[];
    },
    enabled: !!raceSessionForHero,
  });

  if (isLoading)
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-10">
          <div className="mb-8 h-24 animate-pulse rounded-sm bg-muted" />
          <RowsSkeleton rows={8} />
        </div>
      </div>
    );
  if (!event)
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-16">
          <EmptyState title="Event not found">This event doesn't exist or hasn't been published yet.</EmptyState>
        </div>
        <Footer />
      </div>
    );

  const seriesName = event.v2_seasons?.v2_series?.name;
  const year = event.v2_seasons?.year;
  const circuitId = (event as any).circuit_id as string | null;
  const hasHighlights = allSessions.some((s: any) => (s as any).highlights_url);

  // Get child sessions for active tab (endurance race)
  const activeSession = sessions.find((s: any) => s.id === activeTab);
  const isEndurance = activeSession?.session_type === "endurance_race";
  const hourSessions = isEndurance
    ? childSessions
        .filter((s: any) => (s as any).parent_session_id === activeTab)
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
    : [];

  const selectSession = (id: string) => {
    setActiveTab(id);
    setActiveSubTab("race-results");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        title={event.name}
        description={`${event.name} – ${seriesName || ""}${year ? ` ${year}` : ""}. View sessions, results, and weather data.`}
        canonical={`/events/${slug}`}
      />
      <Header />
      <main className="flex-1">
        {/* ── Event header ─────────────────────────────────────── */}
        <PageHeader
          kicker={
            <>
              {seriesName && <span className="text-primary">{seriesName}</span>}
              {year && (
                <>
                  <span aria-hidden>·</span>
                  <span className="num normal-case tracking-normal">{year}</span>
                </>
              )}
              {event.round_number && (
                <>
                  <span aria-hidden>·</span>
                  <span>Round {event.round_number}</span>
                </>
              )}
            </>
          }
          title={event.name}
          meta={
            <>
              {event.v2_circuits?.name && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {circuitId ? (
                      <Link to={`/circuit/${circuitId}`} className="text-foreground underline-offset-4 hover:text-primary hover:underline">
                        {event.v2_circuits.name}
                      </Link>
                    ) : (
                      <span className="text-foreground">{event.v2_circuits.name}</span>
                    )}
                    {event.v2_circuits.country && <>, {event.v2_circuits.country}</>}
                  </span>
                </span>
              )}
              {event.start_date && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                  <span className="num text-[13px]">{formatDateRange(event.start_date, event.end_date)}</span>
                </span>
              )}
              {sessions.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Flag className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="num text-foreground">{sessions.length}</span> {sessions.length === 1 ? "session" : "sessions"}
                  </span>
                </span>
              )}
            </>
          }
          actions={
            (sessions.length > 0 || hasHighlights) && (
              <>
                {sessions.length > 0 && (
                  <button type="button" className={toolButton} onClick={() => setSummaryOpen(true)}>
                    <FileText />
                    Session summary
                  </button>
                )}
                {hasHighlights && (
                  <button type="button" className={toolButton} onClick={() => setHighlightsOpen(true)}>
                    <Play />
                    Highlights
                  </button>
                )}
              </>
            )
          }
        >
          {event.description && <p className="mt-4 max-w-3xl text-sm text-muted-foreground">{event.description}</p>}
        </PageHeader>

        {/* ── Result summary + analysis ────────────────────────── */}
        <EventHeroDashboard
          event={event}
          sessions={sessions}
          allSessions={allSessions}
          hourSessions={heroHourSessions}
          teamNameMap={teamNameMap}
          weatherMap={weatherMap}
          isMulticlass={isMulticlass}
          layout={(event as any).v2_circuits?.v2_circuit_layouts}
          raceSession={raceSessionForHero || null}
          annotationSections={heroAnnotations}
          seasonClasses={seasonClasses}
        />

        {/* ── Session selector (sticky under the site header) ──── */}
        {sessions.length > 0 && (
          <div className="sticky top-14 z-40 border-y bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
            <div className="container flex items-stretch gap-4">
              <span className="label-caps hidden shrink-0 items-center md:flex">Session</span>
              <div role="tablist" aria-label="Sessions" className="-mb-px flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {sessions.map((s: any) => {
                  const active = s.id === activeTab;
                  return (
                    <button
                      key={s.id}
                      role="tab"
                      type="button"
                      aria-selected={active}
                      onClick={() => selectSession(s.id)}
                      className={`relative flex h-12 shrink-0 flex-col items-start justify-center whitespace-nowrap px-3 text-left transition-colors sm:px-4 ${
                        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="font-display text-sm font-bold uppercase tracking-wide">{s.name}</span>
                      {showTypeLabel(s) && (
                        <span className={`font-display text-[10px] font-semibold uppercase tracking-[0.14em] ${active ? "text-primary" : "text-muted-foreground/70"}`}>
                          {sessionTypeLabel(s.session_type)}
                        </span>
                      )}
                      <span className={`absolute inset-x-0 bottom-0 h-[3px] ${active ? "bg-signal" : "bg-transparent"}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="container py-6 md:py-8">
          {sessions.length === 0 ? (
            <EmptyState title="No sessions yet">Published sessions and results will appear here.</EmptyState>
          ) : (
            activeSession && (
              <div role="tabpanel" key={activeSession.id}>
                {activeSession.session_type === "endurance_race" ? (
                  <EnduranceRaceView
                    parentSession={activeSession}
                    hourSessions={hourSessions}
                    event={event}
                    teamNameMap={teamNameMap}
                    allSessions={sessions}
                    weatherMap={weatherMap}
                    activeSubTab={activeSubTab}
                    setActiveSubTab={setActiveSubTab}
                    isMulticlass={isMulticlass}
                    layout={(event as any).v2_circuits?.v2_circuit_layouts}
                    seasonClasses={seasonClasses}
                  />
                ) : (
                  <SessionResults
                    session={activeSession}
                    event={event}
                    teamNameMap={teamNameMap}
                    allSessions={sessions}
                    weatherMap={weatherMap}
                    isMulticlass={isMulticlass}
                    layout={(event as any).v2_circuits?.v2_circuit_layouts}
                    seasonClasses={seasonClasses}
                  />
                )}
              </div>
            )
          )}
        </div>

        {/* Lightboxes */}
        <SessionSummaryLightbox
          open={summaryOpen}
          onClose={() => setSummaryOpen(false)}
          eventId={slug!}
          sessions={sessions}
        />
        <HighlightsLightbox
          open={highlightsOpen}
          onClose={() => setHighlightsOpen(false)}
          sessions={allSessions
            .filter((s: any) => (s as any).highlights_url)
            .map((s: any) => ({ name: s.name, highlights_url: (s as any).highlights_url }))
          }
        />
      </main>
      <Footer />
    </div>
  );
}

/** Only show the type under the name when it adds information ("Race" → "Endurance") */
function showTypeLabel(s: any): boolean {
  const label = sessionTypeLabel(s.session_type).toLowerCase();
  const name = String(s.name || "").toLowerCase();
  return !name.includes(label) && !(label === "practice" && /\b(fp|p)\d/.test(name));
}

function sessionTypeLabel(t: string | null | undefined): string {
  switch (t) {
    case "practice": return "Practice";
    case "warmup": return "Warm-up";
    case "qualifying": return "Qualifying";
    case "sprint_qualifying": return "Sprint quali";
    case "race": return "Race";
    case "sprint_race": return "Sprint";
    case "endurance_race": return "Endurance";
    default: return t ? t.replace(/_/g, " ") : "Session";
  }
}

// ── Endurance Race View ──────────────────────────────────────────────

function EnduranceRaceView({
  parentSession,
  hourSessions,
  event,
  teamNameMap,
  allSessions,
  weatherMap,
  activeSubTab,
  setActiveSubTab,
  isMulticlass,
  layout,
  seasonClasses,
}: {
  parentSession: any;
  hourSessions: any[];
  event: any;
  teamNameMap: Record<string, string>;
  allSessions: any[];
  weatherMap: Record<string, any>;
  activeSubTab: string;
  setActiveSubTab: (v: string) => void;
  isMulticlass?: boolean;
  layout?: any;
  seasonClasses?: any[];
}) {
  const [customElapsed, setCustomElapsed] = useState<number | null>(null);

  // The sub-tabs: "Race Results" + each hour
  const subTabs = [
    { id: "race-results", label: "Race Results", sessionId: parentSession.id },
    ...hourSessions.map((hs: any) => ({ id: hs.id, label: hs.name, sessionId: hs.id })),
  ];

  // Determine which session to show
  const currentSubTab = subTabs.find(t => t.id === activeSubTab) || subTabs[0];
  const displaySessionId = currentSubTab?.sessionId || parentSession.id;
  const displaySession = displaySessionId === parentSession.id
    ? parentSession
    : hourSessions.find((h: any) => h.id === displaySessionId) || parentSession;

  const currentHourIndex = hourSessions.findIndex((h: any) => h.id === displaySessionId);
  const isHourView = currentHourIndex >= 0;
  const isFirstHour = isHourView && currentHourIndex === 0;
  const useQualifyingRef = !isHourView || isFirstHour;
  const prevHourSession = isHourView && currentHourIndex > 0 ? hourSessions[currentHourIndex - 1] : null;

  const showStoredResults = customElapsed == null;

  return (
    <div className="space-y-4">
      {/* Time scrubber (replaces simple sub-tab bar when lap data exists) */}
      <EnduranceTimeScrubber
        parentSessionId={parentSession.id}
        hourSessions={hourSessions}
        teamNameMap={teamNameMap}
        activeSubTab={activeSubTab}
        setActiveSubTab={(v) => { setCustomElapsed(null); setActiveSubTab(v); }}
        onCustomElapsed={setCustomElapsed}
        isMulticlass={isMulticlass}
        weatherMap={weatherMap}
        parentSession={parentSession}
        event={event}
        seasonClasses={seasonClasses}
      />

      {/* Stored results (hidden when viewing custom time standings) */}
      {showStoredResults && (
        <SessionResults
          session={displaySession}
          event={event}
          teamNameMap={teamNameMap}
          allSessions={allSessions}
          weatherMap={weatherMap}
          positionRefMode={useQualifyingRef ? "qualifying" : "previous-hour"}
          prevHourSessionId={prevHourSession?.id || null}
          hideStatus={isHourView && currentHourIndex < hourSessions.length - 1}
          isOverallEnduranceView={!isHourView}
          isMulticlass={isMulticlass}
          layout={layout}
          enduranceHourSessions={hourSessions}
          enduranceActiveHourId={isHourView ? displaySessionId : undefined}
          parentSessionId={parentSession.id}
          seasonClasses={seasonClasses}
        />
      )}
    </div>
  );
}

// ── Position change indicator ────────────────────────────────────────

function PositionDelta({ racePos, qualPos }: { racePos: number | null; qualPos: number | null }) {
  if (racePos === null || qualPos === null) return null;
  const delta = qualPos - racePos;
  if (delta === 0) return <span className="num text-xs text-muted-foreground/60">–</span>;
  if (delta > 0) {
    return (
      <span className="num inline-flex items-center gap-0.5 text-xs font-semibold text-pb" title={`Gained ${delta}`}>
        <TriangleIcon className="h-2.5 w-2.5 fill-current" />
        {delta}
      </span>
    );
  }
  return (
    <span className="num inline-flex items-center gap-0.5 text-xs font-semibold text-dnf" title={`Lost ${Math.abs(delta)}`}>
      <TriangleIcon className="h-2.5 w-2.5 rotate-180 fill-current" />
      {Math.abs(delta)}
    </span>
  );
}

// ── Session Results ──────────────────────────────────────────────────

function SessionResults({
  session,
  event,
  teamNameMap,
  allSessions,
  weatherMap,
  positionRefMode,
  prevHourSessionId,
  hideStatus,
  isOverallEnduranceView,
  isMulticlass,
  layout,
  enduranceHourSessions,
  enduranceActiveHourId,
  parentSessionId,
  seasonClasses,
}: {
  session: any;
  event: any;
  teamNameMap: Record<string, string>;
  allSessions: any[];
  weatherMap: Record<string, any>;
  positionRefMode?: "qualifying" | "previous-hour";
  prevHourSessionId?: string | null;
  hideStatus?: boolean;
  isOverallEnduranceView?: boolean;
  isMulticlass?: boolean;
  layout?: any;
  enduranceHourSessions?: any[];
  enduranceActiveHourId?: string;
  parentSessionId?: string;
  seasonClasses?: any[];
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [classFilter, setClassFilter] = useState<string>("all");
  const type = session.session_type;
  const isRace = type === "race" || type === "sprint_race" || type === "endurance_race";
  const isQual = type === "qualifying" || type === "sprint_qualifying";
  const isPractice = type === "practice" || type === "warmup";

  const table = isRace ? "v2_race_results" : isQual ? "v2_qualifying_results" : "v2_practice_results";

  const { data: results = [] } = useQuery({
    queryKey: ["public_results", session.id, table],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as any)
        .select("*, v2_drivers(full_name, nationality), v2_teams(id, full_name, short_name), v2_cars(model_name, manufacturer)")
        .eq("session_id", session.id)
        .order("position");
      if (error) throw error;
      
      // Group co-drivers by car_number for endurance race views
      const grouped = new Map<string, any>();
      const ungrouped: any[] = [];
      
      for (const row of (data || []) as any[]) {
        const key = row.car_number ? `${row.car_number}-${row.position}` : null;
        if (key && grouped.has(key)) {
          const existing = grouped.get(key);
          if (!existing._coDrivers) existing._coDrivers = [{ id: existing.driver_id, name: existing.v2_drivers?.full_name, nationality: existing.v2_drivers?.nationality }];
          existing._coDrivers.push({ id: row.driver_id, name: row.v2_drivers?.full_name, nationality: row.v2_drivers?.nationality });
        } else if (key) {
          grouped.set(key, { ...row });
        } else {
          ungrouped.push(row);
        }
      }
      
      return [...grouped.values(), ...ungrouped];
    },
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ["public_incidents", session.id],
    queryFn: async () => {
      if (!isRace) return [];
      const { data } = await supabase.from("v2_incidents").select("*").eq("session_id", session.id).order("lap_number");
      return data || [];
    },
    enabled: isRace,
  });

  // Fetch annotation sections
  const { data: annotationSections = [] } = useQuery({
    queryKey: ["public_annotations", session.id],
    queryFn: async () => {
      const { data } = await supabase.from("v2_annotation_sections" as any).select("*, v2_annotation_items(*)").eq("session_id", session.id).order("sort_order");
      return (data || []) as any[];
    },
  });

  // Determine position reference source
  const refMode = positionRefMode || "qualifying";
  const useQualifying = refMode === "qualifying";

  // For qualifying reference: use override if set, otherwise auto-detect
  const qualSession = isRace && useQualifying
    ? ((session as any).qualifying_session_id
        ? allSessions.find((s: any) => s.id === (session as any).qualifying_session_id)
        : allSessions.find((s: any) => s.session_type === "qualifying" || s.session_type === "sprint_qualifying"))
    : null;

  // The override might point to a race/sprint_race session, so we need to fetch from the right table
  const qualIsRaceType = qualSession && (qualSession.session_type === "race" || qualSession.session_type === "sprint_race");
  const qualTable = qualIsRaceType ? "v2_race_results" : "v2_qualifying_results";

  const { data: qualResults = [] } = useQuery({
    queryKey: ["public_qual_for_race", qualSession?.id, qualTable],
    queryFn: async () => {
      if (!qualSession) return [];
      const { data } = await supabase.from(qualTable as any).select("driver_id, position, car_number").eq("session_id", qualSession.id).order("position");
      return (data || []) as any[];
    },
    enabled: isRace && useQualifying && !!qualSession,
  });

  // For previous hour reference: fetch that hour's race results
  const { data: prevHourResults = [] } = useQuery({
    queryKey: ["public_prev_hour", prevHourSessionId],
    queryFn: async () => {
      if (!prevHourSessionId) return [];
      const { data } = await supabase.from("v2_race_results" as any).select("driver_id, position, car_number").eq("session_id", prevHourSessionId).order("position");
      return (data || []) as any[];
    },
    enabled: isRace && !useQualifying && !!prevHourSessionId,
  });

  // Build position lookup maps (by driver_id and by car_number as fallback for multi-driver entries)
  const refPosMapByDriver: Record<string, number> = {};
  const refPosMapByCar: Record<string, number> = {};
  const refSource = useQualifying ? qualResults : prevHourResults;
  for (const ref of refSource) {
    if (ref.driver_id && ref.position) refPosMapByDriver[ref.driver_id] = ref.position;
    if (ref.car_number && ref.position && !refPosMapByCar[ref.car_number]) {
      refPosMapByCar[ref.car_number] = ref.position;
    }
  }

  const hasRefData = Object.keys(refPosMapByDriver).length > 0 || Object.keys(refPosMapByCar).length > 0;

  // Extract custom columns from extra_data
  const extraDataKeys: { key: string; name: string }[] = [];
  if (results.length > 0) {
    const seenKeys = new Set<string>();
    for (const r of results) {
      const ed = (r as any).extra_data;
      if (ed && typeof ed === "object") {
        for (const [k] of Object.entries(ed)) {
          if (k === "Int" || k === "avg_kmh" || k === "all_drivers" || k === "PIC" || k === "Class" || k === "_points_columns") continue;
          if (!seenKeys.has(k)) {
            seenKeys.add(k);
            extraDataKeys.push({ key: k, name: k });
          }
        }
      }
    }
  }

  const hasInt = results.some((r: any) => r.extra_data?.Int);

  // Extract unique classes for filtering
  const uniqueClasses = useMemo(() => {
    const set = new Set<string>();
    for (const r of results) {
      const cls = (r as any).extra_data?.Class;
      if (cls) set.add(cls);
    }
    // Sort by season class order if available
    if (seasonClasses && seasonClasses.length > 0) {
      const order = seasonClasses.map((sc: any) => sc.class_name);
      return Array.from(set).sort((a, b) => {
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    }
    return Array.from(set).sort(sortClasses);
  }, [results, seasonClasses]);

  // Filter results by class
  const filteredResults = useMemo(() => {
    if (classFilter === "all") return results;
    return results.filter((r: any) => (r as any).extra_data?.Class === classFilter);
  }, [results, classFilter]);

  // Column visibility
  const hasCarNumber = results.some((r: any) => r.car_number);
  const hasCar = results.some((r: any) => r.v2_cars);
  const hasTeam = results.some((r: any) => r.v2_teams);

  const hasBestLap = isPractice && results.some((r: any) => r.best_lap_time);
  const hasGapP1 = isPractice && results.some((r: any) => r.gap_to_p1);
  const hasPracticeLaps = isPractice && results.some((r: any) => r.laps_run);

  const hasQ1 = isQual && results.some((r: any) => r.q1_time);
  const hasQ2 = isQual && results.some((r: any) => r.q2_time);
  const hasQ3 = isQual && results.some((r: any) => r.q3_time);
  const hasQualBest = isQual && results.some((r: any) => r.best_time);
  const hasGapPole = isQual && results.some((r: any) => r.gap_to_pole);
  const hasQualLaps = isQual && results.some((r: any) => r.laps_run);

  const hasRaceLaps = isRace && results.some((r: any) => r.laps_completed);
  const hasTotalTime = isRace && results.some((r: any) => r.total_time);
  const hasGapLeader = isRace && results.some((r: any) => r.gap_to_leader);
  const hasFastestLap = isRace && results.some((r: any) => r.fastest_lap_time);
  const hasAvgLap = isRace && results.some((r: any) => r.average_lap_time);
  const hasPits = isRace && results.some((r: any) => r.pit_stops != null);
  const hasPoints = (isRace || isQual) && results.some((r: any) => r.points != null && r.points !== 0);
  const hasStatus = isRace && !hideStatus && results.some((r: any) => r.status && r.status !== "finished");

  const bestLapField = isPractice ? "best_lap_time" : isQual ? "best_time" : "fastest_lap_time";
  let fastestLapMs: number | null = null;
  let fastestLapStr: string | null = null;
  for (const r of results) {
    const timeStr = (r as any)[bestLapField];
    if (!timeStr) continue;
    const ms = parseTime(timeStr);
    if (ms !== null && (fastestLapMs === null || ms < fastestLapMs)) {
      fastestLapMs = ms;
      fastestLapStr = timeStr;
    }
  }

  const buildSessionData = (s: any, res: any[], inc: any[]): SessionExportData => {
    const customCols: { key: string; name: string }[] = [];
    const seenKeys = new Set<string>();
    for (const r of res) {
      const ed = r.extra_data;
      if (ed && typeof ed === "object") {
        for (const k of Object.keys(ed)) {
          if (k === "Int" || k === "avg_kmh" || k === "_points_columns" || seenKeys.has(k)) continue;
          seenKeys.add(k);
          customCols.push({ key: k, name: k });
        }
      }
    }
    return {
      sessionName: s.name,
      sessionDate: s.date,
      sessionType: s.session_type,
      results: res,
      incidents: inc,
      customColumns: customCols,
      hasInt: res.some((r: any) => r.extra_data?.Int),
      teamNameMap,
      weather: weatherMap[s.id] || null,
    };
  };

  const handleExportClick = () => setExportOpen(true);

  const handleExport = async (mode: "single" | "all", onProgress: (pct: number) => void) => {
    if (mode === "single") {
      await exportEventPdf({
        eventName: event.name,
        seriesName: event.v2_seasons?.v2_series?.name || "",
        circuitName: event.v2_circuits?.name || "",
        circuitCountry: event.v2_circuits?.country || "",
        sessions: [buildSessionData(session, results, incidents)],
        onProgress,
      });
    } else {
      const allSessionData: SessionExportData[] = [];
      for (let idx = 0; idx < allSessions.length; idx++) {
        const s = allSessions[idx];
        const sType = s.session_type;
        const tbl = (sType === "race" || sType === "sprint_race" || sType === "endurance_race") ? "v2_race_results"
          : (sType === "qualifying" || sType === "sprint_qualifying") ? "v2_qualifying_results"
          : "v2_practice_results";
        const { data: sResults } = await supabase.from(tbl as any)
          .select("*, v2_drivers(full_name, nationality), v2_teams(id, full_name, short_name), v2_cars(model_name, manufacturer)")
          .eq("session_id", s.id)
          .order("position");
        let sIncidents: any[] = [];
        if (sType === "race" || sType === "sprint_race" || sType === "endurance_race") {
          const { data: inc } = await supabase.from("v2_incidents").select("*").eq("session_id", s.id).order("lap_number");
          sIncidents = inc || [];
        }
        allSessionData.push(buildSessionData(s, sResults || [], sIncidents));
        onProgress(10 + ((idx + 1) / allSessions.length) * 40);
      }
      await exportEventPdf({
        eventName: event.name,
        seriesName: event.v2_seasons?.v2_series?.name || "",
        circuitName: event.v2_circuits?.name || "",
        circuitCountry: event.v2_circuits?.country || "",
        sessions: allSessionData,
        onProgress,
      });
    }
  };

  const getTeamName = (r: any) => {
    const teamId = r.v2_teams?.id;
    if (teamId && teamNameMap[teamId]) return teamNameMap[teamId];
    return r.v2_teams?.short_name || r.v2_teams?.full_name || "—";
  };

  const classColorMap: Record<string, string> = {};
  for (const sc of seasonClasses || []) if (sc?.class_name && sc?.color) classColorMap[sc.class_name] = sc.color;
  const classColor = (cls: string | null | undefined) => getClassColor(cls, classColorMap);
  const classCounts: Record<string, number> = {};
  for (const r of results) {
    const c = (r as any).extra_data?.Class;
    if (c) classCounts[c] = (classCounts[c] || 0) + 1;
  }

  const showPic = isMulticlass || extraDataKeys.some((c) => c.key === "PIC");
  const showClass = isMulticlass || extraDataKeys.some((c) => c.key === "Class");
  const otherExtraCols = extraDataKeys.filter((c) => c.key !== "PIC" && c.key !== "Class" && c.key !== "Tires");
  const showTires = extraDataKeys.some((c) => c.key === "Tires") && !isOverallEnduranceView;
  const carLabel = (r: any) => (r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : "—");
  const formatGap = (g: string | null) => {
    if (!g) return "—";
    const lapMatch = g.match(/^\+(\d+)\s*lap/i);
    if (lapMatch) {
      const n = parseInt(lapMatch[1], 10);
      return `+${n} ${n === 1 ? "Lap" : "Laps"}`;
    }
    return g;
  };
  const lapCell = (t: string | null) => {
    const fastest = !!t && t === fastestLapStr;
    return (
      <td className={`num text-right text-[13px] ${fastest ? "font-semibold text-fastest" : ""}`}>
        {t ? (
          <span className="inline-flex items-center justify-end gap-1">
            {fastest && <span className="h-1.5 w-1.5 rounded-full bg-fastest" title="Fastest of the session" />}
            {t}
          </span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </td>
    );
  };
  const numCell = (v: any, cls = "") => (
    <td className={`num text-right text-[13px] ${cls}`}>{v != null && v !== "" ? v : <span className="text-muted-foreground/50">—</span>}</td>
  );
  const sessionDate = session.date ? formatDateRange(session.date.split("T")[0]) : null;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded border bg-card">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="font-display text-lg font-bold uppercase leading-none tracking-wide text-foreground">{session.name}</h2>
            {(sessionDate || (session as any).start_time) && (
              <span className="num text-xs text-muted-foreground">
                {sessionDate}
                {(session as any).start_time ? ` · ${(session as any).start_time}` : ""}
              </span>
            )}
            {!isOverallEnduranceView && <WeatherBubble weather={weatherMap[session.id] || null} />}
          </div>
          <div className="flex items-center gap-3">
            {results.length > 0 && (
              <span className="label-caps hidden sm:inline">
                <span className="num text-foreground">{filteredResults.length}</span> {filteredResults.length === 1 ? "entry" : "entries"}
              </span>
            )}
            <button type="button" className={toolButton} onClick={handleExportClick}>
              <FileDown />
              PDF
            </button>
            <PdfExportDialog
              open={exportOpen}
              onOpenChange={setExportOpen}
              sessionName={session.name}
              hasMultipleSessions={allSessions.length > 1}
              onExport={handleExport}
            />
          </div>
        </div>

        {/* Class filter */}
        {isMulticlass && uniqueClasses.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto border-b bg-background/40 px-4 py-2" role="group" aria-label="Filter by class">
            <button type="button" className={chip(classFilter === "all")} onClick={() => setClassFilter("all")}>
              All <span className="num font-normal opacity-70">{results.length}</span>
            </button>
            {uniqueClasses.map((cls) => {
              const c = classColor(cls);
              const active = classFilter === cls;
              return (
                <button
                  key={cls}
                  type="button"
                  className={chip(active)}
                  onClick={() => setClassFilter(active ? "all" : cls)}
                  style={active ? { backgroundColor: c, borderColor: c, color: "#fff" } : undefined}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? "#fff" : c }} />
                  {cls}
                  <span className="num font-normal opacity-70">{classCounts[cls] || 0}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="data-table [&_tbody_td]:px-2 [&_thead_th]:px-2 sm:[&_tbody_td]:px-3 sm:[&_thead_th]:px-3 [&_thead_th.text-center]:text-center [&_thead_th.text-right]:text-right">
            <thead>
              <tr>
                <th className="w-12 text-center">Pos</th>
                {isRace && hasRefData && <th className="hidden w-12 text-center sm:table-cell" title={useQualifying ? "Positions gained vs. qualifying" : "Positions gained vs. previous hour"}>+/−</th>}
                {showPic && <th className="w-12 text-center">PIC</th>}
                {showClass && <th className="hidden w-20 md:table-cell">Class</th>}
                {hasCarNumber && <th className="w-14 text-right">No.</th>}
                <th>Driver</th>
                {hasTeam && <th className="hidden md:table-cell">Team</th>}
                {hasCar && <th className="hidden lg:table-cell">Car</th>}
                {isPractice && (
                  <>
                    {hasBestLap && <th className="text-right">Best lap</th>}
                    {hasGapP1 && <th className="text-right">Gap</th>}
                    {hasInt && <th className="hidden text-right lg:table-cell">Int</th>}
                    {hasPracticeLaps && <th className="hidden text-right sm:table-cell">Laps</th>}
                  </>
                )}
                {isQual && (
                  <>
                    {hasQ1 && <th className="hidden text-right lg:table-cell">Q1</th>}
                    {hasQ2 && <th className="hidden text-right lg:table-cell">Q2</th>}
                    {hasQ3 && <th className="hidden text-right lg:table-cell">Q3</th>}
                    {hasQualBest && <th className="text-right">Best</th>}
                    {hasGapPole && <th className="text-right">Gap</th>}
                    {hasInt && <th className="hidden text-right lg:table-cell">Int</th>}
                    {hasQualLaps && <th className="hidden text-right sm:table-cell">Laps</th>}
                    {hasPoints && <th className="hidden text-right sm:table-cell">Pts</th>}
                  </>
                )}
                {isRace && (
                  <>
                    {hasRaceLaps && <th className="text-right">Laps</th>}
                    {hasTotalTime && <th className="hidden text-right lg:table-cell">Time</th>}
                    {hasGapLeader && <th className="text-right">Gap</th>}
                    {hasInt && <th className="hidden text-right lg:table-cell">Int</th>}
                    {hasFastestLap && <th className="text-right">Best lap</th>}
                    {hasAvgLap && <th className="hidden text-right xl:table-cell">Avg lap</th>}
                    {hasPits && <th className="hidden text-right sm:table-cell">Pits</th>}
                    {hasPoints && <th className="hidden text-right sm:table-cell">Pts</th>}
                    {hasStatus && <th>Status</th>}
                  </>
                )}
                {otherExtraCols.map((col) => (
                  <th key={col.key} className="hidden lg:table-cell">{col.name}</th>
                ))}
                {showTires && <th className="hidden lg:table-cell">Tires</th>}
              </tr>
            </thead>
            <tbody>
              {filteredResults.map((r: any) => {
                const cls = (r.extra_data as any)?.Class as string | undefined;
                const retired = hasStatus && r.status && r.status !== "finished";
                const coDrivers = (r as any)._coDrivers;
                const allDrivers = (r as any).extra_data?.all_drivers;
                const drivers: any[] | null = coDrivers || (allDrivers && Array.isArray(allDrivers) && allDrivers.length > 0 ? allDrivers : null);
                return (
                  <tr key={r.id} className={retired ? "[&>td:not(.st)]:opacity-55" : ""}>
                    <td
                      className="text-center"
                      style={cls && showClass ? { boxShadow: `inset 3px 0 0 ${classColor(cls)}` } : undefined}
                    >
                      <Pos value={r.position} />
                    </td>
                    {isRace && hasRefData && (
                      <td className="hidden text-center sm:table-cell">
                        <PositionDelta
                          racePos={r.position}
                          qualPos={r.driver_id && refPosMapByDriver[r.driver_id] ? refPosMapByDriver[r.driver_id] : r.car_number && refPosMapByCar[r.car_number] ? refPosMapByCar[r.car_number] : null}
                        />
                      </td>
                    )}
                    {showPic && <td className="num text-center text-[13px] text-muted-foreground">{(r.extra_data as any)?.PIC || "—"}</td>}
                    {showClass && (
                      <td className="hidden md:table-cell">{cls ? <ClassBadge name={cls} color={classColor(cls)} /> : <span className="text-muted-foreground">—</span>}</td>
                    )}
                    {hasCarNumber && <td className="num text-right font-semibold">{r.car_number ? `#${r.car_number}` : "—"}</td>}
                    <td className="py-2">
                      {drivers ? (
                        <div className="flex flex-col gap-0.5">
                          {drivers.map((d: any, idx: number) => (
                            <span key={idx} className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium leading-5">
                              <FlagImage nationality={d.nationality} size={14} />
                              {d.id ? (
                                <Link to={`/driver/${d.id}`} className="transition-colors hover:text-primary">{d.name}</Link>
                              ) : (
                                d.name
                              )}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium">
                          <FlagImage nationality={r.v2_drivers?.nationality} size={14} />
                          {r.driver_id ? (
                            <Link to={`/driver/${r.driver_id}`} className="transition-colors hover:text-primary">{r.v2_drivers?.full_name || "—"}</Link>
                          ) : (
                            "—"
                          )}
                        </span>
                      )}
                      {hasTeam && <div className="max-w-[10rem] truncate text-xs text-muted-foreground sm:max-w-[16rem] md:hidden">{getTeamName(r)}</div>}
                    </td>
                    {hasTeam && (
                      <td className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                        {r.team_id ? (
                          <Link to={`/team/${r.team_id}`} className="transition-colors hover:text-foreground">{getTeamName(r)}</Link>
                        ) : (
                          getTeamName(r)
                        )}
                      </td>
                    )}
                    {hasCar && (
                      <td className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                        {r.car_id ? (
                          <Link to={`/car/${r.car_id}`} className="transition-colors hover:text-foreground">{carLabel(r)}</Link>
                        ) : (
                          carLabel(r)
                        )}
                      </td>
                    )}
                    {isPractice && (
                      <>
                        {hasBestLap && lapCell(r.best_lap_time)}
                        {hasGapP1 && numCell(r.gap_to_p1, "text-muted-foreground")}
                        {hasInt && numCell((r.extra_data as any)?.Int, "hidden lg:table-cell text-muted-foreground")}
                        {hasPracticeLaps && numCell(r.laps_run, "hidden sm:table-cell")}
                      </>
                    )}
                    {isQual && (
                      <>
                        {hasQ1 && numCell(r.q1_time, "hidden lg:table-cell text-muted-foreground")}
                        {hasQ2 && numCell(r.q2_time, "hidden lg:table-cell text-muted-foreground")}
                        {hasQ3 && numCell(r.q3_time, "hidden lg:table-cell text-muted-foreground")}
                        {hasQualBest && lapCell(r.best_time)}
                        {hasGapPole && numCell(r.gap_to_pole, "text-muted-foreground")}
                        {hasInt && numCell((r.extra_data as any)?.Int, "hidden lg:table-cell text-muted-foreground")}
                        {hasQualLaps && numCell(r.laps_run, "hidden sm:table-cell")}
                        {hasPoints && numCell(r.points, "hidden sm:table-cell font-semibold")}
                      </>
                    )}
                    {isRace && (
                      <>
                        {hasRaceLaps && numCell(r.laps_completed)}
                        {hasTotalTime && numCell(r.total_time, "hidden lg:table-cell")}
                        {hasGapLeader && numCell(r.gap_to_leader ? formatGap(r.gap_to_leader) : null, "text-muted-foreground whitespace-nowrap")}
                        {hasInt && numCell((r.extra_data as any)?.Int, "hidden lg:table-cell text-muted-foreground whitespace-nowrap")}
                        {hasFastestLap && lapCell(r.fastest_lap_time)}
                        {hasAvgLap && numCell(r.average_lap_time, "hidden xl:table-cell text-muted-foreground")}
                        {hasPits && numCell(r.pit_stops, "hidden sm:table-cell")}
                        {hasPoints && numCell(r.points, "hidden sm:table-cell font-semibold")}
                        {hasStatus && (
                          <td className="st">
                            {r.status && r.status !== "finished" ? (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex cursor-default items-center gap-1 font-display text-xs font-bold uppercase tracking-wider text-dnf">
                                      {r.status.toUpperCase()}
                                      {(r.dnf_reason || r.dnf_explanation) && <Info className="h-3 w-3 opacity-70" />}
                                    </span>
                                  </TooltipTrigger>
                                  {(r.dnf_reason || r.dnf_explanation) && (
                                    <TooltipContent side="top" className="max-w-[300px] text-xs">
                                      {r.dnf_reason && <p className="font-semibold">{r.dnf_reason}</p>}
                                      {r.dnf_explanation && <p className="mt-0.5 text-muted-foreground">{r.dnf_explanation}</p>}
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="label-caps text-muted-foreground/60">Fin</span>
                            )}
                          </td>
                        )}
                      </>
                    )}
                    {otherExtraCols.map((col) => (
                      <td key={col.key} className="hidden text-xs lg:table-cell">{(r.extra_data as any)?.[col.key] || "—"}</td>
                    ))}
                    {showTires && <td className="hidden text-xs lg:table-cell">{(r.extra_data as any)?.Tires || "—"}</td>}
                  </tr>
                );
              })}
              {filteredResults.length === 0 && (
                <tr>
                  <td colSpan={20} className="py-10 text-center text-muted-foreground">
                    No results entered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        {filteredResults.length > 0 && (fastestLapStr || (isRace && hasRefData)) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-background/40 px-4 py-2 text-[11px] text-muted-foreground">
            {fastestLapStr && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-fastest" /> Fastest lap <span className="num text-fastest">{fastestLapStr}</span>
              </span>
            )}
            {isRace && hasRefData && (
              <span className="hidden sm:inline">+/− positions vs. {useQualifying ? "qualifying" : "previous hour"}</span>
            )}
          </div>
        )}
      </div>

      {/* Incidents */}
      {isRace && incidents.length > 0 && (
        <section>
          <SectionHeader kicker="Stewards" title="Incidents" />
          <div className="divide-y overflow-hidden rounded border bg-card">
            {incidents.map((inc: any) => (
              <div key={inc.id} className="flex gap-3 px-4 py-2.5 text-sm" style={{ boxShadow: "inset 3px 0 0 hsl(var(--dnf))" }}>
                {inc.lap_number && <span className="num w-14 shrink-0 text-xs text-muted-foreground">L{inc.lap_number}</span>}
                <div className="min-w-0 text-muted-foreground">
                  <span className="text-foreground">{inc.description}</span>
                  {inc.penalty_type && <span className="text-dnf"> — {inc.penalty_type}</span>}
                  {inc.outcome && <span> ({inc.outcome})</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Analysis: time delta, strategy, progression, race control, fingerprint */}
      <SessionBottomTabs
        session={session}
        event={event}
        layout={layout}
        annotationSections={annotationSections}
        isOverallEnduranceView={isOverallEnduranceView}
        hourSessions={enduranceHourSessions}
        teamNameMap={teamNameMap}
        isMulticlass={isMulticlass}
        activeHourId={enduranceActiveHourId}
        parentSessionId={parentSessionId}
        seasonClasses={seasonClasses}
      />
    </div>
  );
}
