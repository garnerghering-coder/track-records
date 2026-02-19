import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Globe } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import type { Tables } from "@/integrations/supabase/types";

type Series = Tables<"series">;

const categoryLabels: Record<string, string> = {
  karting: "Karting", single_seater: "Single Seater", gt: "GT",
  touring_car: "Touring Car", sports_car: "Sports Car", rally: "Rally",
  endurance: "Endurance", formula: "Formula", stock_car: "Stock Car", other: "Other",
};

const SeriesProfile = () => {
  const { id } = useParams<{ id: string }>();
  const [series, setSeries] = useState<Series | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      const { data: s } = await supabase.from("series").select("*").eq("id", id).single();
      setSeries(s);

      let evQuery = supabase.from("race_events")
        .select("id, event_name, series_name, season_year, category, location, event_date")
        .order("season_year", { ascending: false })
        .order("event_date", { ascending: false });

      if (s) {
        // Try series_id first, fallback to name match
        evQuery = evQuery.eq("series_id", id);
      }
      const { data: evData } = await evQuery.limit(200);

      if ((!evData || evData.length === 0) && s?.name) {
        const { data: nameEvents } = await supabase.from("race_events")
          .select("id, event_name, series_name, season_year, category, location, event_date")
          .ilike("series_name", `%${s.name}%`)
          .order("season_year", { ascending: false })
          .limit(200);
        setEvents(nameEvents ?? []);
      } else {
        setEvents(evData ?? []);
      }
      setLoading(false);
    };
    fetch();
  }, [id]);

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="flex items-center justify-center pt-32"><p className="text-muted-foreground">Loading…</p></div></div>;
  if (!series) return <div className="min-h-screen bg-background"><Header /><div className="flex flex-col items-center justify-center pt-32 gap-4"><p className="text-muted-foreground">Series not found.</p></div></div>;

  // Group events by season
  const seasons = events.reduce<Record<number, typeof events>>((acc, ev) => {
    const yr = ev.season_year;
    if (!acc[yr]) acc[yr] = [];
    acc[yr].push(ev);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="pt-24 pb-10 bg-card border-b border-border">
        <div className="container">
          <Link to="/results" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="font-display text-3xl font-bold text-foreground">{series.name}</h1>
          <div className="mt-2 flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
            {series.category && <Badge variant="secondary">{categoryLabels[series.category] || series.category}</Badge>}
            {series.website && (
              <a href={series.website} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                <Globe className="h-3.5 w-3.5" /> Website
              </a>
            )}
          </div>
        </div>
      </section>

      <div className="container py-8">
        {series.description && (
          <div className="mb-8 rounded-lg border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground leading-relaxed">{series.description}</p>
          </div>
        )}

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
                    <Link key={ev.id} to={`/event/${ev.id}`} className="group rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-all">
                      <h4 className="font-display text-sm font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">{ev.event_name}</h4>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        {ev.location && <span>{ev.location}</span>}
                        {ev.event_date && <span>{new Date(ev.event_date).toLocaleDateString()}</span>}
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
