import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, CalendarClock } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { cn } from "@/lib/utils";
import { useDigests, useEvents, useLayouts, useNames, layoutFor, type EventLite } from "@/site/data";
import { Eyebrow, Note, Page, Skeleton, Tabs, TrackMap, dateRange } from "@/site/ui";
import { MONTHS_LONG, MONTHS_SHORT, crewLastNames, headline, overallWinner, parseDay, plural, stripYear, todayISO } from "@/site/archive";

const DAY = 86400000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Calendar() {
  const events = useEvents();
  const digests = useDigests();
  const names = useNames();
  const layouts = useLayouts();
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const thisYear = new Date().getFullYear();

  const years = useMemo(() => {
    const ys = new Set((events || []).map((e) => e.year).filter((y): y is number => y != null));
    ys.add(thisYear);
    return [...ys].sort((a, b) => b - a);
  }, [events, thisYear]);
  const year = Number(params.get("year")) || thisYear;
  const seriesF = params.get("series") || "all";

  const seriesList = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events || []) if (e.series && e.year === year) m.set(e.series.id, e.series.short_name || e.series.name);
    return [...m.entries()];
  }, [events, year]);

  const list = useMemo(
    () =>
      (events || [])
        .filter((e) => e.year === year && (seriesF === "all" || e.series?.id === seriesF))
        .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || "")),
    [events, year, seriesF],
  );
  const upcoming = list.filter((e) => (e.end_date || e.start_date || "") >= today);
  const done = list.filter((e) => (e.end_date || e.start_date || "") < today);
  const next = upcoming[0];

  const months = useMemo(() => {
    const m = new Map<number, EventLite[]>();
    for (const e of list) {
      const d = parseDay(e.start_date);
      if (!d) continue;
      if (!m.has(d.getMonth())) m.set(d.getMonth(), []);
      m.get(d.getMonth())!.push(e);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [list]);

  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v == null) n.delete(k);
    else n.set(k, v);
    if (k === "year") n.delete("series");
    setParams(n, { replace: true });
  };

  const lastDone = done[done.length - 1];

  return (
    <div className="min-h-screen">
      <SEOHead title={`${year} race calendar`} description="Every round of every championship on the record, month by month: what has run and what is next." canonical="/calendar" />
      <Header />

      <Page className="pt-8 sm:pt-14">
        <Eyebrow>Calendar</Eyebrow>
        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <h1 className="display text-[3.2rem] leading-[0.92] sm:text-[5rem] lg:text-[6rem]">
            The <span className="font-accent text-[0.82em] tracking-normal">{year}</span> <em>season.</em>
          </h1>
          {years.length > 1 && <Tabs value={String(year)} onChange={(v) => set("year", v === String(thisYear) ? null : v)} items={years.map((y) => ({ value: String(y), label: <span className="num">{y}</span> }))} />}
        </div>
        {events ? (
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2">
            {list.length === 0
              ? `No rounds of ${year} are on the record.`
              : `${plural(list.length, "race")} on the record for ${year}: ${done.length === list.length ? "all of them run" : `${done.length} run, ${upcoming.length} to come`}.`}
            {list.length > 0 && !upcoming.length && year >= thisYear ? " The rest of the schedule has not been published here yet." : ""}
          </p>
        ) : (
          <Skeleton className="mt-6 h-7 w-full max-w-xl" />
        )}
      </Page>

      {/* ── Year at a glance ─────────────────────────────────── */}
      <Page className="mt-12">
        {!events ? <Skeleton className="h-28 rounded-3xl" /> : <YearStrip year={year} events={list} today={today} />}
      </Page>

      {/* ── Up next ──────────────────────────────────────────── */}
      {events && year >= thisYear && (
        <Page className="mt-6">
          {next ? (
            <NextRace ev={next} today={today} layout={layoutFor(next, layouts)?.layout_image_url} />
          ) : (
            <div className="flex flex-col gap-4 rounded-3xl border border-dashed px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <div className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/[0.06]">
                  <CalendarClock className="h-5 w-5 text-ink-2" />
                </span>
                <div>
                  <div className="display text-2xl">Nothing scheduled on the record</div>
                  <p className="mt-1 max-w-lg text-sm text-ink-2">
                    Upcoming rounds appear here once a championship&rsquo;s schedule is added. Until then, the latest results are the freshest thing on the record.
                  </p>
                </div>
              </div>
              {lastDone ? (
                <Link to={`/events/${lastDone.id}`} className="inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-full bg-ink px-5 text-sm font-medium text-paper sm:self-auto">
                  Latest race <ArrowUpRight className="h-4 w-4" />
                </Link>
              ) : (
                <Link to="/results" className="inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-full bg-ink px-5 text-sm font-medium text-paper sm:self-auto">
                  All results <ArrowUpRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          )}
        </Page>
      )}

      {/* ── Month by month ───────────────────────────────────── */}
      <Page className="mt-20 sm:mt-24">
        {seriesList.length > 1 && (
          <div className="mb-10">
            <Tabs value={seriesF} onChange={(v) => set("series", v === "all" ? null : v)} items={[{ value: "all", label: "All series" }, ...seriesList.map(([id, label]) => ({ value: id, label }))]} />
          </div>
        )}
        {!events ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-3xl" />
            ))}
          </div>
        ) : !months.length ? (
          <Note title={`No races in ${year}`}>
            {years.filter((y) => y !== year).length ? (
              <>
                Try{" "}
                {years
                  .filter((y) => y !== year)
                  .slice(0, 2)
                  .map((y, i) => (
                    <span key={y}>
                      {i > 0 && " or "}
                      <button onClick={() => set("year", String(y))} className="underline underline-offset-4">
                        {y}
                      </button>
                    </span>
                  ))}
                .
              </>
            ) : null}
          </Note>
        ) : (
          <div className="space-y-16">
            {months.map(([m, evs]) => (
              <section key={m} aria-labelledby={`m${m}`} className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
                <div className="lg:sticky lg:top-28 lg:self-start">
                  <h2 id={`m${m}`} className="display text-[2.6rem] leading-none sm:text-5xl">
                    {MONTHS_LONG[m]}
                  </h2>
                  <div className="eyebrow mt-2">{plural(evs.length, "race")}</div>
                </div>
                <ol className="overflow-hidden rounded-3xl border bg-sheet">
                  {evs.map((e) => (
                    <CalRow key={e.id} ev={e} today={today} names={names} race={headline(digests?.[e.id])} layout={layoutFor(e, layouts)?.layout_image_url} />
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

/* ── Year strip: the season at a glance ─────────────────────────── */

function YearStrip({ year, events, today }: { year: number; events: EventLite[]; today: string }) {
  const start = new Date(year, 0, 1).getTime();
  const span = new Date(year + 1, 0, 1).getTime() - start;
  const pct = (iso?: string | null) => {
    const d = parseDay(iso);
    return d ? Math.max(0, Math.min(100, ((d.getTime() - start) / span) * 100)) : 0;
  };
  const todayPct = today.startsWith(String(year)) ? pct(today) : null;
  return (
    <div className="rounded-3xl border bg-sheet px-5 pb-5 pt-6 sm:px-8">
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-1/2 h-px bg-rule" />
        {events.map((e) => {
          const a = pct(e.start_date);
          const b = pct(e.end_date || e.start_date);
          const up = (e.end_date || e.start_date || "") >= today;
          return (
            <Link
              key={e.id}
              to={`/events/${e.id}`}
              title={`${stripYear(e.name)} · ${dateRange(e.start_date, e.end_date)}`}
              aria-label={`${stripYear(e.name)}, ${dateRange(e.start_date, e.end_date)}`}
              className={cn(
                "absolute top-1/2 h-4 min-w-4 -translate-y-1/2 rounded-full border-2 border-sheet transition-transform hover:scale-125",
                up ? "bg-hl ring-1 ring-ink" : "bg-ink",
              )}
              style={{ left: `calc(${a}% - 8px)`, width: `calc(${Math.max(0, b - a)}% + 16px)` }}
            />
          );
        })}
        {todayPct != null && (
          <div className="absolute inset-y-0 w-px bg-ink" style={{ left: `${todayPct}%` }}>
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-wider">Today</span>
          </div>
        )}
      </div>
      <div className="mt-2 grid grid-cols-12">
        {MONTHS_SHORT.map((m, i) => (
          <span key={m} className="eyebrow border-l pl-1.5 text-[9.5px] sm:pl-2 sm:text-[11px]">
            <span className="sm:hidden">{m[0]}</span>
            <span className="hidden sm:inline">{m}</span>
            <span className="sr-only">{i}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Next race ──────────────────────────────────────────────────── */

function NextRace({ ev, today, layout }: { ev: EventLite; today: string; layout?: string | null }) {
  const days = Math.round(((parseDay(ev.start_date)?.getTime() || 0) - (parseDay(today)?.getTime() || 0)) / DAY);
  return (
    <Link to={`/events/${ev.id}`} className="group relative grid overflow-hidden rounded-[28px] bg-ink p-7 text-paper sm:grid-cols-[1fr_auto] sm:p-10">
      <TrackMap key={layout || "x"} src={layout} alt="" className="pointer-events-none absolute -right-10 top-1/2 h-[140%] w-auto -translate-y-1/2 opacity-[0.12] invert dark:invert-0" />
      <div className="relative">
        <Eyebrow className="text-paper/60">
          <span className="rounded-full bg-hl px-2 py-0.5 text-hl-ink">Up next</span>
          <span>{ev.series?.short_name || ev.series?.name}</span>
          <span>·</span>
          <span>{dateRange(ev.start_date, ev.end_date)}</span>
        </Eyebrow>
        <h2 className="display mt-4 text-4xl leading-[0.98] sm:text-6xl">{stripYear(ev.name)}</h2>
        <p className="mt-2 text-paper/60">{ev.circuit?.name}</p>
      </div>
      <div className="relative mt-6 sm:mt-0 sm:text-right">
        <div className="font-accent text-7xl leading-none sm:text-8xl">{days <= 0 ? "Now" : days}</div>
        <div className="eyebrow mt-2 text-paper/60">{days <= 0 ? "Race weekend" : days === 1 ? "Day to go" : "Days to go"}</div>
      </div>
    </Link>
  );
}

/* ── Month row ──────────────────────────────────────────────────── */

function CalRow({ ev, today, names, race, layout }: { ev: EventLite; today: string; names: ReturnType<typeof useNames>; race?: ReturnType<typeof headline>; layout?: string | null }) {
  const d1 = parseDay(ev.start_date);
  const d2 = parseDay(ev.end_date);
  const up = (ev.end_date || ev.start_date || "") >= today;
  const live = (ev.start_date || "") <= today && up;
  const overall = overallWinner(race);
  const days = d1 ? Math.round((d1.getTime() - (parseDay(today)?.getTime() || 0)) / DAY) : null;
  return (
    <li className="border-b last:border-b-0">
      <Link to={`/events/${ev.id}`} className="group grid grid-cols-[5.6rem_minmax(0,1fr)] items-center gap-4 px-5 py-5 transition-colors hover:bg-ink/[0.025] sm:grid-cols-[7.5rem_minmax(0,1fr)_7rem_12rem] sm:gap-6 sm:px-7">
        <div>
          <div className="whitespace-nowrap font-accent text-[1.9rem] leading-none sm:text-[2.6rem]">
            {d1?.getDate()}
            {d2 && d2.getDate() !== d1?.getDate() && <span className="text-ink-3">–{d2.getDate()}</span>}
          </div>
          <div className="eyebrow mt-1.5">
            {d1 && WEEKDAYS[d1.getDay()]}
            {d2 && d2.getTime() !== d1?.getTime() && `–${WEEKDAYS[d2.getDay()]}`}
          </div>
        </div>
        <div className="min-w-0">
          <Eyebrow>
            <span>{ev.series?.short_name || ev.series?.name}</span>
            {ev.round_number != null && (
              <>
                <span>·</span>
                <span>Rd {ev.round_number}</span>
              </>
            )}
          </Eyebrow>
          <div className="display mt-1 text-[1.6rem] leading-[1.04] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4 sm:text-[1.9rem]">{stripYear(ev.name)}</div>
          <div className="mt-1 truncate text-[13px] text-ink-3">{[ev.circuit?.name, ev.circuit?.country].filter(Boolean).join(", ")}</div>
          <div className="mt-2 text-[13px] sm:hidden">{status()}</div>
        </div>
        <div className="relative hidden h-16 sm:block">
          <TrackMap key={layout || "x"} src={layout} alt="" className="absolute inset-0 m-auto h-full w-full opacity-70 transition-transform duration-500 group-hover:scale-105" />
        </div>
        <div className="hidden text-right text-[13.5px] sm:block">{status()}</div>
      </Link>
    </li>
  );

  function status() {
    if (live)
      return <span className="inline-flex rounded-full bg-hl px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider text-hl-ink">This weekend</span>;
    if (up)
      return (
        <span className="text-ink-2">
          <span className="num text-ink">{days}</span> {days === 1 ? "day" : "days"} to go
        </span>
      );
    if (overall)
      return (
        <span className="block text-ink-2">
          <span className="eyebrow block sm:mb-1">Winner</span>
          <span className="text-ink">{crewLastNames(overall.driverIds, names, 3)}</span>
        </span>
      );
    return <span className="text-ink-3">Completed</span>;
  }
}
