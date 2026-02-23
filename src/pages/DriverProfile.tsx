import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
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
  const [allSessionResults, setAllSessionResults] = useState<any[]>([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [teamAliasMap, setTeamAliasMap] = useState<Record<string, string>>({});
  const [selectedSeason, setSelectedSeason] = useState("all");
  const [loading, setLoading] = useState(true);

  // Derive season years and compute averages
  const qualifyingResults = useMemo(() => allSessionResults.filter(r => r._source === "qualifying"), [allSessionResults]);

  const seasonYears = useMemo(() => {
    const years = new Set<number>();
    for (const r of [...raceHistory, ...qualifyingResults]) {
      const y = r.event?.v2_seasons?.year;
      if (y) years.add(y);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [raceHistory, qualifyingResults]);

  const stats = useMemo(() => {
    const filterBySeason = (rows: any[]) =>
      selectedSeason === "all" ? rows : rows.filter(r => String(r.event?.v2_seasons?.year) === selectedSeason);

    const raceRows = filterBySeason(raceHistory).filter(r => r.position != null && (!r.status || r.status === "finished" || r.status === "classified"));
    const qualRows = filterBySeason(qualifyingResults).filter(r => r.position != null);

    const avg = (arr: any[]) => arr.length === 0 ? null : arr.reduce((s, r) => s + r.position, 0) / arr.length;

    return {
      avgRace: avg(raceRows),
      raceCount: raceRows.length,
      avgQual: avg(qualRows),
      qualCount: qualRows.length,
    };
  }, [raceHistory, qualifyingResults, selectedSeason]);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data: d } = await supabase.from("v2_drivers").select("*").eq("id", id).single();
      setDriver(d);

      if (d) {
        const sessionSelect = "id, name, session_type, event_id, date, parent_session_id, v2_events(id, name, start_date, end_date, v2_seasons(id, year, v2_series(id, name)), v2_circuits(id, name, country))";
        const sortResults = (items: any[]) => items.sort((a: any, b: any) => {
          const dateA = a.event?.start_date || "";
          const dateB = b.event?.start_date || "";
          return dateB.localeCompare(dateA);
        });

        // Fetch race results where this driver is the primary driver
        const { data: raceResults } = await supabase
          .from("v2_race_results" as any)
          .select(`id, position, status, car_number, total_time, gap_to_leader, driver_id, session_id, v2_teams(id, full_name), v2_cars(id, model_name, manufacturer), v2_sessions(${sessionSelect})`)
          .eq("driver_id", id)
          .order("created_at", { ascending: false })
          .limit(200);

        // Also find races where this driver is a co-driver (same car_number in same session)
        // First get all car_numbers and session_ids for results where this driver appears
        const primaryResults = (raceResults || []) as any[];
        
        // Find additional co-driver results: look for sessions where this driver has qualifying/practice results
        // but not race results, by matching car_number in the same session
        const { data: allDriverResults } = await supabase
          .from("v2_race_results" as any)
          .select(`id, position, status, car_number, total_time, gap_to_leader, driver_id, session_id, v2_teams(id, full_name), v2_cars(id, model_name, manufacturer), v2_sessions(${sessionSelect})`)
          .order("created_at", { ascending: false })
          .limit(500);

        // Build a set of (session_id, car_number) pairs where this driver has a direct result
        const directPairs = new Set(primaryResults.map((r: any) => `${r.session_id}:${r.car_number}`));
        
        // Find car_numbers this driver uses (from qualifying/practice)
        const { data: qualForDriver } = await supabase
          .from("v2_qualifying_results" as any)
          .select("session_id, car_number, v2_sessions(event_id)")
          .eq("driver_id", id);
        const { data: pracForDriver } = await supabase
          .from("v2_practice_results" as any)
          .select("session_id, car_number, v2_sessions(event_id)")
          .eq("driver_id", id);
        
        // Build map of event_id -> car_numbers this driver uses
        const driverCarsByEvent = new Map<string, Set<string>>();
        for (const r of [...(qualForDriver || []), ...(pracForDriver || [])] as any[]) {
          if (r.car_number && r.v2_sessions?.event_id) {
            const eventId = r.v2_sessions.event_id;
            if (!driverCarsByEvent.has(eventId)) driverCarsByEvent.set(eventId, new Set());
            driverCarsByEvent.get(eventId)!.add(r.car_number);
          }
        }

        // Also add car_numbers from primary race results
        for (const r of primaryResults) {
          if (r.car_number && r.v2_sessions?.v2_events?.id) {
            const eventId = r.v2_sessions.v2_events.id;
            if (!driverCarsByEvent.has(eventId)) driverCarsByEvent.set(eventId, new Set());
            driverCarsByEvent.get(eventId)!.add(r.car_number);
          }
        }

        // Find co-driver race results: same event + car_number, different driver, not already in direct results
        const coDriverResults: any[] = [];
        for (const r of (allDriverResults || []) as any[]) {
          if (r.driver_id === id) continue; // Already in primary results
          if (!r.car_number || !r.v2_sessions?.v2_events?.id) continue;
          const eventId = r.v2_sessions.v2_events.id;
          const carNumbers = driverCarsByEvent.get(eventId);
          if (carNumbers && carNumbers.has(r.car_number) && !directPairs.has(`${r.session_id}:${r.car_number}`)) {
            coDriverResults.push(r);
            directPairs.add(`${r.session_id}:${r.car_number}`);
          }
        }

        const mapResult = (r: any, source: string) => ({
          ...r,
          event: r.v2_sessions?.v2_events,
          session: r.v2_sessions,
          _source: source,
        });

        // Combine and filter out hourly sub-sessions (parent_session_id not null)
        const allRaceRows = [...primaryResults, ...coDriverResults]
          .map((r: any) => mapResult(r, "race"))
          .filter((r: any) => !r.session?.parent_session_id);

        // Deduplicate by session_id + car_number
        const seen = new Set<string>();
        const uniqueRaceRows = allRaceRows.filter(r => {
          const key = `${r.session?.id}:${r.car_number}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        
        setRaceHistory(sortResults([...uniqueRaceRows]));

        // Fetch qualifying results (only for this driver directly)
        const { data: qualResults } = await supabase
          .from("v2_qualifying_results" as any)
          .select(`position, car_number, best_time, gap_to_pole, v2_teams(id, full_name), v2_cars(id, model_name, manufacturer), v2_sessions(${sessionSelect})`)
          .eq("driver_id", id)
          .order("created_at", { ascending: false })
          .limit(200);

        // Fetch practice results
        const { data: pracResults } = await supabase
          .from("v2_practice_results" as any)
          .select(`position, car_number, best_lap_time, gap_to_p1, v2_teams(id, full_name), v2_cars(id, model_name, manufacturer), v2_sessions(${sessionSelect})`)
          .eq("driver_id", id)
          .order("created_at", { ascending: false })
          .limit(200);

        const qualRows = (qualResults || []).map((r: any) => mapResult(r, "qualifying"));
        const pracRows = (pracResults || []).map((r: any) => mapResult(r, "practice"));
        const allRows = [...uniqueRaceRows, ...qualRows, ...pracRows];
        setAllSessionResults(sortResults([...allRows]));

        // Build team alias map from v2_team_season_names
        const seasonIds = new Set<string>();
        for (const r of allRows) {
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
        {/* Statistics Section */}
        {(stats.avgQual !== null || stats.avgRace !== null) && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-semibold text-foreground">Statistics</h2>
              <Select value={selectedSeason} onValueChange={setSelectedSeason}>
                <SelectTrigger className="w-[140px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Seasons</SelectItem>
                  {seasonYears.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-1">Avg. Qualifying Position</p>
                  <p className="text-4xl font-accent font-bold text-foreground">
                    {stats.avgQual !== null ? Math.round(stats.avgQual) : "—"}
                  </p>
                  {stats.avgQual !== null && (
                    <p className="text-xs text-muted-foreground mt-1">{stats.avgQual.toFixed(2)} across {stats.qualCount} result{stats.qualCount !== 1 ? "s" : ""}</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-1">Avg. Race Finish</p>
                  <div className="flex items-center gap-3">
                    <p className="text-4xl font-accent font-bold text-foreground">
                      {stats.avgRace !== null ? Math.round(stats.avgRace) : "—"}
                    </p>
                    {stats.avgRace !== null && stats.avgQual !== null && (() => {
                      const diff = stats.avgQual - stats.avgRace;
                      const rounded = Math.round(diff * 10) / 10;
                      if (rounded === 0) return null;
                      const isGain = rounded > 0;
                      return (
                        <span className={`inline-flex items-center gap-0.5 text-sm font-medium ${isGain ? "text-green-500" : "text-destructive"}`}>
                          <span className={`text-xs ${isGain ? "" : "rotate-180 inline-block"}`}>▲</span>
                          {Math.abs(rounded)}
                        </span>
                      );
                    })()}
                  </div>
                  {stats.avgRace !== null && (
                    <p className="text-xs text-muted-foreground mt-1">{stats.avgRace.toFixed(2)} across {stats.raceCount} result{stats.raceCount !== 1 ? "s" : ""}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold text-foreground">
            {showAllSessions ? "All Session Results" : "Race Results"}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAllSessions(!showAllSessions)}
          >
            {showAllSessions ? "Show Only Races" : "Show All Sessions"}
          </Button>
        </div>
        {(() => {
          const displayResults = showAllSessions ? allSessionResults : raceHistory;
          if (displayResults.length === 0) return (
            <p className="text-muted-foreground text-sm">No {showAllSessions ? "session" : "race"} results found for this driver.</p>
          );
          return (
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
                      <TableHead>{showAllSessions ? "Time / Gap" : "Status"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayResults.map((r: any, i: number) => (
                      <TableRow key={r.id || `${r._source}-${i}`}>
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
                          {r.session?.date
                            ? new Date(r.session.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : r.event?.start_date
                              ? formatDateRange(r.event.start_date, r.event.end_date)
                              : "—"}
                        </TableCell>
                        <TableCell>
                          {r.v2_teams ? (
                            <Link to={`/team/${r.v2_teams.id}`} className="text-primary hover:underline text-sm">
                              {teamAliasMap[`${r.v2_teams.id}:${r.event?.v2_seasons?.id}`] || r.v2_teams.full_name}
                            </Link>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.v2_cars ? [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") : "—"}
                        </TableCell>
                        <TableCell className="text-center font-accent font-bold text-card-foreground text-base">
                          {r.position ?? "—"}
                        </TableCell>
                        <TableCell>
                          {r._source === "race" ? (
                            r.status && r.status !== "finished" ? (
                              <span className="text-destructive text-sm font-medium">{r.status.toUpperCase()}</span>
                            ) : null
                          ) : (
                            <span className="text-muted-foreground text-xs font-mono">
                              {r.best_time || r.best_lap_time || r.gap_to_pole || r.gap_to_p1 || "—"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })()}

        <div className="mt-8 rounded-lg border border-border bg-card p-5 text-center">
          <p className="text-sm font-medium text-card-foreground mb-1">Missing or incorrect information?</p>
          <p className="text-xs text-muted-foreground mb-3">Help us improve this driver profile.</p>
          <ReportDialog reportType="driver" targetId={id!} targetName={`${driver.full_name}`} />
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default DriverProfilePage;
