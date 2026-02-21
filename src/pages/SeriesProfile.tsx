import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Trophy } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { formatDateRange } from "@/lib/date-utils";
import FlagImage from "@/components/FlagImage";

interface DisplayEvent {
  id: string;
  name: string;
  circuitName: string | null;
  country: string | null;
  date: string | null;
  endDate: string | null;
  year: number;
}

interface PodiumEntry {
  driverId: string;
  name: string;
  position: number;
}

const PODIUM_COLORS: Record<number, string> = {
  1: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  2: "bg-gray-300/15 text-gray-300 border-gray-400/40",
  3: "bg-amber-700/20 text-amber-600 border-amber-700/40",
};

const SeriesProfile = () => {
  const { id } = useParams<{ id: string }>();
  const [series, setSeries] = useState<any>(null);
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const [podiums, setPodiums] = useState<Record<string, PodiumEntry[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data: s } = await supabase.from("v2_series").select("*").eq("id", id).single();
      setSeries(s);

      if (s) {
        const { data: seasons } = await supabase.from("v2_seasons").select("id, year").eq("series_id", id);
        const seasonIds = (seasons || []).map(sn => sn.id);
        const seasonYearMap = Object.fromEntries((seasons || []).map(sn => [sn.id, sn.year]));

        if (seasonIds.length > 0) {
          const { data: evts } = await supabase.from("v2_events")
            .select("id, name, start_date, end_date, season_id, status, v2_circuits(name, country)")
            .in("season_id", seasonIds)
            .eq("status", "published" as any)
            .order("start_date", { ascending: false });

          const mappedEvents = (evts || []).map(e => ({
            id: e.id,
            name: e.name,
            circuitName: e.v2_circuits?.name || null,
            country: e.v2_circuits?.country || null,
            date: e.start_date,
            endDate: e.end_date,
            year: seasonYearMap[e.season_id] || 0,
          }));
          setEvents(mappedEvents);

          // Fetch top 3 race finishers for all events
          const eventIds = mappedEvents.map(e => e.id);
          if (eventIds.length > 0) {
            // Get race sessions for these events
            const { data: raceSessions } = await supabase
              .from("v2_sessions")
              .select("id, event_id")
              .in("event_id", eventIds)
              .eq("session_type", "race" as any)
              .eq("status", "published" as any);

            if (raceSessions && raceSessions.length > 0) {
              const sessionIds = raceSessions.map(rs => rs.id);
              const sessionEventMap: Record<string, string> = {};
              raceSessions.forEach(rs => { sessionEventMap[rs.id] = rs.event_id; });

              const { data: topResults } = await supabase
                .from("v2_race_results" as any)
                .select("session_id, position, driver_id, v2_drivers(full_name)")
                .in("session_id", sessionIds)
                .lte("position", 3)
                .order("position");

              const podiumMap: Record<string, PodiumEntry[]> = {};
              for (const r of (topResults || []) as any[]) {
                const eventId = sessionEventMap[r.session_id];
                if (!eventId) continue;
                if (!podiumMap[eventId]) podiumMap[eventId] = [];
                // Only keep the first race's podium per event (main race, lowest sort_order)
                if (podiumMap[eventId].length < 3 && !podiumMap[eventId].some(p => p.position === r.position)) {
                  podiumMap[eventId].push({
                    driverId: r.driver_id,
                    name: r.v2_drivers?.full_name || "Unknown",
                    position: r.position,
                  });
                }
              }
              setPodiums(podiumMap);
            }
          }
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [id]);

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="flex items-center justify-center pt-32"><p className="text-muted-foreground">Loading…</p></div></div>;
  if (!series) return <div className="min-h-screen bg-background"><Header /><div className="flex flex-col items-center justify-center pt-32 gap-4"><p className="text-muted-foreground">Series not found.</p></div></div>;

  // Group by year
  const seasons = events.reduce<Record<number, DisplayEvent[]>>((acc, ev) => {
    if (!acc[ev.year]) acc[ev.year] = [];
    acc[ev.year].push(ev);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="pt-24 pb-10 bg-card border-b border-border">
        <div className="container">
          <Link to="/series" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Series
          </Link>
          <h1 className="font-display text-3xl font-bold text-foreground">{series.name}</h1>
          {series.short_name && <p className="mt-1 text-sm text-muted-foreground">{series.short_name}</p>}
        </div>
      </section>

      <div className="container py-8">
        <h2 className="font-display text-xl font-semibold text-foreground mb-4">Events</h2>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">No events linked to this series yet.</p>
        ) : (
          <div className="space-y-8">
            {Object.entries(seasons).sort(([a], [b]) => Number(b) - Number(a)).map(([year, yearEvents]) => (
              <div key={year}>
                <h3 className="font-display text-lg font-semibold text-foreground mb-3">{year} Season</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {yearEvents.map(ev => {
                    const evPodium = (podiums[ev.id] || []).sort((a, b) => a.position - b.position);
                    return (
                      <Link key={ev.id} to={`/events/${ev.id}`} className="group rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-all">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 shrink-0">
                            <FlagImage nationality={ev.country} size={24} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-display text-sm font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">{ev.name}</h4>
                            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                              {ev.circuitName && <span className="truncate">{ev.circuitName}{ev.country ? `, ${ev.country}` : ""}</span>}
                              {ev.date && <span className="shrink-0">{formatDateRange(ev.date, ev.endDate)}</span>}
                            </div>
                          </div>
                        </div>

                        {evPodium.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-1.5">
                            {evPodium.map(p => (
                              <span
                                key={p.position}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PODIUM_COLORS[p.position] || ""}`}
                              >
                                <Trophy className="h-2.5 w-2.5" />
                                <span className="opacity-60">P{p.position}</span>
                                <span className="truncate max-w-[80px]">{p.name}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default SeriesProfile;
