import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trophy, CheckCircle, MapPin, Calendar, Pencil } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ReportDialog from "@/components/ReportDialog";
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
  photo_url: string | null;
}

interface EntryWithDrivers {
  id: string;
  team_name: string | null;
  team_profile_id: string | null;
  organization_id: string | null;
  car_number: string | null;
  race_class: string | null;
  finishing_position: number | null;
  class_position: number | null;
  laps_completed: number | null;
  gap_to_leader: string | null;
  gap_to_class_leader: string | null;
  pit_stops: number | null;
  status: string | null;
  notes: string | null;
  verification_status: string;
  drivers: DriverInfo[];
}

interface RaceEvent {
  id: string;
  event_name: string;
  series_name: string;
  season_year: number;
  category: string | null;
  location: string | null;
  event_date: string | null;
  notes: string | null;
}

const EventDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<RaceEvent | null>(null);
  const [entries, setEntries] = useState<EntryWithDrivers[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      // Check admin status
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "admin");
        setIsAdmin(!!roles && roles.length > 0);
      }

      const { data: ev } = await supabase
        .from("race_events")
        .select("*")
        .eq("id", id)
        .single();

      if (!ev) { setLoading(false); return; }
      setEvent(ev as any);

      const { data: rawEntries } = await supabase
        .from("race_entries")
        .select("*")
        .eq("race_event_id", id)
        .order("finishing_position", { ascending: true, nullsFirst: false });

      const entryIds = (rawEntries || []).map((e: any) => e.id);

      let driverMap: Record<string, DriverInfo[]> = {};
      if (entryIds.length > 0) {
        const { data: junctions } = await supabase
          .from("race_entry_drivers")
          .select("race_entry_id, driver_profile_id, driver_profiles(id, first_name, last_name, nationality, photo_url)")
          .in("race_entry_id", entryIds);

        (junctions || []).forEach((j: any) => {
          if (!driverMap[j.race_entry_id]) driverMap[j.race_entry_id] = [];
          if (j.driver_profiles) driverMap[j.race_entry_id].push(j.driver_profiles);
        });
      }

      setEntries((rawEntries || []).map((e: any) => ({
        ...e,
        drivers: driverMap[e.id] || [],
      })));
      setLoading(false);
    };
    fetchData();
  }, [id]);

  // Group by class
  const classes = entries.reduce<Record<string, EntryWithDrivers[]>>((acc, e) => {
    const cls = e.race_class || "Overall";
    if (!acc[cls]) acc[cls] = [];
    acc[cls].push(e);
    return acc;
  }, {});

  Object.values(classes).forEach(arr => {
    arr.sort((a, b) => (a.class_position ?? a.finishing_position ?? 999) - (b.class_position ?? b.finishing_position ?? 999));
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center pt-32">
          <p className="text-muted-foreground">Loading event…</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex flex-col items-center justify-center pt-32 gap-4">
          <p className="text-muted-foreground">Event not found.</p>
          <Link to="/results"><button className="text-primary hover:underline text-sm">Back to Results</button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section
        className="pt-24 pb-10"
        style={{ background: "linear-gradient(135deg, hsl(220 20% 8%) 0%, hsl(220 25% 14%) 100%)" }}
      >
        <div className="container">
          <Link to="/results" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            <ArrowLeft className="h-4 w-4" /> Back to Results
          </Link>
          <div className="flex items-start gap-4 flex-1">
            <Trophy className="h-8 w-8 text-primary shrink-0 mt-1" />
            <div className="flex-1">
              <h1 className="font-display text-3xl font-bold sm:text-4xl" style={{ color: "hsl(0 0% 100%)" }}>
                {event.event_name}
              </h1>
              <div className="mt-2 flex items-center gap-4 flex-wrap text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                <span>{event.series_name}</span>
                <span>• {event.season_year}</span>
                {event.category && (
                  <Badge variant="secondary" className="text-xs">{categoryLabels[event.category] || event.category}</Badge>
                )}
              </div>
              <div className="mt-2 flex items-center gap-4 flex-wrap text-sm" style={{ color: "hsl(0 0% 100% / 0.5)" }}>
                {event.location && (
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {event.location}</span>
                )}
                {event.event_date && (
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {new Date(event.event_date).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 sm:mt-0 flex items-center gap-2">
            {isAdmin && (
              <Link to={`/admin?edit=${event.id}`}>
                <Button size="sm" variant="secondary" className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Edit in Admin
                </Button>
              </Link>
            )}
            <ReportDialog reportType="event" targetId={event.id} targetName={event.event_name} />
          </div>
        </div>
      </section>

      <div className="container py-8 space-y-8">
        {Object.keys(classes).length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No entries recorded for this event yet.</p>
          </div>
        ) : (
          Object.entries(classes).map(([cls, classEntries]) => (
            <div key={cls} className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-muted/30">
                <h2 className="font-display text-base font-semibold text-card-foreground">{cls}</h2>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">Pos</TableHead>
                      <TableHead className="w-[60px]">Class</TableHead>
                      <TableHead className="w-[60px]">#</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>Driver(s)</TableHead>
                      <TableHead className="text-center">Laps</TableHead>
                      <TableHead>Gap</TableHead>
                      <TableHead>Class Gap</TableHead>
                      <TableHead className="text-center">Pits</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classEntries.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-display font-bold text-card-foreground">
                          {entry.finishing_position ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {entry.class_position ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-card-foreground font-medium">
                          {entry.car_number ?? "—"}
                        </TableCell>
                        <TableCell>
                          {entry.team_name ? (
                            entry.team_profile_id ? (
                              <Link to={`/team/${entry.team_profile_id}`} className="text-primary hover:underline font-medium">
                                {entry.team_name}
                              </Link>
                            ) : (
                              <span className="text-card-foreground font-medium">{entry.team_name}</span>
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            {entry.drivers.length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              entry.drivers.map(d => (
                                <Link
                                  key={d.id}
                                  to={`/driver/${d.id}`}
                                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                >
                                  <FlagImage nationality={d.nationality} size={14} />
                                  {d.first_name} {d.last_name}
                                </Link>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {entry.laps_completed ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {entry.gap_to_leader || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {entry.gap_to_class_leader || "—"}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {entry.pit_stops ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm ${entry.status === "DNF" || entry.status === "DNS" || entry.status === "DSQ" ? "text-destructive" : "text-muted-foreground"}`}>
                              {entry.status || "—"}
                            </span>
                            {entry.verification_status === "verified" && (
                              <CheckCircle className="h-3.5 w-3.5 text-primary" />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        )}

        {event.notes && (
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="font-display text-sm font-semibold text-card-foreground mb-2">Notes</h3>
            <p className="text-sm text-muted-foreground">{event.notes}</p>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default EventDetailPage;
