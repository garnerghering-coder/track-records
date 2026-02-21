import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FlagImage from "@/components/FlagImage";
import ReportDialog from "@/components/ReportDialog";
import { formatDateRange } from "@/lib/date-utils";

const DriverProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const [driver, setDriver] = useState<any>(null);
  const [raceHistory, setRaceHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data: d } = await supabase.from("v2_drivers").select("*").eq("id", id).single();
      setDriver(d);

      if (d) {
        // Fetch race results for this driver across all session types
        const { data: raceResults } = await supabase
          .from("v2_race_results" as any)
          .select("position, status, car_number, total_time, gap_to_leader, v2_teams(id, full_name), v2_cars(id, model_name, manufacturer), v2_sessions(id, name, session_type, event_id, date, v2_events(id, name, start_date, end_date, v2_seasons(year, v2_series(id, name)), v2_circuits(id, name, country)))")
          .eq("driver_id", id)
          .order("created_at", { ascending: false })
          .limit(200);

        // Flatten and sort
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
      }
      setLoading(false);
    };
    fetchData();
  }, [id]);

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="flex items-center justify-center pt-32"><p className="text-muted-foreground">Loading profile…</p></div></div>;
  if (!driver) return <div className="min-h-screen bg-background"><Header /><div className="flex flex-col items-center justify-center pt-32 gap-4"><p className="text-muted-foreground">Driver profile not found.</p><Link to="/search"><Button variant="outline">Back to Search</Button></Link></div></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="pt-24 pb-12" style={{ background: "linear-gradient(135deg, hsl(220 20% 8%) 0%, hsl(220 25% 14%) 100%)" }}>
        <div className="container">
          <Link to="/search" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            <ArrowLeft className="h-4 w-4" /> Back to search
          </Link>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
              <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-primary/20 text-primary font-display text-3xl font-bold">
                {driver.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
              </div>
              <div>
                <h1 className="font-display text-3xl font-bold sm:text-4xl" style={{ color: "hsl(0 0% 100%)" }}>
                  {driver.full_name}
                </h1>
                <div className="mt-2 flex items-center gap-4 flex-wrap text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                  {driver.nationality && <span className="inline-flex items-center gap-1"><FlagImage nationality={driver.nationality} size={16} /> {driver.nationality}</span>}
                  {driver.date_of_birth && <span>Born: {new Date(driver.date_of_birth).toLocaleDateString()}</span>}
                </div>
              </div>
            </div>
            <div className="self-start sm:self-auto">
              <ReportDialog reportType="driver" targetId={driver.id} targetName={driver.full_name} />
            </div>
          </div>
        </div>
      </section>

      <div className="container py-10">
        <h2 className="font-display text-xl font-semibold text-foreground mb-4">Race Results</h2>
        {raceHistory.length === 0 ? (
          <p className="text-muted-foreground text-sm">No race results found for this driver.</p>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Car</TableHead>
                    <TableHead className="text-center">Pos</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {raceHistory.map((r: any, i: number) => (
                    <TableRow key={r.id || i}>
                      <TableCell>
                        {r.event ? (
                          <Link to={`/events/${r.event.id}`} className="text-primary hover:underline font-medium">
                            {r.event.name}
                          </Link>
                        ) : "—"}
                        <p className="text-xs text-muted-foreground">
                          {r.event?.v2_seasons?.v2_series?.name} {r.event?.v2_seasons?.year && `· ${r.event.v2_seasons.year}`}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.session?.name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {r.event?.start_date ? formatDateRange(r.event.start_date, r.event.end_date) : "—"}
                      </TableCell>
                      <TableCell>
                        {r.v2_teams ? (
                          <Link to={`/team/${r.v2_teams.id}`} className="text-primary hover:underline text-sm">{r.v2_teams.full_name}</Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : "—"}
                      </TableCell>
                      <TableCell className="text-center font-accent font-bold text-card-foreground text-base">
                        {r.position ?? "—"}
                      </TableCell>
                      <TableCell>
                        {r.status && r.status !== "finished" ? (
                          <span className="text-destructive text-sm font-medium">{r.status.toUpperCase()}</span>
                        ) : null}
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
          <p className="text-xs text-muted-foreground mb-3">Help us improve this driver profile by contributing updates.</p>
          <Link to="/contribute"><Button size="sm" variant="outline">Contribute</Button></Link>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default DriverProfilePage;
