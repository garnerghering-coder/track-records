import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Globe, Car, Trophy } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FlagImage from "@/components/FlagImage";

const categoryLabels: Record<string, string> = {
  karting: "Karting", single_seater: "Single Seater", gt: "GT",
  touring_car: "Touring Car", sports_car: "Sports Car", rally: "Rally",
  endurance: "Endurance", formula: "Formula", stock_car: "Stock Car", other: "Other",
};

interface DriverInfo {
  id: string;
  first_name: string;
  last_name: string;
  nationality: string | null;
}

const TeamProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const [team, setTeam] = useState<any>(null);
  const [raceHistory, setRaceHistory] = useState<any[]>([]);
  const [currentDrivers, setCurrentDrivers] = useState<DriverInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data: teamData } = await (supabase
        .from("team_profiles" as any)
        .select("*")
        .eq("id", id)
        .single() as any);

      if (!teamData) { setLoading(false); return; }
      setTeam(teamData);

      // Fetch race entries linked to this team
      const entriesRes: any = await supabase
        .from("race_entries" as any)
        .select("id, team_name, car_number, race_class, finishing_position, class_position, status, race_event_id, race_events(id, event_name, series_name, season_year, category, location, event_date)")
        .eq("team_profile_id", id)
        .order("created_at", { ascending: false });
      const entries = entriesRes.data;

      // Also try matching by team_name if no team_profile_id entries
      let allEntries = entries || [];
      if (allEntries.length === 0 && (teamData as any).name) {
        const { data: nameEntries } = await supabase
          .from("race_entries")
          .select("id, team_name, car_number, race_class, finishing_position, class_position, status, race_event_id, race_events(id, event_name, series_name, season_year, category, location, event_date)")
          .eq("team_name", (teamData as any).name)
          .order("created_at", { ascending: false });
        allEntries = nameEntries || [];
      }

      setRaceHistory(allEntries.sort((a: any, b: any) => {
        const dateA = a.race_events?.event_date || "";
        const dateB = b.race_events?.event_date || "";
        if (dateA || dateB) return dateB.localeCompare(dateA);
        return (b.race_events?.season_year || 0) - (a.race_events?.season_year || 0);
      }));

      // Get current drivers from most recent entries
      const entryIds = allEntries.slice(0, 20).map((e: any) => e.id);
      if (entryIds.length > 0) {
        const { data: junctions } = await supabase
          .from("race_entry_drivers")
          .select("driver_profile_id, driver_profiles(id, first_name, last_name, nationality)")
          .in("race_entry_id", entryIds);

        const driverMap = new Map<string, DriverInfo>();
        (junctions || []).forEach((j: any) => {
          if (j.driver_profiles && !driverMap.has(j.driver_profiles.id)) {
            driverMap.set(j.driver_profiles.id, j.driver_profiles);
          }
        });
        setCurrentDrivers(Array.from(driverMap.values()));
      }

      setLoading(false);
    };
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center pt-32">
          <p className="text-muted-foreground">Loading team…</p>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex flex-col items-center justify-center pt-32 gap-4">
          <p className="text-muted-foreground">Team not found.</p>
          <Link to="/teams"><Button variant="outline">Back to Teams</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="pt-24 pb-12" style={{ background: "linear-gradient(135deg, hsl(220 20% 8%) 0%, hsl(220 25% 14%) 100%)" }}>
        <div className="container">
          <Link to="/teams" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            <ArrowLeft className="h-4 w-4" /> Back to teams
          </Link>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-primary/20 overflow-hidden">
              {team.logo_url ? (
                <img src={team.logo_url} alt={team.name} className="h-full w-full object-cover" />
              ) : (
                <Car className="h-10 w-10 text-primary" />
              )}
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold sm:text-4xl" style={{ color: "hsl(0 0% 100%)" }}>
                {team.name}
              </h1>
              <div className="mt-2 flex items-center gap-4 flex-wrap text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                {team.nationality && (
                  <span className="inline-flex items-center gap-1">
                    <FlagImage nationality={team.nationality} size={16} /> {team.nationality}
                  </span>
                )}
                {team.primary_category && (
                  <span>{categoryLabels[team.primary_category] || team.primary_category}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container py-10 grid gap-10 lg:grid-cols-3">
        {/* Sidebar */}
        <div className="space-y-6">
          {team.bio && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-display text-sm font-semibold text-card-foreground mb-2">About</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{team.bio}</p>
            </div>
          )}

          {team.website && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-display text-sm font-semibold text-card-foreground mb-2">Links</h3>
              <a href={team.website} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                <Globe className="h-4 w-4" /> Website
              </a>
            </div>
          )}

          {currentDrivers.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-display text-sm font-semibold text-card-foreground mb-3">Drivers</h3>
              <div className="space-y-2">
                {currentDrivers.map(d => (
                  <Link
                    key={d.id}
                    to={`/driver/${d.id}`}
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <FlagImage nationality={d.nationality} size={14} />
                    {d.first_name} {d.last_name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Contribute CTA */}
          <div className="rounded-lg border border-border bg-card p-5 text-center">
            <p className="text-sm font-medium text-card-foreground mb-1">Missing or incorrect information?</p>
            <p className="text-xs text-muted-foreground mb-3">Help us improve this team profile by contributing updates.</p>
            <Link to="/contribute"><Button size="sm" variant="outline">Contribute</Button></Link>
          </div>
        </div>

        {/* Race History */}
        <div className="lg:col-span-2">
          <h2 className="font-display text-xl font-semibold text-foreground mb-4">Race History</h2>
          {raceHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">No race entries found for this team.</p>
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Series</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead className="text-center">Pos</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {raceHistory.map((entry: any) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Link
                            to={`/event/${entry.race_events?.id}`}
                            className="text-primary hover:underline font-medium"
                          >
                            {entry.race_events?.event_name || "—"}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{entry.race_events?.series_name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{entry.race_events?.season_year || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{entry.race_class || "—"}</TableCell>
                        <TableCell className="text-center font-accent font-bold text-card-foreground text-base">
                          {entry.finishing_position ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span className={`text-sm ${entry.status === "DNF" || entry.status === "DNS" || entry.status === "DSQ" ? "text-destructive" : "text-muted-foreground"}`}>
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

export default TeamProfilePage;
