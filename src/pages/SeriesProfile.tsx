import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { formatDateRange } from "@/lib/date-utils";

interface DisplayEvent {
  id: string;
  name: string;
  location: string | null;
  date: string | null;
  endDate: string | null;
  year: number;
}

const SeriesProfile = () => {
  const { id } = useParams<{ id: string }>();
  const [series, setSeries] = useState<any>(null);
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data: s } = await supabase.from("v2_series").select("*").eq("id", id).single();
      setSeries(s);

      if (s) {
        // Get seasons for this series
        const { data: seasons } = await supabase.from("v2_seasons").select("id, year").eq("series_id", id);
        const seasonIds = (seasons || []).map(sn => sn.id);
        const seasonYearMap = Object.fromEntries((seasons || []).map(sn => [sn.id, sn.year]));

        if (seasonIds.length > 0) {
          const { data: evts } = await supabase.from("v2_events")
            .select("id, name, start_date, end_date, season_id, status, v2_circuits(name, country)")
            .in("season_id", seasonIds)
            .eq("status", "published" as any)
            .order("start_date", { ascending: false });

          setEvents((evts || []).map(e => ({
            id: e.id,
            name: e.name,
            location: e.v2_circuits?.name ? `${e.v2_circuits.name}${e.v2_circuits.country ? `, ${e.v2_circuits.country}` : ""}` : null,
            date: e.start_date,
            endDate: e.end_date,
            year: seasonYearMap[e.season_id] || 0,
          })));
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
                  {yearEvents.map(ev => (
                    <Link key={ev.id} to={`/events/${ev.id}`} className="group rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-all">
                      <h4 className="font-display text-sm font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">{ev.name}</h4>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        {ev.location && <span>{ev.location}</span>}
                        {ev.date && <span>{formatDateRange(ev.date, ev.endDate)}</span>}
                      </div>
                    </Link>
                  ))}
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
