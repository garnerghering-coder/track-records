import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileDown } from "lucide-react";
import { exportSessionPdf } from "@/lib/pdf-export";
import FlagImage from "@/components/FlagImage";

export default function EventPage() {
  const { slug } = useParams();
  const [activeTab, setActiveTab] = useState<string>("");

  const { data: event, isLoading } = useQuery({
    queryKey: ["public_event", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v2_events")
        .select("*, v2_seasons(year, v2_series(name, short_name)), v2_circuits(name, country, layout_image_url)")
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
        .order("date", { ascending: true });
      if (error) throw error;
      if (data.length > 0 && !activeTab) setActiveTab(data[0].id);
      return data;
    },
    enabled: !!event,
  });

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
                  <SessionResults session={s} event={event} />
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

function SessionResults({ session, event }: { session: any; event: any }) {
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
        .select("*, v2_drivers(full_name, nationality), v2_teams(full_name, short_name), v2_cars(model_name, manufacturer)")
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

  // Extract custom columns from extra_data (excluding "Int" which is built-in)
  const extraDataKeys: { key: string; name: string }[] = [];
  if (results.length > 0) {
    const seenKeys = new Set<string>();
    for (const r of results) {
      const ed = (r as any).extra_data;
      if (ed && typeof ed === "object") {
        for (const [k] of Object.entries(ed)) {
          if (k === "Int") continue; // built-in, rendered separately
          if (!seenKeys.has(k)) {
            seenKeys.add(k);
            extraDataKeys.push({ key: k, name: k });
          }
        }
      }
    }
  }

  // Check if any result has an "Int" value
  const hasInt = results.some((r: any) => r.extra_data?.Int);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{session.name}</h3>
          <Badge variant="outline" className="text-[10px]">{type.replace(/_/g, " ")}</Badge>
          {session.date && <span className="text-xs text-muted-foreground">{new Date(session.date).toLocaleDateString()}</span>}
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
              <TableHead className="w-14">No.</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead className="w-10">Nat</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Car</TableHead>
              {isPractice && <><TableHead>Best Lap</TableHead><TableHead>Gap</TableHead>{hasInt && <TableHead>Int</TableHead>}<TableHead>Laps</TableHead></>}
              {isQual && <><TableHead>Q1</TableHead><TableHead>Q2</TableHead><TableHead>Q3</TableHead><TableHead>Best</TableHead><TableHead>Gap</TableHead>{hasInt && <TableHead>Int</TableHead>}<TableHead>Laps</TableHead></>}
              {isRace && <><TableHead>Laps</TableHead><TableHead>Time/Gap</TableHead><TableHead>FL</TableHead>{hasInt && <TableHead>Int</TableHead>}<TableHead>Pits</TableHead><TableHead>Pts</TableHead><TableHead>Status</TableHead></>}
              {extraDataKeys.map(col => (
                <TableHead key={col.key}>{col.name}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r: any, i: number) => (
              <TableRow key={r.id} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                <TableCell className="font-bold text-center">{r.position}</TableCell>
                <TableCell className="text-center font-mono text-xs">{r.car_number || "—"}</TableCell>
                <TableCell className="font-medium">{r.v2_drivers?.full_name || "—"}</TableCell>
                <TableCell><FlagImage nationality={r.v2_drivers?.nationality} size={18} /></TableCell>
                <TableCell className="text-muted-foreground">{r.v2_teams?.short_name || r.v2_teams?.full_name || "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : "—"}</TableCell>
                {isPractice && <>
                  <TableCell className="font-mono text-xs">{r.best_lap_time || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.gap_to_p1 || "—"}</TableCell>
                  {hasInt && <TableCell className="font-mono text-xs">{(r.extra_data as any)?.Int || "—"}</TableCell>}
                  <TableCell className="text-xs">{r.laps_run || "—"}</TableCell>
                </>}
                {isQual && <>
                  <TableCell className="font-mono text-xs">{r.q1_time || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.q2_time || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.q3_time || "—"}</TableCell>
                  <TableCell className="font-mono text-xs font-semibold">{r.best_time || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.gap_to_pole || "—"}</TableCell>
                  {hasInt && <TableCell className="font-mono text-xs">{(r.extra_data as any)?.Int || "—"}</TableCell>}
                  <TableCell className="text-xs">{r.laps_run || "—"}</TableCell>
                </>}
                {isRace && <>
                  <TableCell className="text-xs">{r.laps_completed || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.total_time || r.gap_to_leader || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.fastest_lap_time || "—"}</TableCell>
                  {hasInt && <TableCell className="font-mono text-xs">{(r.extra_data as any)?.Int || "—"}</TableCell>}
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
    </div>
  );
}
