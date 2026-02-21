import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Wrench } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FlagImage from "@/components/FlagImage";
import ReportDialog from "@/components/ReportDialog";
import { formatDateRange } from "@/lib/date-utils";

const CarProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const [car, setCar] = useState<any>(null);
  const [raceHistory, setRaceHistory] = useState<any[]>([]);
  const [teamAliasMap, setTeamAliasMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data: c } = await supabase.from("v2_cars").select("*").eq("id", id).single();
      setCar(c);

      if (c) {
        const { data: raceResults } = await supabase
          .from("v2_race_results" as any)
          .select("position, status, car_number, v2_drivers(id, full_name, nationality), v2_teams(id, full_name), v2_sessions(id, name, session_type, event_id, date, v2_events(id, name, start_date, end_date, v2_seasons(id, year, v2_series(name)), v2_circuits(name, country)))")
          .eq("car_id", id)
          .order("created_at", { ascending: false })
          .limit(200);

        const results = (raceResults || []).map((r: any) => ({
          ...r,
          event: r.v2_sessions?.v2_events,
          session: r.v2_sessions,
        })).sort((a: any, b: any) => {
          const dateA = a.event?.start_date || "";
          const dateB = b.event?.start_date || "";
          return dateB.localeCompare(dateA);
        });
        setRaceHistory(results);

        // Build team alias map
        const seasonIds = new Set<string>();
        for (const r of results) {
          const sid = r.event?.v2_seasons?.id;
          if (sid) seasonIds.add(sid);
        }
        if (seasonIds.size > 0) {
          const { data: aliases } = await supabase
            .from("v2_team_season_names" as any)
            .select("team_id, season_id, display_name")
            .in("season_id", Array.from(seasonIds));
          const map: Record<string, string> = {};
          for (const a of (aliases || []) as any[]) {
            map[`${a.team_id}:${a.season_id}`] = a.display_name;
          }
          setTeamAliasMap(map);
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [id]);

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="flex items-center justify-center pt-32"><p className="text-muted-foreground">Loading…</p></div></div>;
  if (!car) return <div className="min-h-screen bg-background"><Header /><div className="flex flex-col items-center justify-center pt-32 gap-4"><p className="text-muted-foreground">Car not found.</p></div></div>;

  const displayName = [car.manufacturer, car.model_name].filter(Boolean).join(" ");

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="pt-24 pb-12" style={{ background: "linear-gradient(135deg, hsl(220 20% 8%) 0%, hsl(220 25% 14%) 100%)" }}>
        <div className="container">
          <Link to="/cars" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            <ArrowLeft className="h-4 w-4" /> Back to Cars
          </Link>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-primary/20">
              <Wrench className="h-10 w-10 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold sm:text-4xl" style={{ color: "hsl(0 0% 100%)" }}>{displayName}</h1>
              {car.manufacturer && <p className="mt-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>{car.manufacturer}</p>}
            </div>
          </div>
        </div>
      </section>

      <div className="container py-10">
        <h2 className="font-display text-xl font-semibold text-foreground mb-4">Race Results</h2>
        {raceHistory.length === 0 ? (
          <p className="text-muted-foreground text-sm">No race results found for this car.</p>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead className="text-center">Pos</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {raceHistory.map((r: any, i: number) => (
                    <TableRow key={r.id || i}>
                      <TableCell>
                        {r.event ? <Link to={`/events/${r.event.id}`} className="text-primary hover:underline font-medium">{r.event.name}</Link> : "—"}
                        <p className="text-xs text-muted-foreground">{r.event?.v2_seasons?.v2_series?.name} {r.event?.v2_seasons?.year && `· ${r.event.v2_seasons.year}`}</p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.session?.name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {r.event?.start_date ? formatDateRange(r.event.start_date, r.event.end_date) : "—"}
                      </TableCell>
                      <TableCell>
                        {r.v2_drivers ? (
                          <Link to={`/driver/${r.v2_drivers.id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                            <FlagImage nationality={r.v2_drivers.nationality} size={14} />
                            {r.v2_drivers.full_name}
                          </Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {r.v2_teams ? <Link to={`/team/${r.v2_teams.id}`} className="text-primary hover:underline text-sm">{teamAliasMap[`${r.v2_teams.id}:${r.event?.v2_seasons?.id}`] || r.v2_teams.full_name}</Link> : "—"}
                      </TableCell>
                      <TableCell className="text-center font-accent font-bold text-card-foreground text-base">{r.position ?? "—"}</TableCell>
                      <TableCell>
                        {r.status && r.status !== "finished" ? <span className="text-destructive text-sm font-medium">{r.status.toUpperCase()}</span> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="mt-8 rounded-lg border border-border bg-card p-5 text-center">
          <p className="text-sm font-medium text-card-foreground mb-1">Missing or incorrect information?</p>
          <p className="text-xs text-muted-foreground mb-3">Help us improve this car profile.</p>
          <ReportDialog reportType="car" targetId={id!} targetName={car.model_name} />
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default CarProfilePage;
