import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Globe } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { formatDateRange } from "@/lib/date-utils";

const CircuitProfile = () => {
  const { id } = useParams<{ id: string }>();
  const [circuit, setCircuit] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data: c } = await supabase.from("v2_circuits").select("*").eq("id", id).single();
      setCircuit(c);

      if (c) {
        // Find events at this circuit
        const { data: evData } = await supabase
          .from("v2_events")
          .select("id, name, start_date, end_date, status, v2_seasons(year, v2_series(name)), v2_circuits(name, country)")
          .eq("circuit_id", id)
          .eq("status", "published" as any)
          .order("start_date", { ascending: false })
          .limit(100);
        setEvents(evData ?? []);
      }
      setLoading(false);
    };
    fetchData();
  }, [id]);

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="flex items-center justify-center pt-32"><p className="text-muted-foreground">Loading…</p></div></div>;
  if (!circuit) return <div className="min-h-screen bg-background"><Header /><div className="flex flex-col items-center justify-center pt-32 gap-4"><p className="text-muted-foreground">Circuit not found.</p></div></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="pt-24 pb-10 bg-card border-b border-border">
        <div className="container">
          <Link to="/search" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="font-display text-3xl font-bold text-foreground">{circuit.name}</h1>
          <div className="mt-2 flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
            {circuit.country && <span>{circuit.country}</span>}
            {circuit.location && <span>{circuit.location}</span>}
            {circuit.length_km && <span>{Number(circuit.length_km).toFixed(2)} km</span>}
          </div>
        </div>
      </section>

      <div className="container py-8">
        {circuit.layout_image_url && (
          <div className="mb-8 rounded-lg border border-border bg-card p-5">
            <h3 className="font-display text-sm font-semibold text-card-foreground mb-2">Circuit Layout</h3>
            <img src={circuit.layout_image_url} alt={`${circuit.name} layout`} className="w-full max-h-64 rounded object-contain" />
          </div>
        )}

        <h2 className="font-display text-xl font-semibold text-foreground mb-4">Events at This Circuit</h2>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">No events linked to this circuit yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((ev: any) => (
              <Link key={ev.id} to={`/events/${ev.id}`} className="group rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-all">
                <h3 className="font-display text-sm font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">{ev.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {ev.v2_seasons?.v2_series?.name} · {ev.start_date ? formatDateRange(ev.start_date, ev.end_date) : ev.v2_seasons?.year}
                </p>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-8 rounded-lg border border-border bg-card p-5 text-center">
          <p className="text-sm font-medium text-card-foreground mb-1">Missing or incorrect information?</p>
          <p className="text-xs text-muted-foreground mb-3">Help us improve this circuit profile.</p>
          <Link to="/contribute"><Button size="sm" variant="outline">Contribute</Button></Link>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default CircuitProfile;
