/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import TrackFingerprint from "@/components/TrackFingerprint";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { formatDateRange } from "@/lib/date-utils";
import { computeTrackMetrics } from "@/lib/track-calculations";
import ReportDialog from "@/components/ReportDialog";
import FlagImage from "@/components/FlagImage";
import { EmptyState, PageHeader, Panel, Pos, SectionHeader, Stat, StatStrip } from "@/components/tr/primitives";
import { ProfileLoading, ProfileNotFound, ReportStrip, ShareButton, yearSpan } from "@/components/profile-kit";
import { shortName } from "@/lib/race-data";

interface PodiumEntry {
  driverId: string;
  name: string;
  position: number;
}

const num = (v: any) => (v == null || v === "" ? null : Number(v));

function Spec({ label, value, unit, className }: { label: string; value: number | null; unit?: string; className?: string }) {
  return (
    <div className={`min-w-0 bg-card px-4 py-2.5 ${className ?? ""}`}>
      <div className="label-caps truncate">{label}</div>
      <div className="num mt-0.5 text-sm text-foreground">
        {value != null && Number.isFinite(value) ? (
          <>
            {value}
            {unit && <span className="ml-0.5 text-xs text-muted-foreground">{unit}</span>}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

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
            const sessionEventMap: Record<string, string> = {};
            raceSessions.forEach(rs => { sessionEventMap[rs.id] = rs.event_id; });

            // For endurance races, use the last hour sub-session instead of the parent
            const enduranceParentIds = raceSessions.filter(rs => rs.session_type === "endurance_race").map(rs => rs.id);
            const lastHourSessionMap: Record<string, string> = {};

            if (enduranceParentIds.length > 0) {
              const { data: childSessions } = await supabase
                .from("v2_sessions")
                .select("id, event_id, parent_session_id, sort_order")
                .in("parent_session_id", enduranceParentIds)
                .eq("status", "published" as any)
                .order("sort_order", { ascending: false });

              if (childSessions && childSessions.length > 0) {
                for (const cs of childSessions as any[]) {
                  if (!lastHourSessionMap[cs.event_id]) {
                    lastHourSessionMap[cs.event_id] = cs.id;
                  }
                }
              }
            }

            const sIds: string[] = [];
            const finalSessionEventMap: Record<string, string> = {};
            for (const rs of raceSessions) {
              if (rs.session_type === "endurance_race" && lastHourSessionMap[rs.event_id]) {
                const lastHourId = lastHourSessionMap[rs.event_id];
                sIds.push(lastHourId);
                finalSessionEventMap[lastHourId] = rs.event_id;
              } else {
                sIds.push(rs.id);
                finalSessionEventMap[rs.id] = rs.event_id;
              }
            }

            const { data: topResults } = await supabase
              .from("v2_race_results" as any)
              .select("session_id, position, driver_id, v2_drivers(full_name)")
              .in("session_id", sIds)
              .lte("position", 3)
              .order("position");

            const podiumMap: Record<string, PodiumEntry[]> = {};
            for (const r of (topResults || []) as any[]) {
              const eventId = finalSessionEventMap[r.session_id];
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

  const derived = useMemo(() => {
    const years = [...new Set(events.map((e: any) => e.v2_seasons?.year ?? (e.start_date ? Number(e.start_date.slice(0, 4)) : null)).filter(Boolean))] as number[];
    const series = [...new Set(events.map((e: any) => e.v2_seasons?.v2_series?.name).filter(Boolean))] as string[];
    return { years, series };
  }, [events]);

  if (loading) return <ProfileLoading />;
  if (!circuit) return <ProfileNotFound what="Circuit" backTo="/search?tab=circuits" backLabel="Back to circuits" />;

  const main = layouts[0];
  const lengthKm = num(circuit.length_km) ?? num(main?.length_km);
  const turns = num(main?.turns);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={circuit.name}
        description={`Circuit profile for ${circuit.name}${circuit.country ? ` in ${circuit.country}` : ""}. View events and circuit data.`}
        canonical={`/circuit/${id}`}
        ogImage={circuit.layout_image_url || undefined}
      />
      <Header />

      <PageHeader
        kicker={
          <>
            <Link to="/search?tab=circuits" className="text-primary hover:underline">
              Circuit
            </Link>
            {circuit.country && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1.5">
                  <FlagImage nationality={circuit.country} size={14} /> {circuit.country}
                </span>
              </>
            )}
          </>
        }
        title={circuit.name}
        meta={
          <>
            {circuit.location && <span className="text-foreground">{circuit.location}</span>}
            {derived.series.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </>
        }
        actions={
          <>
            <ShareButton title={`${circuit.name} · Track Records`} />
            <ReportDialog reportType="circuit" targetId={circuit.id} targetName={circuit.name} />
          </>
        }
      >
        <StatStrip className="mt-7 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Length" value={lengthKm != null ? lengthKm.toFixed(3) : "—"} sub={lengthKm != null ? "km" : "Not recorded"} />
          <Stat label="Turns" value={turns ?? "—"} sub={main ? main.name : "Not recorded"} />
          <Stat label="Layouts" value={layouts.length || "—"} sub={layouts.length > 1 ? "configurations" : layouts.length ? "configuration" : "Not recorded"} />
          <Stat label="Events" value={events.length} sub="published" accent={events.length > 0} />
          <Stat label="Series" value={derived.series.length} sub={derived.series[0]} />
          <Stat label="Seasons" value={derived.years.length || "—"} sub={derived.years.length ? yearSpan(derived.years) : undefined} />
        </StatStrip>
      </PageHeader>

      <main className="container py-10 md:py-12">
        {circuit.layout_image_url && (
          <section className="mb-12">
            <SectionHeader kicker="Map" title="Circuit layout" />
            <Panel className="flex items-center justify-center p-6">
              <img src={circuit.layout_image_url} alt={`${circuit.name} layout`} className="logo-adapt max-h-64 w-full object-contain" />
            </Panel>
          </section>
        )}

        {/* ── Layouts + fingerprint ─────────────────────────────── */}
        {layouts.length > 0 && (
          <section className="mb-12">
            <SectionHeader
              kicker={`${layouts.length} configuration${layouts.length !== 1 ? "s" : ""}`}
              title="Circuit fingerprint"
              right={
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="label-caps flex shrink-0 items-center gap-1 transition-colors hover:text-foreground">
                        <HelpCircle className="h-3.5 w-3.5" /> How it works
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-[240px] text-xs">
                      These characteristics are calculated using mathematical formulas derived from circuit configuration data — no AI is used.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              }
            />
            <div className="space-y-4">
              {layouts.map((l: any) => {
                const m = computeTrackMetrics(
                  l.length_km ? Number(l.length_km) : null,
                  l.turns,
                  l.total_straight_length_km ? Number(l.total_straight_length_km) : null,
                  l.total_elevation_change_m ? Number(l.total_elevation_change_m) : null,
                  l.heavy_braking_corners,
                );
                return (
                  <Panel key={l.id} className="overflow-hidden">
                    <div className="flex h-10 items-center gap-2 border-b px-4">
                      <span className="label-caps">Layout</span>
                      <span className="truncate font-display text-base font-bold uppercase tracking-wide">{l.name}</span>
                    </div>
                    <div className={l.layout_image_url ? "grid md:grid-cols-[minmax(0,260px)_1fr]" : ""}>
                      {l.layout_image_url && (
                        <div className="flex items-center justify-center border-b p-5 md:border-b-0 md:border-r">
                          <img src={l.layout_image_url} alt={`${l.name} layout`} className="logo-adapt max-h-36 w-full object-contain" loading="lazy" />
                        </div>
                      )}
                      <div className="flex min-w-0 items-center overflow-x-auto p-4">
                        <TrackFingerprint metrics={m} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-px border-t bg-border sm:grid-cols-5">
                      <Spec label="Length" value={num(l.length_km)} unit="km" />
                      <Spec label="Turns" value={num(l.turns)} />
                      <Spec label="Heavy braking" value={num(l.heavy_braking_corners)} unit="corners" />
                      <Spec label="Elevation Δ" value={num(l.total_elevation_change_m)} unit="m" />
                      <Spec label="Straights" value={num(l.total_straight_length_km)} unit="km" className="col-span-2 sm:col-span-1" />
                    </div>
                  </Panel>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Events held ──────────────────────────────────────── */}
        <section>
          <SectionHeader kicker={`${events.length} event${events.length !== 1 ? "s" : ""}`} title="Events held here" />
          {events.length === 0 ? (
            <EmptyState title="No events yet">No published events are linked to this circuit yet.</EmptyState>
          ) : (
            <div className="overflow-hidden rounded border bg-card">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="hidden w-[9.5rem] sm:table-cell">Date</th>
                      <th>Event</th>
                      <th className="hidden lg:table-cell">Series</th>
                      <th className="hidden md:table-cell">Overall podium</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev: any) => {
                      const evPodium = [...(podiums[ev.id] || [])].sort((a, b) => a.position - b.position);
                      const date = ev.start_date ? formatDateRange(ev.start_date, ev.end_date) : String(ev.v2_seasons?.year ?? "—");
                      return (
                        <tr key={ev.id}>
                          <td className="num hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell">{date}</td>
                          <td className="py-2.5">
                            <Link to={`/events/${ev.id}`} className="font-medium leading-snug hover:text-primary">
                              {ev.name}
                            </Link>
                            <div className="text-xs text-muted-foreground lg:hidden">
                              <span className="num sm:hidden">{date} · </span>
                              {ev.v2_seasons?.v2_series?.name}
                            </div>
                            {evPodium.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 md:hidden">
                                {evPodium.map((p) => (
                                  <span key={p.position} className="inline-flex items-center gap-1.5 text-xs">
                                    <Pos value={p.position} className="h-5 min-w-[1.25rem] text-xs" />
                                    {shortName(p.name)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="hidden text-muted-foreground lg:table-cell">{ev.v2_seasons?.v2_series?.name}</td>
                          <td className="hidden py-2 md:table-cell">
                            {evPodium.length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                {evPodium.map((p) => (
                                  <Link key={p.position} to={`/driver/${p.driverId}`} className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-primary">
                                    <Pos value={p.position} className="h-5 min-w-[1.25rem] text-xs" />
                                    {shortName(p.name)}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <ReportStrip reportType="circuit" targetId={id!} targetName={circuit.name} noun="circuit" />
      </main>
      <Footer />
    </div>
  );
};

export default CircuitProfile;
