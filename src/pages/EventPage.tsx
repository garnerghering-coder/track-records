import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileDown, TriangleIcon } from "lucide-react";
import { exportSessionPdf } from "@/lib/pdf-export";
import FlagImage from "@/components/FlagImage";
import { parseTime } from "@/lib/time-calc";
import WeatherBubble from "@/components/WeatherBubble";

export default function EventPage() {
  const { slug } = useParams();
  const [activeTab, setActiveTab] = useState<string>("");

  const { data: event, isLoading } = useQuery({
    queryKey: ["public_event", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v2_events")
        .select("*, v2_seasons(id, year, v2_series(name, short_name)), v2_circuits(name, country, layout_image_url)")
        .eq("id", slug!)
        .eq("status", "published" as any)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["public_sessions", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v2_sessions")
        .select("*")
      .eq("event_id", slug!)
      .eq("status", "published" as any)
      .order("sort_order", { ascending: true });
      if (error) throw error;
      if (data.length > 0 && !activeTab) setActiveTab(data[0].id);
      return data;
    },
    enabled: !!event,
  });

  // Fetch team season display names for this event's season
  const seasonId = (event as any)?.v2_seasons?.id;
  const { data: teamSeasonNames = [] } = useQuery({
    queryKey: ["team_season_names", seasonId],
    queryFn: async () => {
      const { data } = await supabase.from("v2_team_season_names" as any).select("*").eq("season_id", seasonId);
      return (data || []) as any[];
    },
    enabled: !!seasonId,
  });

  // Build a lookup map: team_id -> display_name
  const teamNameMap: Record<string, string> = {};
  for (const tsn of teamSeasonNames) {
    teamNameMap[tsn.team_id] = tsn.display_name;
  }

  // Fetch weather data for all sessions
  const sessionIds = sessions.map((s: any) => s.id);
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                {sessions.map((s: any) => (
                  <TabsTrigger key={s.id} value={s.id} className="text-xs sm:text-sm">
                    {s.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              {sessions.map((s: any) => (
                <TabsContent key={s.id} value={s.id}>
                  <SessionResults session={s} event={event} teamNameMap={teamNameMap} allSessions={sessions} weatherMap={weatherMap} />
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

// Position change indicator component
function PositionDelta({ racePos, qualPos }: { racePos: number | null; qualPos: number | null }) {
  if (racePos === null || qualPos === null) return null;
  const delta = qualPos - racePos; // positive = gained positions
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

function SessionResults({ session, event, teamNameMap, allSessions, weatherMap }: { session: any; event: any; teamNameMap: Record<string, string>; allSessions: any[]; weatherMap: Record<string, any> }) {
  const type = session.session_type;
  const isRace = type === "race" || type === "sprint_race";
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
      return data;
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

  // For race sessions, fetch qualifying results to compute position delta
  const qualSession = isRace ? allSessions.find((s: any) => s.session_type === "qualifying" || s.session_type === "sprint_qualifying") : null;
  const { data: qualResults = [] } = useQuery({
    queryKey: ["public_qual_for_race", qualSession?.id],
    queryFn: async () => {
      if (!qualSession) return [];
      const { data } = await supabase.from("v2_qualifying_results" as any).select("driver_id, position").eq("session_id", qualSession.id).order("position");
      return (data || []) as any[];
    },
    enabled: isRace && !!qualSession,
  });

  // Build qualifying position lookup: driver_id -> qualifying position
  const qualPosMap: Record<string, number> = {};
  for (const qr of qualResults) {
    if (qr.driver_id && qr.position) qualPosMap[qr.driver_id] = qr.position;
  }

  // Extract custom columns from extra_data (excluding "Int" which is built-in)
  const extraDataKeys: { key: string; name: string }[] = [];
  if (results.length > 0) {
    const seenKeys = new Set<string>();
    for (const r of results) {
      const ed = (r as any).extra_data;
      if (ed && typeof ed === "object") {
        for (const [k] of Object.entries(ed)) {
          if (k === "Int" || k === "avg_kmh") continue;
          if (!seenKeys.has(k)) {
            seenKeys.add(k);
            extraDataKeys.push({ key: k, name: k });
          }
        }
      }
    }
  }

  const hasInt = results.some((r: any) => r.extra_data?.Int);

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

  const handleExport = async () => {
    try {
      await exportSessionPdf({
        eventName: event.name,
        seriesName: event.v2_seasons?.v2_series?.name || "",
        circuitName: event.v2_circuits?.name || "",
        sessionName: session.name,
        sessionDate: session.date,
        sessionType: type,
        results,
        incidents,
        customColumns: extraDataKeys,
        hasInt,
      });
    } catch (e: any) {
      console.error("PDF export failed:", e);
    }
  };

  // Helper to get team display name (season alias or fallback)
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
          <WeatherBubble weather={weatherMap[session.id] || null} />
          {!weatherMap[session.id] && (
            <Badge variant="outline" className="text-[10px]">{type.replace(/_/g, " ")}</Badge>
          )}
          {session.date && <span className="text-xs text-muted-foreground">{session.date.split("T")[0]}</span>}
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <FileDown className="h-3.5 w-3.5 mr-1" />Export PDF
        </Button>
      </div>

      <div className="overflow-x-auto border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12">Pos</TableHead>
              {isRace && <TableHead className="w-12">+/-</TableHead>}
              <TableHead className="w-14">No.</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead className="w-10">Nat</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Car</TableHead>
              {isPractice && <><TableHead>Best Lap</TableHead><TableHead>Gap</TableHead>{hasInt && <TableHead>Int</TableHead>}<TableHead>Laps</TableHead></>}
              {isQual && <><TableHead>Q1</TableHead><TableHead>Q2</TableHead><TableHead>Q3</TableHead><TableHead>Best</TableHead><TableHead>Gap</TableHead>{hasInt && <TableHead>Int</TableHead>}<TableHead>Laps</TableHead></>}
              {isRace && <><TableHead>Laps</TableHead><TableHead>Time</TableHead><TableHead>Gap</TableHead>{hasInt && <TableHead>Int</TableHead>}<TableHead>Best Lap</TableHead><TableHead>Avg Lap</TableHead><TableHead>Pits</TableHead><TableHead>Pts</TableHead><TableHead>Status</TableHead></>}
              {extraDataKeys.map(col => (
                <TableHead key={col.key}>{col.name}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r: any, i: number) => (
              <TableRow key={r.id} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                <TableCell className="font-bold text-center">{r.position}</TableCell>
                {isRace && (
                  <TableCell className="text-center">
                    <PositionDelta racePos={r.position} qualPos={r.driver_id ? qualPosMap[r.driver_id] ?? null : null} />
                  </TableCell>
                )}
                <TableCell className="text-center font-mono text-xs">{r.car_number || "—"}</TableCell>
                <TableCell className="font-medium">
                  {r.driver_id ? <Link to={`/driver/${r.driver_id}`} className="hover:text-primary transition-colors">{r.v2_drivers?.full_name || "—"}</Link> : "—"}
                </TableCell>
                <TableCell><FlagImage nationality={r.v2_drivers?.nationality} size={18} /></TableCell>
                <TableCell className="text-muted-foreground">
                  {r.team_id ? <Link to={`/team/${r.team_id}`} className="hover:text-primary transition-colors">{getTeamName(r)}</Link> : getTeamName(r)}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {r.car_id ? <Link to={`/car/${r.car_id}`} className="hover:text-primary transition-colors">{r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : "—"}</Link> : (r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : "—")}
                </TableCell>
                {isPractice && <>
                  <TableCell className={`font-mono text-xs ${r.best_lap_time && r.best_lap_time === fastestLapStr ? "text-purple-400 font-semibold" : ""}`}>{r.best_lap_time || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.gap_to_p1 || "—"}</TableCell>
                  {hasInt && <TableCell className="font-mono text-xs">{(r.extra_data as any)?.Int || "—"}</TableCell>}
                  <TableCell className="text-xs">{r.laps_run || "—"}</TableCell>
                </>}
                {isQual && <>
                  <TableCell className="font-mono text-xs">{r.q1_time || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.q2_time || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.q3_time || "—"}</TableCell>
                  <TableCell className={`font-mono text-xs font-semibold ${r.best_time && r.best_time === fastestLapStr ? "text-purple-400" : ""}`}>{r.best_time || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.gap_to_pole || "—"}</TableCell>
                  {hasInt && <TableCell className="font-mono text-xs">{(r.extra_data as any)?.Int || "—"}</TableCell>}
                  <TableCell className="text-xs">{r.laps_run || "—"}</TableCell>
                </>}
                {isRace && <>
                  <TableCell className="text-xs">{r.laps_completed || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.total_time || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.gap_to_leader || "—"}</TableCell>
                  {hasInt && <TableCell className="font-mono text-xs">{(r.extra_data as any)?.Int || "—"}</TableCell>}
                  <TableCell className={`font-mono text-xs ${r.fastest_lap_time && r.fastest_lap_time === fastestLapStr ? "text-purple-400 font-semibold" : ""}`}>{r.fastest_lap_time || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.average_lap_time || "—"}</TableCell>
                  <TableCell className="text-xs">{r.pit_stops ?? "—"}</TableCell>
                  <TableCell className="text-xs font-semibold">{r.points ?? "—"}</TableCell>
                  <TableCell>
                    {r.status && r.status !== "finished" ? (
                      <Badge variant="destructive" className="text-[10px]">{r.status.toUpperCase()}</Badge>
                    ) : null}
                  </TableCell>
                </>}
                {extraDataKeys.map(col => (
                  <TableCell key={col.key} className="text-xs">{(r.extra_data as any)?.[col.key] || "—"}</TableCell>
                ))}
              </TableRow>
            ))}
            {results.length === 0 && <TableRow><TableCell colSpan={20} className="text-center text-muted-foreground py-8">No results entered yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* Built-in incidents for race sessions */}
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

      {/* Custom annotation sections */}
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
    </div>
  );
}
