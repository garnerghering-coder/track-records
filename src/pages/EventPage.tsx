import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileDown, TriangleIcon } from "lucide-react";
import { exportEventPdf, type SessionExportData } from "@/lib/pdf-export";
import PdfExportDialog from "@/components/PdfExportDialog";
import FlagImage from "@/components/FlagImage";
import { parseTime } from "@/lib/time-calc";
import WeatherBubble from "@/components/WeatherBubble";
import PositionProgressionChart from "@/components/PositionProgressionChart";
import TrackFingerprint from "@/components/TrackFingerprint";
import { computeTrackMetrics } from "@/lib/track-calculations";

export default function EventPage() {
  const { slug } = useParams();
  const [activeTab, setActiveTab] = useState<string>("");
  const [activeSubTab, setActiveSubTab] = useState<string>("race-results");

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

  if (isLoading) return <div className="min-h-screen bg-background"><Header /><div className="pt-20 text-center text-muted-foreground">Loading…</div></div>;
  if (!event) return <div className="min-h-screen bg-background"><Header /><div className="pt-20 text-center text-muted-foreground">Event not found or not published.</div><Footer /></div>;

  const seriesName = event.v2_seasons?.v2_series?.name;
  const year = event.v2_seasons?.year;

  // Get child sessions for active tab (endurance race)
  const activeSession = sessions.find((s: any) => s.id === activeTab);
  const isEndurance = activeSession?.session_type === "endurance_race";
  const hourSessions = isEndurance
    ? childSessions
        .filter((s: any) => (s as any).parent_session_id === activeTab)
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
    : [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        title={event.name}
        description={`${event.name} – ${seriesName || ""}${year ? ` ${year}` : ""}. View sessions, results, and weather data.`}
        canonical={`/events/${slug}`}
      />
      <Header />
      <main className="flex-1 pt-16">
        {/* Event Header */}
        <div className="border-b border-border">
          <div className="container py-8 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {seriesName && <span>{seriesName}</span>}
              {year && <span>• {year}</span>}
              {event.round_number && <span>• Round {event.round_number}</span>}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">{event.name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {event.v2_circuits?.name && <span>📍 {event.v2_circuits.name}{event.v2_circuits.country ? `, ${event.v2_circuits.country}` : ""}</span>}
              {event.start_date && <span>📅 {event.start_date}{event.end_date && event.end_date !== event.start_date ? ` – ${event.end_date}` : ""}</span>}
            </div>
            {event.description && <p className="text-sm text-muted-foreground max-w-2xl mt-2">{event.description}</p>}
          </div>
          {event.v2_circuits?.layout_image_url && (
            <div className="container pb-6">
              <img src={event.v2_circuits.layout_image_url} alt="Circuit layout" className="max-h-48 rounded-lg border border-border object-contain" />
            </div>
          )}
        </div>

        {/* Session Tabs */}
        <div className="container py-6">
          {sessions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No published sessions yet.</p>
          ) : (
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setActiveSubTab("race-results"); }}>
              <TabsList className="mb-4">
                {sessions.map((s: any) => (
                  <TabsTrigger key={s.id} value={s.id} className="text-xs sm:text-sm">
                    {s.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              {sessions.map((s: any) => (
                <TabsContent key={s.id} value={s.id}>
                  {s.session_type === "endurance_race" ? (
                    <EnduranceRaceView
                      parentSession={s}
                      hourSessions={hourSessions}
                      event={event}
                      teamNameMap={teamNameMap}
                      allSessions={sessions}
                      weatherMap={weatherMap}
                      activeSubTab={activeSubTab}
                      setActiveSubTab={setActiveSubTab}
                      isMulticlass={isMulticlass}
                      layout={(event as any).v2_circuits?.v2_circuit_layouts}
                    />
                  ) : (
                    <SessionResults session={s} event={event} teamNameMap={teamNameMap} allSessions={sessions} weatherMap={weatherMap} isMulticlass={isMulticlass} layout={(event as any).v2_circuits?.v2_circuit_layouts} />
                  )}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
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
}) {
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

  // For +/- calculation, we need to know the "reference" session
  // - "Race Results" and "Hour 1": compare to qualifying
  // - "Hour N" (N>1): compare to "Hour N-1"
  const currentHourIndex = hourSessions.findIndex((h: any) => h.id === displaySessionId);
  const isHourView = currentHourIndex >= 0;
  const isFirstHour = isHourView && currentHourIndex === 0;
  const useQualifyingRef = !isHourView || isFirstHour; // Race Results or Hour 1
  const prevHourSession = isHourView && currentHourIndex > 0 ? hourSessions[currentHourIndex - 1] : null;

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex flex-wrap gap-1 p-1 bg-muted rounded-lg">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
              activeSubTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Results for the selected sub-tab */}
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
      />

      {/* Position Progression Chart */}
      {hourSessions.length > 0 && (
        <PositionProgressionChart
          hourSessions={hourSessions}
          teamNameMap={teamNameMap}
          activeHourId={isHourView ? displaySessionId : undefined}
          isMulticlass={isMulticlass}
        />
      )}
    </div>
  );
}

// ── Position change indicator ────────────────────────────────────────

function PositionDelta({ racePos, qualPos }: { racePos: number | null; qualPos: number | null }) {
  if (racePos === null || qualPos === null) return null;
  const delta = qualPos - racePos;
  if (delta === 0) return <span className="text-xs text-muted-foreground">—</span>;
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color: "#22c55e" }}>
        <TriangleIcon className="h-3 w-3 fill-current" />
        {delta}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color: "#ef4444" }}>
      <TriangleIcon className="h-3 w-3 fill-current rotate-180" />
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
}) {
  const [exportOpen, setExportOpen] = useState(false);
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
          if (k === "Int" || k === "avg_kmh" || k === "all_drivers" || k === "PIC" || k === "Class") continue;
          if (!seenKeys.has(k)) {
            seenKeys.add(k);
            extraDataKeys.push({ key: k, name: k });
          }
        }
      }
    }
  }

  const hasInt = results.some((r: any) => r.extra_data?.Int);

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
  const hasPoints = isRace && results.some((r: any) => r.points != null && r.points !== 0);
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
          if (k === "Int" || k === "avg_kmh" || seenKeys.has(k)) continue;
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{session.name}</h3>
          {!isOverallEnduranceView && <WeatherBubble weather={weatherMap[session.id] || null} />}
          {!isOverallEnduranceView && !weatherMap[session.id] && (
            <Badge variant="outline" className="text-[10px]">{type.replace(/_/g, " ")}</Badge>
          )}
          {session.date && <span className="text-xs text-muted-foreground">{session.date.split("T")[0]}{(session as any).start_time ? ` · ${(session as any).start_time}` : ""}</span>}
        </div>
        <Button variant="outline" size="sm" onClick={handleExportClick}>
          <FileDown className="h-3.5 w-3.5 mr-1" />Export PDF
        </Button>
        <PdfExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          sessionName={session.name}
          hasMultipleSessions={allSessions.length > 1}
          onExport={handleExport}
        />
      </div>

      <div className="overflow-x-auto border border-border rounded-lg">
        <Table>
          <TableHeader>
           <TableRow className="bg-muted/50">
               <TableHead className="w-12">Pos</TableHead>
               {isRace && hasRefData && <TableHead className="w-12">+/-</TableHead>}
                {(isMulticlass || extraDataKeys.some(c => c.key === "PIC")) && <TableHead className="w-12">PIC</TableHead>}
                {(isMulticlass || extraDataKeys.some(c => c.key === "Class")) && <TableHead>Class</TableHead>}
               {hasCarNumber && <TableHead className="w-14">No.</TableHead>}
               <TableHead>Driver</TableHead>
               <TableHead className="w-10">Nat</TableHead>
               {hasTeam && <TableHead>Team</TableHead>}
               {hasCar && <TableHead>Car</TableHead>}
               {isPractice && <>{hasBestLap && <TableHead>Best Lap</TableHead>}{hasGapP1 && <TableHead>Gap</TableHead>}{hasInt && <TableHead>Int</TableHead>}{hasPracticeLaps && <TableHead>Laps</TableHead>}</>}
               {isQual && <>{hasQ1 && <TableHead>Q1</TableHead>}{hasQ2 && <TableHead>Q2</TableHead>}{hasQ3 && <TableHead>Q3</TableHead>}{hasQualBest && <TableHead>Best</TableHead>}{hasGapPole && <TableHead>Gap</TableHead>}{hasInt && <TableHead>Int</TableHead>}{hasQualLaps && <TableHead>Laps</TableHead>}</>}
               {isRace && <>{hasRaceLaps && <TableHead>Laps</TableHead>}{hasTotalTime && <TableHead>Time</TableHead>}{hasGapLeader && <TableHead>Gap</TableHead>}{hasInt && <TableHead>Int</TableHead>}{hasFastestLap && <TableHead>Best Lap</TableHead>}{hasAvgLap && <TableHead>Avg Lap</TableHead>}{hasPits && <TableHead>Pits</TableHead>}{hasPoints && <TableHead>Pts</TableHead>}{hasStatus && <TableHead>Status</TableHead>}</>}
               {extraDataKeys.filter(c => c.key !== "PIC" && c.key !== "Class" && c.key !== "Tires").map(col => (
                 <TableHead key={col.key}>{col.name}</TableHead>
               ))}
               {extraDataKeys.some(c => c.key === "Tires") && !isOverallEnduranceView && <TableHead>Tires</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r: any, i: number) => (
              <TableRow key={r.id} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                <TableCell className="font-bold text-center">{r.position}</TableCell>
                {isRace && hasRefData && (
                  <TableCell className="text-center">
                    <PositionDelta racePos={r.position} qualPos={r.driver_id && refPosMapByDriver[r.driver_id] ? refPosMapByDriver[r.driver_id] : (r.car_number && refPosMapByCar[r.car_number] ? refPosMapByCar[r.car_number] : null)} />
                  </TableCell>
                )}
                {(isMulticlass || extraDataKeys.some(c => c.key === "PIC")) && <TableCell className="text-xs">{(r.extra_data as any)?.PIC || "—"}</TableCell>}
                {(isMulticlass || extraDataKeys.some(c => c.key === "Class")) && <TableCell className="text-xs">{(r.extra_data as any)?.Class || "—"}</TableCell>}
                {hasCarNumber && <TableCell className="text-center font-mono text-xs">{r.car_number || "—"}</TableCell>}
                <TableCell className="font-medium whitespace-nowrap">
                  {(() => {
                    const coDrivers = (r as any)._coDrivers;
                    const allDrivers = (r as any).extra_data?.all_drivers;
                    const drivers = coDrivers || (allDrivers && Array.isArray(allDrivers) && allDrivers.length > 0 ? allDrivers : null);
                    if (drivers) {
                      return (
                        <div className="flex flex-col">
                          {drivers.map((d: any, idx: number) => (
                            <span key={idx} className="leading-[22px] whitespace-nowrap">
                              {d.id ? (
                                <Link to={`/driver/${d.id}`} className="hover:text-primary transition-colors">{d.name}</Link>
                              ) : d.name}
                            </span>
                          ))}
                        </div>
                      );
                    }
                    return r.driver_id ? <Link to={`/driver/${r.driver_id}`} className="hover:text-primary transition-colors whitespace-nowrap">{r.v2_drivers?.full_name || "—"}</Link> : "—";
                  })()}
                </TableCell>
                <TableCell>
                  {(() => {
                    const coDrivers = (r as any)._coDrivers;
                    const allDrivers = (r as any).extra_data?.all_drivers;
                    const drivers = coDrivers || (allDrivers && Array.isArray(allDrivers) && allDrivers.length > 0 ? allDrivers : null);
                    if (drivers) {
                      return (
                        <div className="flex flex-col">
                          {drivers.map((d: any, idx: number) => (
                            <div key={idx} className="flex items-center leading-[22px] h-[22px]">
                              <FlagImage nationality={d.nationality} size={18} />
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return <FlagImage nationality={r.v2_drivers?.nationality} size={18} />;
                  })()}
                </TableCell>
                {hasTeam && <TableCell className="text-muted-foreground whitespace-nowrap">
                  {r.team_id ? <Link to={`/team/${r.team_id}`} className="hover:text-primary transition-colors">{getTeamName(r)}</Link> : getTeamName(r)}
                </TableCell>}
                {hasCar && <TableCell className="text-muted-foreground text-xs">
                  {r.car_id ? <Link to={`/car/${r.car_id}`} className="hover:text-primary transition-colors">{r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : "—"}</Link> : (r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : "—")}
                </TableCell>}
                {isPractice && <>
                  {hasBestLap && <TableCell className={`font-mono text-xs ${r.best_lap_time && r.best_lap_time === fastestLapStr ? "text-purple-400 font-semibold" : ""}`}>{r.best_lap_time || "—"}</TableCell>}
                  {hasGapP1 && <TableCell className="font-mono text-xs">{r.gap_to_p1 || "—"}</TableCell>}
                  {hasInt && <TableCell className="font-mono text-xs">{(r.extra_data as any)?.Int || "—"}</TableCell>}
                  {hasPracticeLaps && <TableCell className="text-xs">{r.laps_run || "—"}</TableCell>}
                </>}
                {isQual && <>
                  {hasQ1 && <TableCell className="font-mono text-xs">{r.q1_time || "—"}</TableCell>}
                  {hasQ2 && <TableCell className="font-mono text-xs">{r.q2_time || "—"}</TableCell>}
                  {hasQ3 && <TableCell className="font-mono text-xs">{r.q3_time || "—"}</TableCell>}
                  {hasQualBest && <TableCell className={`font-mono text-xs font-semibold ${r.best_time && r.best_time === fastestLapStr ? "text-purple-400" : ""}`}>{r.best_time || "—"}</TableCell>}
                  {hasGapPole && <TableCell className="font-mono text-xs">{r.gap_to_pole || "—"}</TableCell>}
                  {hasInt && <TableCell className="font-mono text-xs">{(r.extra_data as any)?.Int || "—"}</TableCell>}
                  {hasQualLaps && <TableCell className="text-xs">{r.laps_run || "—"}</TableCell>}
                </>}
                {isRace && <>
                  {hasRaceLaps && <TableCell className="text-xs">{r.laps_completed || "—"}</TableCell>}
                  {hasTotalTime && <TableCell className="font-mono text-xs">{r.total_time || "—"}</TableCell>}
                  {hasGapLeader && <TableCell className="font-mono text-xs">{(() => { const g = r.gap_to_leader; if (!g) return "—"; const lapMatch = g.match(/^\+(\d+)\s*lap/i); if (lapMatch) { const n = parseInt(lapMatch[1], 10); return `+${n} ${n === 1 ? "Lap" : "Laps"}`; } return g; })()}</TableCell>}
                  {hasInt && <TableCell className="font-mono text-xs">{(r.extra_data as any)?.Int || "—"}</TableCell>}
                  {hasFastestLap && <TableCell className={`font-mono text-xs ${r.fastest_lap_time && r.fastest_lap_time === fastestLapStr ? "text-purple-400 font-semibold" : ""}`}>{r.fastest_lap_time || "—"}</TableCell>}
                  {hasAvgLap && <TableCell className="font-mono text-xs">{r.average_lap_time || "—"}</TableCell>}
                  {hasPits && <TableCell className="text-xs">{r.pit_stops ?? "—"}</TableCell>}
                  {hasPoints && <TableCell className="text-xs font-semibold">{r.points ?? "—"}</TableCell>}
                  {hasStatus && <TableCell>
                    {r.status && r.status !== "finished" ? (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="destructive" className="text-[10px] cursor-default">{r.status.toUpperCase()}</Badge>
                          </TooltipTrigger>
                          {(r.dnf_reason || r.dnf_explanation) && (
                            <TooltipContent side="top" className="max-w-[300px] text-xs">
                              {r.dnf_reason && <p className="font-semibold">{r.dnf_reason}</p>}
                              {r.dnf_explanation && <p className="text-muted-foreground mt-0.5">{r.dnf_explanation}</p>}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}
                  </TableCell>}
                </>}
                {extraDataKeys.filter(c => c.key !== "PIC" && c.key !== "Class" && c.key !== "Tires").map(col => (
                  <TableCell key={col.key} className="text-xs">{(r.extra_data as any)?.[col.key] || "—"}</TableCell>
                ))}
                {extraDataKeys.some(c => c.key === "Tires") && !isOverallEnduranceView && <TableCell className="text-xs">{(r.extra_data as any)?.Tires || "—"}</TableCell>}
              </TableRow>
            ))}
            {results.length === 0 && <TableRow><TableCell colSpan={20} className="text-center text-muted-foreground py-8">No results entered yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* Incidents */}
      {isRace && incidents.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Incidents</h4>
          <div className="space-y-1">
            {incidents.map((inc: any) => (
              <div key={inc.id} className="text-xs text-muted-foreground border-l-2 border-destructive pl-3 py-1">
                {inc.lap_number && <span className="font-medium">Lap {inc.lap_number}: </span>}
                {inc.description}
                {inc.penalty_type && <span className="text-destructive"> — {inc.penalty_type}</span>}
                {inc.outcome && <span> ({inc.outcome})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Annotation sections */}
      {annotationSections.map((section: any) => {
        const items = (section.v2_annotation_items || []).sort((a: any, b: any) => a.sort_order - b.sort_order);
        if (items.length === 0) return null;
        return (
          <div key={section.id} className="space-y-2">
            <h4 className="text-sm font-semibold">{section.title}</h4>
            <div className="space-y-1">
              {items.map((item: any) => (
                <div key={item.id} className="text-xs text-muted-foreground border-l-2 pl-3 py-1" style={{ borderColor: item.color }}>
                  {item.description}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Circuit Configuration Fingerprint */}
      {(() => {
        // Use session-level layout_id override, or event-level layout
        const layoutId = (session as any).layout_id || (event as any).layout_id;
        const layoutData = layout && Array.isArray(layout)
          ? layout.find((l: any) => l.id === layoutId) || (layout.length === 1 ? layout[0] : null)
          : null;
        if (!layoutData) return null;
        const m = computeTrackMetrics(
          layoutData.length_km ? Number(layoutData.length_km) : null,
          layoutData.turns,
          layoutData.total_straight_length_km ? Number(layoutData.total_straight_length_km) : null,
          layoutData.total_elevation_change_m ? Number(layoutData.total_elevation_change_m) : null,
          layoutData.heavy_braking_corners
        );
        if (m.tcs100 == null && m.ei == null && m.csi == null) return null;
        return (
          <div className="mt-6 rounded-lg border border-border bg-card p-5">
            <h4 className="text-sm font-semibold mb-3">Circuit Fingerprint</h4>
            <TrackFingerprint
              metrics={m}
              layoutImageUrl={layoutData.layout_image_url}
              layoutName={layoutData.name}
              lengthKm={layoutData.length_km}
              turns={layoutData.turns}
            />
          </div>
        );
      })()}
    </div>
  );
}
