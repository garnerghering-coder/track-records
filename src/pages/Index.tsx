/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, ChevronRight, Fingerprint, GitCommitHorizontal, MapPin, Search, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import FlagImage from "@/components/FlagImage";
import { ClassBadge, EmptyState, Pos, SectionHeader, RowsSkeleton } from "@/components/tr/primitives";
import { formatDateRange } from "@/lib/date-utils";
import { fetchClassWinners, fetchSeasonClassColors, shortName, type ClassWinner } from "@/lib/race-data";
import { getClassColor } from "@/lib/classes";

interface HomeEvent {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  season_id: string;
  year?: number;
  series?: { id: string; name: string; short_name?: string | null };
  circuit?: { id: string; name: string; country?: string | null };
}

const openSearch = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }));

const Index = () => {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [events, setEvents] = useState<HomeEvent[] | null>(null);
  const [upcoming, setUpcoming] = useState<HomeEvent[]>([]);
  const [winners, setWinners] = useState<Record<string, ClassWinner[]>>({});
  const [classColors, setClassColors] = useState<Record<string, Record<string, string>>>({});
  const [series, setSeries] = useState<any[]>([]);

  useEffect(() => {
    const head = { count: "exact" as const, head: true };
    Promise.all([
      supabase.from("v2_drivers").select("id", head),
      supabase.from("v2_teams").select("id", head),
      supabase.from("v2_events").select("id", head).eq("status", "published" as any),
      supabase.from("v2_circuits").select("id", head),
      supabase.from("v2_cars").select("id", head),
    ]).then(([d, t, e, c, k]) =>
      setCounts({ Drivers: d.count ?? 0, Teams: t.count ?? 0, Events: e.count ?? 0, Circuits: c.count ?? 0, Cars: k.count ?? 0 }),
    );

    const map = (e: any): HomeEvent => ({
      id: e.id,
      name: e.name,
      start_date: e.start_date,
      end_date: e.end_date,
      season_id: e.season_id,
      year: e.v2_seasons?.year,
      series: e.v2_seasons?.v2_series,
      circuit: e.v2_circuits,
    });
    const sel = "id, name, start_date, end_date, season_id, v2_seasons(year, v2_series(id, name, short_name)), v2_circuits(id, name, country)";
    const today = new Date().toISOString().slice(0, 10);

    supabase
      .from("v2_events")
      .select(sel)
      .eq("status", "published" as any)
      .lte("start_date", today)
      .order("start_date", { ascending: false })
      .limit(5)
      .then(async ({ data }) => {
        const list = ((data || []) as any[]).map(map);
        setEvents(list);
        const [w, cc] = await Promise.all([
          fetchClassWinners(list.map((e) => e.id), 3),
          fetchSeasonClassColors([...new Set(list.map((e) => e.season_id))]),
        ]);
        setWinners(w);
        setClassColors(cc);
      });

    supabase
      .from("v2_events")
      .select(sel)
      .eq("status", "published" as any)
      .gt("start_date", today)
      .order("start_date")
      .limit(4)
      .then(({ data }) => setUpcoming(((data || []) as any[]).map(map)));

    supabase
      .from("v2_series")
      .select("id, name, short_name, v2_seasons(id, year, v2_events(id, status))")
      .order("name")
      .then(({ data }) => setSeries((data || []) as any[]));
  }, []);

  const [lead, ...rest] = events || [];

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Track Records – Multi-class motorsport results & driver records"
        description="Race results, lap-by-lap timing analysis and driver records for IMSA and sportscar racing — searchable, linked and class-aware."
        canonical="/"
      />
      <Header />

      {/* ── Intro band ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b">
        <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden />
        <div className="container relative grid gap-8 py-10 md:py-14 lg:grid-cols-[1.25fr_1fr] lg:items-end">
          <div>
            <div className="label-caps mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-signal" /> The sportscar results database
            </div>
            <h1 className="font-display text-[2.6rem] font-bold uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-[4.25rem]">
              Every lap. Every class.
              <br />
              <span className="text-primary">On the record.</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
              Multi-class results, lap-by-lap gaps, strategy and driver careers — linked across IMSA and beyond.
            </p>
            <button
              onClick={openSearch}
              className="group mt-6 flex h-12 w-full max-w-xl items-center gap-3 rounded border bg-card px-4 text-left text-muted-foreground shadow-sm transition-colors hover:border-foreground/30"
            >
              <Search className="h-5 w-5" />
              <span className="flex-1">Search a driver, team, car or circuit…</span>
              <kbd className="hidden rounded-sm border bg-muted px-1.5 py-0.5 font-mono text-[11px] sm:inline">⌘K</kbd>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded border bg-border sm:grid-cols-5 lg:grid-cols-3">
            {(["Drivers", "Teams", "Events", "Circuits", "Cars"] as const).map((k) => {
              const to = { Drivers: "/search?tab=drivers", Teams: "/teams", Events: "/results", Circuits: "/search?tab=circuits", Cars: "/cars" }[k];
              return (
                <Link key={k} to={to} className="group bg-card px-4 py-3.5 transition-colors hover:bg-accent">
                  <div className="font-accent text-2xl leading-none text-foreground sm:text-3xl">{counts ? counts[k].toLocaleString() : "—"}</div>
                  <div className="label-caps mt-1.5 flex items-center gap-1 group-hover:text-foreground">
                    {k} <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </Link>
              );
            })}
            <button onClick={openSearch} className="hidden bg-card px-4 py-3.5 text-left transition-colors hover:bg-accent lg:block">
              <div className="font-accent text-2xl leading-none text-primary sm:text-3xl">/</div>
              <div className="label-caps mt-1.5">Quick search</div>
            </button>
          </div>
        </div>
      </section>

      <main className="container py-10 md:py-12">
        {/* ── Latest results ──────────────────────────────────── */}
        <SectionHeader kicker="Class winners" title="Latest results" to="/results" linkLabel="All results" />

        {!events && <RowsSkeleton rows={5} />}
        {events && events.length === 0 && <EmptyState title="No results yet">Published events will appear here.</EmptyState>}

        {lead && (
          <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
            <LeadResult ev={lead} winners={winners[lead.id]} colors={classColors[lead.season_id]} />
            <div className="grid content-start gap-px overflow-hidden rounded border bg-border">
              {rest.map((ev) => (
                <CompactResult key={ev.id} ev={ev} winners={winners[ev.id]} colors={classColors[ev.season_id]} />
              ))}
            </div>
          </div>
        )}

        {/* ── Upcoming ────────────────────────────────────────── */}
        {upcoming.length > 0 && (
          <section className="mt-12">
            <SectionHeader kicker="Coming up" title="Next on track" to="/calendar" linkLabel="Calendar" />
            <div className="grid gap-px overflow-hidden rounded border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {upcoming.map((ev) => (
                <Link key={ev.id} to={`/events/${ev.id}`} className="bg-card p-4 transition-colors hover:bg-accent">
                  <div className="num text-xs text-primary">{formatDateRange(ev.start_date, ev.end_date)}</div>
                  <div className="mt-1 font-display text-base font-bold uppercase leading-tight">{ev.name}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{ev.series?.name}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Inside every event ──────────────────────────────── */}
        <section className="mt-14">
          <SectionHeader kicker="Beyond the classification" title="Inside every event" />
          <div className="grid gap-px overflow-hidden rounded border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Activity, title: "Class time delta", body: "Gap to the class leader, lap by lap, with flag periods overlaid." },
              { icon: GitCommitHorizontal, title: "Strategy timeline", body: "Every stint, pit stop and driver change across the race." },
              { icon: Timer, title: "Position progression", body: "How each car moved through the order, and when." },
              { icon: Fingerprint, title: "Fingerprints", body: "Circuit demand and driver profiles distilled to a few honest numbers." },
            ].map((f) => (
              <Link key={f.title} to={lead ? `/events/${lead.id}` : "/results"} className="group bg-card p-5 transition-colors hover:bg-accent">
                <f.icon className="h-5 w-5 text-primary" />
                <div className="mt-3 font-display text-base font-bold uppercase tracking-wide">{f.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Series ──────────────────────────────────────────── */}
        {series.length > 0 && (
          <section className="mt-14">
            <SectionHeader kicker="Championships" title="Series" to="/series" />
            <div className="grid gap-px overflow-hidden rounded border bg-border md:grid-cols-3">
              {series.map((s) => {
                const seasons = (s.v2_seasons || []).sort((a: any, b: any) => b.year - a.year);
                const evCount = seasons.reduce((n: number, se: any) => n + (se.v2_events || []).filter((e: any) => e.status === "published").length, 0);
                return (
                  <Link key={s.id} to={`/series/${s.id}`} className="group flex items-center gap-4 bg-card p-5 transition-colors hover:bg-accent">
                    <div className="min-w-0 flex-1">
                      <div className="label-caps">{s.short_name || "Series"}</div>
                      <div className="mt-1 font-display text-lg font-bold uppercase leading-tight">{s.name}</div>
                      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                        <span>
                          <span className="num text-foreground">{seasons.length}</span> {seasons.length === 1 ? "season" : "seasons"}
                        </span>
                        <span>
                          <span className="num text-foreground">{evCount}</span> events
                        </span>
                        {seasons[0] && (
                          <span>
                            Latest <span className="num text-foreground">{seasons[0].year}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
};

/* ── Lead result: full class-winner table for the most recent event ── */
function LeadResult({ ev, winners: all, colors }: { ev: HomeEvent; winners?: ClassWinner[]; colors?: Record<string, string> }) {
  const classes = new Set((all || []).map((w) => w.className));
  const podiumMode = classes.size <= 1;
  const winners = all && (podiumMode ? all : all.filter((w) => w.classPosition === 1));
  return (
    <div className="overflow-hidden rounded border bg-card">
      <Link to={`/events/${ev.id}`} className="group block border-b p-5 transition-colors hover:bg-accent/50">
        <div className="label-caps flex flex-wrap items-center gap-x-2">
          <span className="text-primary">{ev.series?.short_name || ev.series?.name}</span>
          <span>·</span>
          <span className="num normal-case tracking-normal">{formatDateRange(ev.start_date, ev.end_date)}</span>
          {podiumMode && all?.[0]?.className && (
            <>
              <span>·</span>
              <span>{all[0].className} podium</span>
            </>
          )}
        </div>
        <div className="mt-1.5 flex items-start justify-between gap-4">
          <h3 className="font-display text-2xl font-bold uppercase leading-tight sm:text-3xl">{ev.name}</h3>
          <span className="mt-1 hidden shrink-0 items-center gap-1 font-display text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground group-hover:text-foreground sm:flex">
            Full results <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
        {ev.circuit && (
          <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {ev.circuit.name}
            {ev.circuit.country && <>, {ev.circuit.country}</>}
          </div>
        )}
      </Link>
      {!winners ? (
        <div className="p-5">
          <div className="h-24 animate-pulse rounded-sm bg-muted" />
        </div>
      ) : winners.length === 0 ? (
        <div className="p-5 text-sm text-muted-foreground">Classification not yet published.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-24">{podiumMode ? "Pos" : "Class"}</th>
                <th className="w-14 text-right">Car</th>
                <th>{podiumMode ? "Driver" : "Winners"}</th>
                <th className="hidden md:table-cell">Team</th>
              </tr>
            </thead>
            <tbody>
              {winners.map((w, i) => (
                <tr key={i}>
                  <td>
                    {podiumMode ? (
                      <Pos value={w.classPosition} />
                    ) : w.className ? (
                      <ClassBadge name={w.className} color={getClassColor(w.className, colors)} />
                    ) : (
                      <span className="label-caps">Overall</span>
                    )}
                  </td>
                  <td className="num text-right font-semibold">#{w.carNumber}</td>
                  <td>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {w.drivers.map((d) => (
                        <Link key={d.id} to={`/driver/${d.id}`} className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium hover:text-primary">
                          <FlagImage nationality={d.nationality} size={14} />
                          {shortName(d.name)}
                        </Link>
                      ))}
                    </div>
                    {w.team && <div className="truncate text-xs text-muted-foreground md:hidden">{w.team.name}</div>}
                  </td>
                  <td className="hidden text-muted-foreground md:table-cell">
                    {w.team && (
                      <Link to={`/team/${w.team.id}`} className="hover:text-foreground">
                        {w.team.name}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Compact result row ── */
function CompactResult({ ev, winners, colors }: { ev: HomeEvent; winners?: ClassWinner[]; colors?: Record<string, string> }) {
  return (
    <Link to={`/events/${ev.id}`} className="group block bg-card p-4 transition-colors hover:bg-accent">
      <div className="label-caps flex items-center gap-2">
        <span className="truncate">{ev.series?.short_name || ev.series?.name}</span>
        <span>·</span>
        <span className="num shrink-0 normal-case tracking-normal">{formatDateRange(ev.start_date, ev.end_date)}</span>
      </div>
      <div className="mt-1 font-display text-base font-bold uppercase leading-tight group-hover:text-primary">{ev.name}</div>
      {winners && winners.length > 0 && (
        <div className="mt-2 space-y-1">
          {winners.filter((w) => w.classPosition === 1).slice(0, 4).map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-0.5 shrink-0" style={{ backgroundColor: getClassColor(w.className, colors) }} />
              <span className="w-14 shrink-0 font-display font-bold uppercase tracking-wider text-muted-foreground">{w.className || "Winner"}</span>
              <span className="truncate">{w.drivers.map((d) => shortName(d.name)).join(" / ")}</span>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}

export default Index;
