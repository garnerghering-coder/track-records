import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Trophy } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
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
  seasonId: string;
}

interface StandingEntry {
  carNumber: string;
  driverNames: string[];
  driverIds: string[];
  teamName: string | null;
  teamId: string | null;
  totalPoints: number;
  position: number;
  className: string | null;
}

const PODIUM_HEIGHT: Record<number, string> = {
  1: "h-28",
  2: "h-20",
  3: "h-16",
};

const PODIUM_BG: Record<number, string> = {
  1: "from-yellow-500/30 to-yellow-600/10 border-yellow-500/50",
  2: "from-gray-300/20 to-gray-400/10 border-gray-400/40",
  3: "from-amber-700/25 to-amber-800/10 border-amber-700/40",
};

const PODIUM_TEXT: Record<number, string> = {
  1: "text-yellow-400",
  2: "text-gray-300",
  3: "text-amber-600",
};

function shortenName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

function PodiumDisplay({ standings, className: classLabel }: { standings: StandingEntry[]; className?: string | null }) {
  const top3 = standings.slice(0, 3);
  if (top3.length === 0 || top3[0].totalPoints === 0) return null;

  // Reorder for visual: [2nd, 1st, 3rd]
  const ordered = [top3[1], top3[0], top3[2]].filter(Boolean);

  return (
    <div className="mb-4">
      {classLabel && (
        <p className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider mb-2">{classLabel}</p>
      )}
      <div className="flex items-end justify-center gap-2">
        {ordered.map((entry) => {
          const pos = entry.position;
          return (
            <div key={entry.carNumber} className="flex flex-col items-center" style={{ minWidth: 100, maxWidth: 140 }}>
              {/* Driver info above pillar */}
              <div className="text-center mb-1.5">
                {entry.driverNames.length > 1 ? (
                  <div className="flex flex-col gap-0.5">
                    {entry.driverNames.slice(0, 3).map((name, i) => (
                      <span key={i} className={`text-[10px] font-medium leading-tight ${PODIUM_TEXT[pos] || "text-foreground"}`}>
                        {shortenName(name)}
                      </span>
                    ))}
                    {entry.driverNames.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">+{entry.driverNames.length - 3} more</span>
                    )}
                  </div>
                ) : (
                  <span className={`text-xs font-semibold ${PODIUM_TEXT[pos] || "text-foreground"}`}>
                    {shortenName(entry.driverNames[0] || "Unknown")}
                  </span>
                )}
                {entry.teamName && (
                  <p className="text-[9px] text-muted-foreground truncate max-w-[120px]">{entry.teamName}</p>
                )}
                <p className="text-[10px] text-muted-foreground">#{entry.carNumber} · {entry.totalPoints} pts</p>
              </div>
              {/* Podium pillar */}
              <div
                className={`w-full ${PODIUM_HEIGHT[pos] || "h-12"} rounded-t-md border-t border-x bg-gradient-to-b ${PODIUM_BG[pos] || ""} flex items-center justify-center`}
              >
                <span className={`font-display text-2xl font-bold ${PODIUM_TEXT[pos] || "text-foreground"}`}>
                  P{pos}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SeriesProfile = () => {
  const { id } = useParams<{ id: string }>();
  const [series, setSeries] = useState<any>(null);
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const [seasonStandings, setSeasonStandings] = useState<Record<string, StandingEntry[]>>({});
  const [seasonClassMap, setSeasonClassMap] = useState<Record<string, { id: string; name: string }[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data: s } = await supabase.from("v2_series").select("*").eq("id", id).single();
      setSeries(s);

      if (s) {
        const { data: seasons } = await supabase.from("v2_seasons").select("id, year, is_multiclass").eq("series_id", id);
        const seasonIds = (seasons || []).map(sn => sn.id);
        const seasonYearMap = Object.fromEntries((seasons || []).map(sn => [sn.id, sn.year]));
        const multiclassSeasons = new Set((seasons || []).filter(sn => sn.is_multiclass).map(sn => sn.id));

        // Fetch classes for multiclass seasons
        if (multiclassSeasons.size > 0) {
          const { data: classes } = await supabase
            .from("v2_season_classes")
            .select("id, season_id, class_name, sort_order")
            .in("season_id", [...multiclassSeasons])
            .order("sort_order");
          const cMap: Record<string, { id: string; name: string }[]> = {};
          for (const c of (classes || []) as any[]) {
            if (!cMap[c.season_id]) cMap[c.season_id] = [];
            cMap[c.season_id].push({ id: c.id, name: c.class_name });
          }
          setSeasonClassMap(cMap);
        }

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
            seasonId: e.season_id,
          }));
          setEvents(mappedEvents);

          // Compute standings per season from points data
          const standingsMap: Record<string, StandingEntry[]> = {};

          for (const seasonId of seasonIds) {
            const seasonEvts = mappedEvents.filter(e => e.seasonId === seasonId);
            if (seasonEvts.length === 0) continue;

            const evtIds = seasonEvts.map(e => e.id);

            // Get sessions
            const { data: sessions } = await supabase
              .from("v2_sessions")
              .select("id, parent_session_id")
              .in("event_id", evtIds);

            if (!sessions || sessions.length === 0) continue;

            const sessIds = sessions.filter(s => !s.parent_session_id).map(s => s.id);
            if (sessIds.length === 0) continue;

            // Fetch results with points
            const [{ data: raceRes }, { data: qualRes }] = await Promise.all([
              supabase.from("v2_race_results" as any)
                .select("car_number, driver_id, points, extra_data, v2_drivers(full_name), v2_teams(id, full_name)")
                .in("session_id", sessIds),
              supabase.from("v2_qualifying_results" as any)
                .select("car_number, driver_id, points, extra_data, v2_drivers(full_name), v2_teams(id, full_name)")
                .in("session_id", sessIds),
            ]);

            const allResults = [...((raceRes || []) as any[]), ...((qualRes || []) as any[])];

            // Group by car_number
            const carMap = new Map<string, {
              carNumber: string;
              driverIds: Set<string>;
              driverNames: Set<string>;
              teamName: string | null;
              teamId: string | null;
              totalPoints: number;
              className: string | null;
            }>();

            for (const r of allResults) {
              if (!r.car_number) continue;
              const pts = r.points != null ? Number(r.points) : 0;
              const className = r.extra_data?.Class || r.extra_data?.class || null;

              if (!carMap.has(r.car_number)) {
                carMap.set(r.car_number, {
                  carNumber: r.car_number,
                  driverIds: new Set(),
                  driverNames: new Set(),
                  teamName: r.v2_teams?.full_name || null,
                  teamId: r.v2_teams?.id || null,
                  totalPoints: 0,
                  className,
                });
              }

              const entry = carMap.get(r.car_number)!;
              entry.totalPoints += pts;
              if (r.driver_id) entry.driverIds.add(r.driver_id);
              if (r.v2_drivers?.full_name) entry.driverNames.add(r.v2_drivers.full_name);
              if (!entry.teamName && r.v2_teams?.full_name) {
                entry.teamName = r.v2_teams.full_name;
                entry.teamId = r.v2_teams.id;
              }
              if (!entry.className && className) entry.className = className;
            }

            const entries = [...carMap.values()].filter(e => e.totalPoints > 0);
            entries.sort((a, b) => b.totalPoints - a.totalPoints);

            const standings: StandingEntry[] = entries.map((e, i) => ({
              carNumber: e.carNumber,
              driverNames: [...e.driverNames],
              driverIds: [...e.driverIds],
              teamName: e.teamName,
              teamId: e.teamId,
              totalPoints: e.totalPoints,
              position: i + 1,
              className: e.className,
            }));

            if (standings.length > 0) {
              standingsMap[seasonId] = standings;
            }
          }

          setSeasonStandings(standingsMap);
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [id]);

  if (loading) return <div className="min-h-screen bg-background"><Header /><div className="flex items-center justify-center pt-32"><p className="text-muted-foreground">Loading…</p></div></div>;
  if (!series) return <div className="min-h-screen bg-background"><Header /><div className="flex flex-col items-center justify-center pt-32 gap-4"><p className="text-muted-foreground">Series not found.</p></div></div>;

  // Group by year
  const seasonsGrouped = events.reduce<Record<number, { events: DisplayEvent[]; seasonId: string }>>((acc, ev) => {
    if (!acc[ev.year]) acc[ev.year] = { events: [], seasonId: ev.seasonId };
    acc[ev.year].events.push(ev);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={series.name}
        description={`Motorsport series profile for ${series.name}. View seasons and events.`}
        canonical={`/series/${id}`}
      />
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
          <div className="space-y-10">
            {Object.entries(seasonsGrouped).sort(([a], [b]) => Number(b) - Number(a)).map(([year, { events: yearEvents, seasonId }]) => {
              const standings = seasonStandings[seasonId] || [];
              const classes = seasonClassMap[seasonId] || [];
              const isMulticlass = classes.length > 0;

              return (
                <div key={year}>
                  <h3 className="font-display text-lg font-semibold text-foreground mb-4">{year} Season</h3>

                  {/* Podium standings */}
                  {standings.length > 0 && (
                    <div className="mb-6 rounded-lg border border-border bg-card/50 p-5">
                      <h4 className="font-display text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-yellow-500" />
                        {year} Championship Standings
                      </h4>
                      {isMulticlass ? (
                        <div className="grid gap-6 sm:grid-cols-2">
                          {classes.map((cls) => {
                            const classStandings = standings
                              .filter(s => s.className === cls.name)
                              .sort((a, b) => b.totalPoints - a.totalPoints)
                              .map((s, i) => ({ ...s, position: i + 1 }));
                            return (
                              <PodiumDisplay key={cls.id} standings={classStandings} className={cls.name} />
                            );
                          })}
                        </div>
                      ) : (
                        <PodiumDisplay standings={standings} />
                      )}
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {yearEvents.map(ev => (
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
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default SeriesProfile;
