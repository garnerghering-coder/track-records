import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Globe } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import type { Tables } from "@/integrations/supabase/types";

const CircuitMapImage = ({ url, name }: { url: string; name: string }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="font-display text-sm font-semibold text-card-foreground mb-2">Circuit Map</h3>
      <img
        src={url}
        alt={`${name} layout`}
        className="w-full rounded"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </div>
  );
};

type Circuit = Tables<"circuits">;

const categoryLabels: Record<string, string> = {
  karting: "Karting", single_seater: "Single Seater", gt: "GT",
  touring_car: "Touring Car", sports_car: "Sports Car", rally: "Rally",
  endurance: "Endurance", formula: "Formula", stock_car: "Stock Car", other: "Other",
};

const CircuitProfile = () => {
  const { id } = useParams<{ id: string }>();
  const [circuit, setCircuit] = useState<Circuit | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      const { data: c } = await supabase.from("circuits").select("*").eq("id", id).single();
      setCircuit(c);

      let evQuery = supabase.from("race_events")
        .select("id, event_name, series_name, season_year, category, location, event_date")
        .order("event_date", { ascending: false });
      
      if (c) {
        evQuery = evQuery.eq("circuit_id", id);
      }
      const { data: evData } = await evQuery.limit(100);

      if ((!evData || evData.length === 0) && c?.name) {
        const { data: locEvents } = await supabase.from("race_events")
          .select("id, event_name, series_name, season_year, category, location, event_date")
          .ilike("location", `%${c.name}%`)
          .order("event_date", { ascending: false })
          .limit(100);
        setEvents(locEvents ?? []);
      } else {
        setEvents(evData ?? []);
      }
      setLoading(false);
    };
    fetch();
  }, [id]);

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="flex items-center justify-center pt-32"><p className="text-muted-foreground">Loading…</p></div></div>;
  if (!circuit) return <div className="min-h-screen bg-background"><Header /><div className="flex flex-col items-center justify-center pt-32 gap-4"><p className="text-muted-foreground">Circuit not found.</p></div></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="pt-24 pb-10 bg-card border-b border-border">
        <div className="container">
          <Link to="/results" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="font-display text-3xl font-bold text-foreground">{circuit.name}</h1>
          <div className="mt-2 flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
            {circuit.country && <span>{circuit.country}</span>}
            {circuit.location && <span>{circuit.location}</span>}
            {circuit.length_km && <span>{circuit.length_km} km</span>}
            {circuit.turns && <span>{circuit.turns} turns</span>}
          </div>
          {circuit.website && (
            <a href={circuit.website} target="_blank" rel="noopener" className="inline-flex items-center gap-1 mt-2 text-sm text-primary hover:underline">
              <Globe className="h-3.5 w-3.5" /> Website
            </a>
          )}
        </div>
      </section>

      <div className="container py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-6">
            {circuit.description && (
              <div className="rounded-lg border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground leading-relaxed">{circuit.description}</p>
              </div>
            )}

            {circuit.image_url && (
              <CircuitMapImage url={circuit.image_url} name={circuit.name} />
            )}

            {/* Contribute CTA */}
            <div className="rounded-lg border border-border bg-card p-5 text-center">
              <p className="text-sm font-medium text-card-foreground mb-1">Missing or incorrect information?</p>
              <p className="text-xs text-muted-foreground mb-3">Help us improve this circuit profile.</p>
              <Link to="/contribute"><Button size="sm" variant="outline">Contribute</Button></Link>
            </div>
          </div>

          <div className="lg:col-span-2">
            <h2 className="font-display text-xl font-semibold text-foreground mb-4">Events at This Circuit</h2>
            {events.length === 0 ? (
              <p className="text-muted-foreground text-sm">No events linked to this circuit yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {events.map(ev => (
                  <Link key={ev.id} to={`/event/${ev.id}`} className="group rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-all">
                    <h3 className="font-display text-sm font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">{ev.event_name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{ev.series_name} · {ev.season_year}</p>
                    {ev.event_date && <p className="text-xs text-muted-foreground mt-0.5">{new Date(ev.event_date).toLocaleDateString()}</p>}
                    {ev.category && <Badge variant="secondary" className="mt-2 text-xs">{categoryLabels[ev.category] || ev.category}</Badge>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default CircuitProfile;
