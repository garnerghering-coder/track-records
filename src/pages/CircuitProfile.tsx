import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trophy, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { formatDateRange } from "@/lib/date-utils";
import { computeTrackMetrics, categoryBubbleClasses } from "@/lib/track-calculations";
import ReportDialog from "@/components/ReportDialog";
import FlagImage from "@/components/FlagImage";

interface PodiumEntry {
  driverId: string;
  name: string;
  position: number;
}

function shortenName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

const PODIUM_COLORS: Record<number, string> = {
  1: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  2: "bg-gray-300/15 text-gray-300 border-gray-400/40",
  3: "bg-amber-700/20 text-amber-600 border-amber-700/40",
};

const CircuitProfile = () => {
  const { id } = useParams<{ id: string }>();
  const [circuit, setCircuit] = useState<any>(null);
  const [layouts, setLayouts] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [podiums, setPodiums] = useState<Record<string, PodiumEntry[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const [{ data: c }, { data: layoutData }] = await Promise.all([
        supabase.from("v2_circuits").select("*").eq("id", id).single(),
        supabase.from("v2_circuit_layouts").select("*").eq("circuit_id", id).order("sort_order"),
      ]);
      setCircuit(c);
      setLayouts(layoutData ?? []);

      if (c) {
        const { data: evData } = await supabase
          .from("v2_events")
          .select("id, name, start_date, end_date, status, v2_seasons(year, v2_series(name)), v2_circuits(name, country)")
          .eq("circuit_id", id)
          .eq("status", "published" as any)
          .order("start_date", { ascending: false })
          .limit(100);
        setEvents(evData ?? []);

        // Fetch podium data
        const eventIds = (evData || []).map(e => e.id);
        if (eventIds.length > 0) {
          const { data: raceSessions } = await supabase
            .from("v2_sessions")
            .select("id, event_id, session_type, parent_session_id")
            .in("event_id", eventIds)
            .in("session_type", ["race", "endurance_race", "sprint_race"] as any)
            .eq("status", "published" as any)
            .is("parent_session_id", null);

          if (raceSessions && raceSessions.length > 0) {
            const sIds = raceSessions.map(rs => rs.id);
            const sessionEventMap: Record<string, string> = {};
            raceSessions.forEach(rs => { sessionEventMap[rs.id] = rs.event_id; });

            const { data: topResults } = await supabase
              .from("v2_race_results" as any)
              .select("session_id, position, driver_id, v2_drivers(full_name)")
              .in("session_id", sIds)
              .lte("position", 3)
              .order("position");

            const podiumMap: Record<string, PodiumEntry[]> = {};
            for (const r of (topResults || []) as any[]) {
              const eventId = sessionEventMap[r.session_id];
              if (!eventId) continue;
              if (!podiumMap[eventId]) podiumMap[eventId] = [];
              if (podiumMap[eventId].length < 3 && !podiumMap[eventId].some(p => p.position === r.position)) {
                podiumMap[eventId].push({ driverId: r.driver_id, name: r.v2_drivers?.full_name || "Unknown", position: r.position });
              }
            }
            setPodiums(podiumMap);
          }
        }
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

        {/* Track Layouts with Metrics */}
        {layouts.length > 0 && (
          <div className="mb-8">
            <h2 className="font-display text-xl font-semibold text-foreground mb-4">Track Configurations</h2>
            <div className="space-y-2">
              {layouts.map((l: any) => {
                const m = computeTrackMetrics(
                  l.length_km ? Number(l.length_km) : null,
                  l.turns,
                  l.total_straight_length_km ? Number(l.total_straight_length_km) : null,
                  l.total_elevation_change_m ? Number(l.total_elevation_change_m) : null,
                  l.heavy_braking_corners
                );
                const metrics = [
                  m.tcsCategory && { title: "Track Character", label: m.tcsCategory, classes: categoryBubbleClasses(m.tcsCategory) },
                  m.eiCategory && { title: "Elevation", label: m.eiCategory, classes: categoryBubbleClasses(m.eiCategory) },
                  m.csiCategory && { title: "Corner Severity", label: m.csiCategory, classes: categoryBubbleClasses(m.csiCategory) },
                  m.tdiCategory && { title: "Track Demand", label: m.tdiCategory, classes: categoryBubbleClasses(m.tdiCategory) },
                ].filter(Boolean) as { title: string; label: string; classes: string }[];

                return (
                  <div key={l.id} className="rounded-lg border border-border bg-card p-4">
                    <div>
                      <span className="font-display text-sm font-semibold text-card-foreground">{l.name}</span>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {l.length_km && <span>{l.length_km} km</span>}
                        {l.turns != null && <span>{l.turns} turns</span>}
                      </div>
                    </div>
                    {metrics.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {metrics.map((t) => (
                          <span key={t.title} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${t.classes}`}>
                            <span className="opacity-60 font-medium">{t.title}:</span> {t.label}
                          </span>
                        ))}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[240px] text-xs">
                              These characteristics are calculated using mathematical formulas derived from track layout data — no AI is used.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <h2 className="font-display text-xl font-semibold text-foreground mb-4">Events at This Circuit</h2>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">No events linked to this circuit yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((ev: any) => {
              const evPodium = (podiums[ev.id] || []).sort((a, b) => a.position - b.position);
              return (
                <Link key={ev.id} to={`/events/${ev.id}`} className="group rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      <FlagImage nationality={ev.v2_circuits?.country} size={24} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-sm font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">{ev.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {ev.v2_seasons?.v2_series?.name} · {ev.start_date ? formatDateRange(ev.start_date, ev.end_date) : ev.v2_seasons?.year}
                      </p>
                    </div>
                  </div>
                  {evPodium.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-1.5">
                      {evPodium.map(p => (
                        <span key={p.position} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PODIUM_COLORS[p.position] || ""}`}>
                          <Trophy className="h-2.5 w-2.5" />
                          <span className="opacity-60">P{p.position}</span>
                          <span className="truncate max-w-[80px]">{shortenName(p.name)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-8 rounded-lg border border-border bg-card p-5 text-center">
          <p className="text-sm font-medium text-card-foreground mb-1">Missing or incorrect information?</p>
          <p className="text-xs text-muted-foreground mb-3">Help us improve this circuit profile.</p>
          <ReportDialog reportType="circuit" targetId={id!} targetName={circuit.name} />
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default CircuitProfile;
