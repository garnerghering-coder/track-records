/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import EventCard, { EventListHead, type EventCardEvent } from "@/components/EventCard";
import { EmptyState, FilterInput, PageHeader, RowsSkeleton } from "@/components/tr/primitives";
import { Count, Segmented, Toolbar, UpcomingTag } from "@/components/browse/Segmented";
import { fetchClassWinners, fetchSeasonClassColors, type ClassWinner } from "@/lib/race-data";
import { formatDateRange } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

type CalEvent = EventCardEvent & { seasonId: string; seriesId: string | null; round: string | null };

const toDate = (s: string) => new Date(s + (s.includes("T") ? "" : "T00:00:00Z"));

/** Day block for the leading column: weekday + day number. */
function DayBlock({ start, end, past }: { start: string | null; end: string | null; past: boolean }) {
  if (!start) return <span className="label-caps">TBA</span>;
  const a = toDate(start);
  const b = end ? toDate(end) : a;
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  const wd = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const mo = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return (
    <div className="leading-none">
      <div className="label-caps">
        {wd(a)}
        {end && end !== start && `–${wd(b)}`}
      </div>
      <div className={cn("mt-1.5 font-accent text-2xl", past ? "text-foreground" : "text-primary")}>
        {a.getUTCDate()}
        {end && end !== start && (
          <span className="num ml-1 align-[0.2em] text-xs text-muted-foreground">
            –{!sameMonth && `${mo(b)} `}
            {b.getUTCDate()}
          </span>
        )}
      </div>
    </div>
  );
}

const CalendarPage = () => {
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [series, setSeries] = useState<{ id: string; name: string; short_name: string | null }[]>([]);
  const [winners, setWinners] = useState<Record<string, ClassWinner[]> | null>(null);
  const [colors, setColors] = useState<Record<string, Record<string, string>>>({});
  const [year, setYear] = useState<string>("");
  const [seriesFilter, setSeriesFilter] = useState("all");
  const [search, setSearch] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    supabase
      .from("v2_series")
      .select("id, name, short_name")
      .order("name")
      .then(({ data }) => setSeries((data || []) as any[]));

    (async () => {
      const { data } = await supabase
        .from("v2_events")
        .select("id, name, start_date, end_date, season_id, round_number, v2_seasons(year, v2_series(id, name, short_name)), v2_circuits(id, name, country)")
        .eq("status", "published" as any)
        .order("start_date", { ascending: true })
        .limit(500);
      const list: CalEvent[] = ((data || []) as any[]).map((e) => ({
        id: e.id,
        name: e.name,
        series: e.v2_seasons?.v2_series?.name || "",
        seriesShort: e.v2_seasons?.v2_series?.short_name || null,
        seriesId: e.v2_seasons?.v2_series?.id || null,
        year: e.v2_seasons?.year || (e.start_date ? Number(e.start_date.slice(0, 4)) : 0),
        circuitName: e.v2_circuits?.name || null,
        country: e.v2_circuits?.country || null,
        date: e.start_date,
        endDate: e.end_date,
        seasonId: e.season_id,
        round: e.round_number,
      }));
      setEvents(list);

      // Default season: the current year if it has events, else the most recent one
      const ys = [...new Set(list.map((e) => e.year))].sort((a, b) => b - a);
      const thisYear = new Date().getFullYear();
      setYear((cur) => cur || String(ys.includes(thisYear) ? thisYear : ys[0] ?? thisYear));

      const past = list.filter((e) => e.date && e.date <= today);
      const [w, cc] = await Promise.all([
        fetchClassWinners(past.map((e) => e.id), 1),
        fetchSeasonClassColors([...new Set(list.map((e) => e.seasonId))]),
      ]);
      setWinners(w);
      setColors(cc);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const years = useMemo(() => [...new Set((events || []).map((e) => e.year))].sort((a, b) => b - a), [events]);
  const upcomingAll = useMemo(() => (events || []).filter((e) => !e.date || e.date > today), [events, today]);
  const lastRun = useMemo(() => [...(events || [])].reverse().find((e) => e.date && e.date <= today), [events, today]);

  const yearEvents = useMemo(() => (events || []).filter((e) => String(e.year) === year), [events, year]);

  const filtered = useMemo(() => {
    let list = yearEvents;
    if (seriesFilter !== "all") list = list.filter((e) => e.seriesId === seriesFilter);
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.series || "").toLowerCase().includes(q) ||
          (e.circuitName || "").toLowerCase().includes(q) ||
          (e.country || "").toLowerCase().includes(q),
      );
    return list;
  }, [yearEvents, seriesFilter, search]);

  const months = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of filtered) {
      const key = e.date ? toDate(e.date).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "Date TBA";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }
    return [...m.entries()];
  }, [filtered]);

  const seriesInYear = useMemo(() => {
    const ids = new Set(yearEvents.map((e) => e.seriesId));
    return series.filter((s) => ids.has(s.id));
  }, [series, yearEvents]);

  const yearUpcoming = yearEvents.filter((e) => !e.date || e.date > today).length;
  const nextUp = upcomingAll[0];

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Race Calendar" description="Season schedules for every series — upcoming rounds and completed races with class winners." canonical="/calendar" />
      <Header />

      <PageHeader
        kicker="Schedule"
        title="Calendar"
        meta={
          events && (
            <>
              <span>
                <span className="num text-foreground">{yearEvents.length}</span> events in <span className="num text-foreground">{year}</span>
              </span>
              <span>
                <span className="num text-foreground">{yearEvents.length - yearUpcoming}</span> completed
              </span>
              <span>
                <span className={cn("num", yearUpcoming ? "text-primary" : "text-foreground")}>{yearUpcoming}</span> upcoming
              </span>
            </>
          )
        }
        actions={
          years.length > 1 && (
            <Segmented label="Season" value={year} onChange={setYear} options={years.map((y) => ({ value: String(y), label: <span className="num">{y}</span> }))} />
          )
        }
      />

      <main className="container py-8">
        {/* Next-up banner, or a clear note when nothing is scheduled */}
        {events &&
          (nextUp ? (
            <Link
              to={`/events/${nextUp.id}`}
              className="group mb-6 flex flex-col gap-1 rounded border border-primary/40 bg-card px-4 py-3 transition-colors hover:bg-accent/60 sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="label-caps flex items-center gap-2 text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-signal" /> Next up
              </span>
              <span className="font-display text-base font-bold uppercase leading-tight group-hover:text-primary">{nextUp.name}</span>
              <span className="num text-xs text-muted-foreground sm:ml-auto">{formatDateRange(nextUp.date, nextUp.endDate)}</span>
            </Link>
          ) : (
            <div className="mb-6 flex items-start gap-3 rounded border bg-card px-4 py-3">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="text-sm">
                <span className="font-display font-bold uppercase tracking-wide text-foreground">No upcoming events scheduled.</span>{" "}
                <span className="text-muted-foreground">
                  New rounds appear here as soon as they are added.
                  {lastRun && (
                    <>
                      {" "}
                      Most recent:{" "}
                      <Link to={`/events/${lastRun.id}`} className="text-foreground underline-offset-2 hover:text-primary hover:underline">
                        {lastRun.name}
                      </Link>{" "}
                      <span className="num">({formatDateRange(lastRun.date, lastRun.endDate)})</span>.
                    </>
                  )}
                </span>
              </div>
            </div>
          ))}

        <Toolbar>
          <FilterInput value={search} onChange={setSearch} placeholder="Filter by event, circuit or country…" className="flex-1" />
          {seriesInYear.length > 1 && (
            <Segmented
              label="Series"
              value={seriesFilter}
              onChange={setSeriesFilter}
              options={[
                { value: "all", label: "All series" },
                ...seriesInYear.map((s) => ({ value: s.id, label: s.short_name || s.name, count: yearEvents.filter((e) => e.seriesId === s.id).length })),
              ]}
            />
          )}
        </Toolbar>

        <div className="mt-8">
          {!events ? (
            <RowsSkeleton rows={6} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No events found">
              {search || seriesFilter !== "all" ? "Try clearing the filters." : `No events are published for ${year} yet.`}
            </EmptyState>
          ) : (
            <div className="space-y-8">
              {months.map(([month, list]) => (
                <section key={month}>
                  <div className="mb-3 flex items-end justify-between gap-4 border-b pb-2">
                    <h2 className="font-display text-xl font-bold uppercase tracking-wide">{month}</h2>
                    <Count n={list.length} label={list.length === 1 ? "event" : "events"} />
                  </div>
                  <div className="grid gap-px overflow-hidden rounded border bg-border">
                    <EventListHead lead="Day" winners="Status / class winners" />
                    {list.map((ev) => {
                      const past = !!ev.date && ev.date <= today;
                      const live = past && !!ev.endDate && ev.endDate >= today;
                      return (
                        <EventCard
                          key={ev.id}
                          event={ev}
                          showSeries
                          hideYear
                          colors={colors[ev.seasonId]}
                          winners={past ? (winners ? winners[ev.id] || [] : undefined) : undefined}
                          aside={
                            !past ? (
                              <UpcomingTag />
                            ) : live ? (
                              <span className="label-caps flex items-center gap-1.5 text-pb">
                                <span className="h-1.5 w-1.5 rounded-full bg-pb" /> On track now
                              </span>
                            ) : undefined
                          }
                          lead={<DayBlock start={ev.date} end={ev.endDate} past={past} />}
                        />
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CalendarPage;
