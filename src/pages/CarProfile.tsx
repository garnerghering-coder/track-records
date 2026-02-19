import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Globe, Wrench } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FlagImage from "@/components/FlagImage";

const categoryLabels: Record<string, string> = {
  karting: "Karting", single_seater: "Single Seater", gt: "GT",
  touring_car: "Touring Car", sports_car: "Sports Car", rally: "Rally",
  endurance: "Endurance", formula: "Formula", stock_car: "Stock Car", other: "Other",
};

const CarProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const [car, setCar] = useState<any>(null);
  const [raceHistory, setRaceHistory] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data: carData } = await supabase.from("car_models").select("*").eq("id", id).single();
      if (!carData) { setLoading(false); return; }
      setCar(carData);

      // Fetch race entries with this car
      const { data: entries } = await supabase
        .from("race_entries")
        .select("id, team_name, team_profile_id, car_number, race_class, finishing_position, class_position, status, race_event_id, race_events(id, event_name, series_name, season_year, category, location, event_date)")
        .eq("car_model_id", id)
        .order("created_at", { ascending: false })
        .limit(100);

      const sortedEntries = (entries || []).sort((a: any, b: any) => {
        const dateA = a.race_events?.event_date || "";
        const dateB = b.race_events?.event_date || "";
        return dateB.localeCompare(dateA);
      });
      setRaceHistory(sortedEntries);

      // Get unique teams
      const teamMap = new Map<string, any>();
      for (const e of sortedEntries) {
        if (e.team_profile_id && !teamMap.has(e.team_profile_id)) {
          teamMap.set(e.team_profile_id, { id: e.team_profile_id, name: e.team_name });
        }
      }
      setTeams(Array.from(teamMap.values()));

      // Also fetch drivers for these entries
      const entryIds = sortedEntries.map((e: any) => e.id);
      if (entryIds.length > 0) {
        const { data: junctions } = await supabase
          .from("race_entry_drivers")
          .select("race_entry_id, driver_profiles(id, first_name, last_name, nationality)")
          .in("race_entry_id", entryIds);

        const driverMap: Record<string, any[]> = {};
        (junctions || []).forEach((j: any) => {
          if (!driverMap[j.race_entry_id]) driverMap[j.race_entry_id] = [];
          if (j.driver_profiles) driverMap[j.race_entry_id].push(j.driver_profiles);
        });

        setRaceHistory(prev => prev.map(e => ({ ...e, drivers: driverMap[e.id] || [] })));
      }

      setLoading(false);
    };
    fetchData();
  }, [id]);

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="flex items-center justify-center pt-32"><p className="text-muted-foreground">Loading…</p></div></div>;
  if (!car) return <div className="min-h-screen bg-background"><Header /><div className="flex flex-col items-center justify-center pt-32 gap-4"><p className="text-muted-foreground">Car not found.</p></div></div>;

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
              <h1 className="font-display text-3xl font-bold sm:text-4xl" style={{ color: "hsl(0 0% 100%)" }}>{car.name}</h1>
              <div className="mt-2 flex items-center gap-4 flex-wrap text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                {car.manufacturer && <span>{car.manufacturer}</span>}
                {car.category && <Badge variant="secondary" className="text-xs">{categoryLabels[car.category] || car.category}</Badge>}
                {car.year_introduced && <span>Introduced {car.year_introduced}</span>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container py-10 grid gap-10 lg:grid-cols-3">
        <div className="space-y-6">
          {car.description && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-display text-sm font-semibold text-card-foreground mb-2">About</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{car.description}</p>
            </div>
          )}
          {car.website && (
            <div className="rounded-lg border border-border bg-card p-5">
              <a href={car.website} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                <Globe className="h-4 w-4" /> Official Website
              </a>
            </div>
          )}
          {teams.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-display text-sm font-semibold text-card-foreground mb-3">Teams Using This Car</h3>
              <div className="space-y-2">
                {teams.map(t => (
                  <Link key={t.id} to={`/team/${t.id}`} className="block text-sm text-primary hover:underline">{t.name}</Link>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-lg border border-border bg-card p-5 text-center">
            <p className="text-sm font-medium text-card-foreground mb-1">Missing or incorrect information?</p>
            <p className="text-xs text-muted-foreground mb-3">Help us improve this car profile.</p>
            <Link to="/contribute"><Button size="sm" variant="outline">Contribute</Button></Link>
          </div>
        </div>

        <div className="lg:col-span-2">
          <h2 className="font-display text-xl font-semibold text-foreground mb-4">Race History</h2>
          {raceHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">No race entries found for this car.</p>
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>Driver(s)</TableHead>
                      <TableHead className="text-center">Pos</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {raceHistory.map((entry: any) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Link to={`/event/${entry.race_events?.id}`} className="text-primary hover:underline font-medium">
                            {entry.race_events?.event_name || "—"}
                          </Link>
                          <p className="text-xs text-muted-foreground">{entry.race_events?.series_name}</p>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {entry.race_events?.event_date
                            ? new Date(entry.race_events.event_date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
                            : entry.race_events?.season_year || "—"}
                        </TableCell>
                        <TableCell>
                          {entry.team_profile_id ? (
                            <Link to={`/team/${entry.team_profile_id}`} className="text-primary hover:underline">{entry.team_name}</Link>
                          ) : (
                            <span className="text-muted-foreground">{entry.team_name || "—"}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            {(entry.drivers || []).length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              (entry.drivers || []).map((d: any) => (
                                <Link key={d.id} to={`/driver/${d.id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                                  <FlagImage nationality={d.nationality} size={14} />
                                  {d.first_name} {d.last_name}
                                </Link>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-accent font-bold text-card-foreground text-base">
                          {entry.finishing_position ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span className={`text-sm ${["DNF", "DNS", "DSQ"].includes(entry.status) ? "text-destructive" : "text-muted-foreground"}`}>
                            {entry.status || "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default CarProfilePage;
