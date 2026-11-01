import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Play, Search, X } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { getClassColor } from "@/lib/classes";
import { type RaceDigest } from "@/lib/insights";
import { cn } from "@/lib/utils";
import { useDigests, useEvents, useLayouts, useNames, layoutFor, type EventLite } from "@/site/data";
import { Eyebrow, Livery, Note, Page, Skeleton, Tabs, TrackMap, dateRange } from "@/site/ui";
import { closestFinish, crewLastNames, fold, headline, overallWinner, plural, stripYear, todayISO } from "@/site/archive";

type Names = ReturnType<typeof useNames>;

export default function Results() {
  const events = useEvents();
  const digests = useDigests();
  const names = useNames();
  const layouts = useLayouts();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const seriesF = params.get("series") || "all";
  const yearF = params.get("year") || "all";

  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v === "all" || !v) n.delete(k);
    else n.set(k, v);
    setParams(n, { replace: true });
  };

  const seriesList = useMemo(() => {
    const m = new Map<string, { id: string; label: string; n: number }>();
    for (const e of events || []) if (e.series) m.set(e.series.id, { id: e.series.id, label: e.series.short_name || e.series.name, n: (m.get(e.series.id)?.n || 0) + 1 });
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [events]);
  const years = useMemo(() => [...new Set((events || []).map((e) => e.year).filter((y): y is number => y != null))].sort((a, b) => b - a), [events]);

  const filtered = useMemo(() => {
    if (!events) return null;
    const f = fold(q);
    return events.filter((e) => {
      if (seriesF !== "all" && e.series?.id !== seriesF) return false;
      if (yearF !== "all" && String(e.year) !== yearF) return false;
      if (!f) return true;
      const race = headline(digests?.[e.id]);
      const winners = (race?.winners || []).flatMap((w) => w.driverIds.map((d) => names?.drivers[d]?.full_name));
      const hay = [e.name, e.short_name, e.circuit?.name, e.circuit?.location, e.circuit?.country, e.series?.name, e.series?.short_name, String(e.year), ...winners];
      return hay.some((h) => fold(h).includes(f));
    });
  }, [events, q, seriesF, yearF, digests, names]);

  const byYear = useMemo(() => {
    const m = new Map<number, EventLite[]>();
    for (const e of filtered || []) {
      const y = e.year ?? 0;
      if (!m.has(y)) m.set(y, []);
      m.get(y)!.push(e);
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  const filtering = q || seriesF !== "all" || yearF !== "all";

  return (
    <div className="min-h-screen">
      <SEOHead title="Race results" description="Every race on the record, in every series: the winners, the closest finishes and a replay of how each one unfolded." canonical="/results" />
      <Header />

      <Page className="pt-8 sm:pt-14">
        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-end">
          <div>
            <Eyebrow>Races</Eyebrow>
            <h1 className="display mt-4 text-[3.2rem] leading-[0.92] sm:text-[5rem] lg:text-[6rem]">
              Every race, <em>on the record.</em>
            </h1>
          </div>
          <div className="max-w-md text-lg leading-relaxed text-ink-2 lg:justify-self-end">
            {events ? (
              <>
                {plural(events.length, "race")} across {plural(seriesList.length, "championship")}
                {years.length ? `, ${years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : years[0]}` : ""}. Open one to read its story, or replay it lap by lap.
              </>
            ) : (
              <Skeleton className="h-14 w-full" />
            )}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex h-11 w-full items-center rounded-full border bg-sheet pl-11 pr-3 focus-within:border-ink/40 lg:max-w-sm">
            <Search className="absolute left-4 h-4 w-4 text-ink-3" />
            <span className="sr-only">Search races</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Race, circuit or winner" className="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-ink-3" />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear search" className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-ink/[0.06]">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
          <div className="flex min-w-0 flex-wrap gap-2 lg:ml-auto">
            {seriesList.length > 1 && (
              <Tabs value={seriesF} onChange={(v) => set("series", v)} items={[{ value: "all", label: "All series" }, ...seriesList.map((s) => ({ value: s.id, label: s.label }))]} />
            )}
            {years.length > 1 && <Tabs value={yearF} onChange={(v) => set("year", v)} items={[{ value: "all", label: "All years" }, ...years.map((y) => ({ value: String(y), label: <span className="num">{y}</span> }))]} />}
          </div>
        </div>
      </Page>

      <Page className="mt-12 sm:mt-16">
        {!filtered ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 rounded-3xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Note title={filtering ? "No race matches that" : "No races on the record yet"}>
            {filtering ? (
              <>
                Try a circuit, a driver or a different year.{" "}
                <button
                  onClick={() => {
                    setQ("");
                    setParams(new URLSearchParams(), { replace: true });
                  }}
                  className="underline underline-offset-4"
                >
                  Clear filters
                </button>
              </>
            ) : (
              "Races appear here as soon as their results are published."
            )}
          </Note>
        ) : (
          <div className="space-y-20">
            {byYear.map(([year, list]) => (
              <section key={year} aria-labelledby={`y${year}`}>
                <div className="mb-5 flex items-baseline justify-between gap-4 border-b pb-3">
                  <h2 id={`y${year}`} className="font-accent text-5xl leading-none sm:text-6xl">
                    {year || "Undated"}
                  </h2>
                  <span className="eyebrow">{plural(list.length, "race")}</span>
                </div>
                <ol className="space-y-3">
                  {list.map((e) => (
                    <li key={e.id}>
                      <RaceRow ev={e} race={headline(digests?.[e.id])} names={names} layout={layoutFor(e, layouts)?.layout_image_url} digestsLoading={!digests} />
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </Page>

      <Footer />
    </div>
  );
}

function RaceRow({ ev, race, names, layout, digestsLoading }: { ev: EventLite; race?: RaceDigest; names: Names; layout?: string | null; digestsLoading: boolean }) {
  const overall = overallWinner(race);
  const upcoming = (ev.start_date || "") > todayISO();
  const tint = race?.classes.find((c) => c.name === overall?.className)?.color || getClassColor(overall?.className);
  const close = closestFinish(race);
  const multi = (race?.classes.length || 0) > 1;
  const fastest = race?.insights.find((i) => i.kind === "fastest_lap");
  const feature = close || fastest;

  return (
    <Link
      to={`/events/${ev.id}`}
      className="group grid overflow-hidden rounded-3xl border bg-sheet transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-26px_rgba(0,0,0,0.35)] md:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1.25fr)_minmax(0,1fr)_11rem]"
    >
      {/* livery */}
      <div className="relative h-36 overflow-hidden md:h-auto md:min-h-[11rem]" style={{ background: `linear-gradient(135deg, ${tint}26, transparent 75%)` }}>
        <TrackMap key={layout || "x"} src={layout} alt="" className="absolute inset-0 m-auto h-[80%] w-[80%] opacity-[0.05]" />
        {overall && <span className="absolute -bottom-5 right-2 font-accent text-[6.5rem] leading-none text-ink/[0.06]">{overall.carNumber}</span>}
        <Livery key={overall?.livery} src={overall?.livery} alt={overall ? `#${overall.carNumber}, winner` : ""} className="absolute inset-0 m-auto h-[78%] w-[86%] transition-transform duration-500 group-hover:-translate-x-1.5 group-hover:scale-[1.03]" />
        {upcoming && <span className="absolute left-4 top-4 rounded-full bg-hl px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-hl-ink">Upcoming</span>}
      </div>

      {/* title */}
      <div className="flex min-w-0 flex-col p-5 sm:p-6">
        <Eyebrow>
          <span>{ev.series?.short_name || ev.series?.name}</span>
          {ev.round_number != null && (
            <>
              <span>·</span>
              <span>Rd {ev.round_number}</span>
            </>
          )}
          <span>·</span>
          <span>{dateRange(ev.start_date, ev.end_date)}</span>
        </Eyebrow>
        <h3 className="display mt-2 text-[1.85rem] leading-[1.02] sm:text-[2.1rem]">{stripYear(ev.name)}</h3>
        <div className="mt-1 truncate text-[13px] text-ink-3">{[ev.circuit?.name, ev.circuit?.country].filter(Boolean).join(", ")}</div>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 text-[14px] text-ink-2">
          {overall ? (
            <span className="min-w-0">
              <span className="text-ink-3">Won{multi ? " overall" : ""} by </span>
              {crewLastNames(overall.driverIds, names)}
            </span>
          ) : digestsLoading ? (
            <Skeleton className="h-4 w-40" />
          ) : (
            <span className="text-ink-3">{upcoming ? "Not yet run" : "Classification not on the record"}</span>
          )}
          {race?.hasLaps && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-paper">
                <Play className="h-2.5 w-2.5 fill-current" />
              </span>
              Replay
            </span>
          )}
        </div>
      </div>

      {/* class winners */}
      <div className="hidden min-w-0 border-l p-6 xl:block">
        {race ? (
          <>
            <div className="eyebrow mb-3">{multi ? "Class winners" : "Podium"}</div>
            <ul className="space-y-1.5">
              {(multi ? race.winners : race.podiums[race.classes[0]?.name] || []).map((w, i) => {
                const col = race.classes.find((c) => c.name === w.className)?.color || getClassColor(w.className);
                return (
                  <li key={w.carNumber} className="grid grid-cols-[4.2rem_minmax(0,1fr)_auto] items-center gap-2 text-[13.5px]">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
                      {multi ? (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: col }} />
                          {w.className}
                        </>
                      ) : (
                        `P${i + 1}`
                      )}
                    </span>
                    <span className="truncate">{crewLastNames(w.driverIds, names, 3)}</span>
                    <span className="num text-[11px] text-ink-3">#{w.carNumber}</span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </div>

      {/* closest finish */}
      <div className={cn("flex items-center justify-between gap-4 border-t px-5 py-4 sm:px-6 md:col-span-2 xl:col-span-1 xl:flex-col xl:items-start xl:justify-center xl:border-l xl:border-t-0", !feature && "hidden xl:flex")}>
        {feature ? (
          <>
            <div>
              <div className="eyebrow">{feature.kind === "fastest_lap" ? "Fastest lap" : feature.title}</div>
              <div className="num mt-1 text-2xl xl:mt-2 xl:text-[1.7rem]">{feature.value}</div>
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink xl:hidden" />
          </>
        ) : (
          <span className="text-xs text-ink-3">—</span>
        )}
        {race && <div className="hidden text-[12px] text-ink-3 xl:mt-3 xl:block">{plural(race.stats.cars, "starter")} · {race.stats.finishers} finished</div>}
      </div>
    </Link>
  );
}
