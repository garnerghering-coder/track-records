/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import EventCard, { EventListHead, type EventCardEvent } from "@/components/EventCard";
import { EmptyState, FilterInput, PageHeader, RowsSkeleton, SectionHeader } from "@/components/tr/primitives";
import { Count, Segmented, Toolbar, UpcomingTag } from "@/components/browse/Segmented";
import { fetchClassWinners, fetchSeasonClassColors, type ClassWinner } from "@/lib/race-data";

type ResultEvent = EventCardEvent & { seasonId: string };

const ResultsPage = () => {
  const [all, setAll] = useState<ResultEvent[] | null>(null);
  const [winners, setWinners] = useState<Record<string, ClassWinner[]> | null>(null);
  const [colors, setColors] = useState<Record<string, Record<string, string>>>({});
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("v2_events")
        .select("id, name, start_date, end_date, season_id, status, v2_seasons(year, v2_series(name, short_name)), v2_circuits(name, country)")
        .eq("status", "published" as any)
        .order("start_date", { ascending: false })
        .limit(200);

      const list: ResultEvent[] = ((data || []) as any[]).map((e) => ({
        id: e.id,
        name: e.name,
        series: e.v2_seasons?.v2_series?.name || "",
        seriesShort: e.v2_seasons?.v2_series?.short_name || null,
        year: e.v2_seasons?.year || 0,
        circuitName: e.v2_circuits?.name || null,
        country: e.v2_circuits?.country || null,
        date: e.start_date,
        endDate: e.end_date,
        seasonId: e.season_id,
      }));
      setAll(list);

      const [w, cc] = await Promise.all([
        fetchClassWinners(list.map((e) => e.id), 1),
        fetchSeasonClassColors([...new Set(list.map((e) => e.seasonId))]),
      ]);
      setWinners(w);
      setColors(cc);
    })();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const years = useMemo(() => [...new Set((all || []).map((e) => e.year))].sort((a, b) => b - a), [all]);
  const seriesCount = useMemo(() => new Set((all || []).map((e) => e.series)).size, [all]);

  const filtered = useMemo(() => {
    let list = all || [];
    if (yearFilter !== "all") list = list.filter((e) => e.year === Number(yearFilter));
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.series || "").toLowerCase().includes(q) ||
          (e.seriesShort || "").toLowerCase().includes(q) ||
          (e.circuitName || "").toLowerCase().includes(q) ||
          (e.country || "").toLowerCase().includes(q),
      );
    return list;
  }, [all, yearFilter, search]);

  const groups = useMemo(() => {
    const m = new Map<number, ResultEvent[]>();
    for (const e of filtered) {
      if (!m.has(e.year)) m.set(e.year, []);
      m.get(e.year)!.push(e);
    }
    return [...m.entries()].sort(([a], [b]) => b - a);
  }, [filtered]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Race Results" description="Every published race, grouped by season, with class winners at a glance." canonical="/results" />
      <Header />

      <PageHeader
        kicker="Archive"
        title="Results"
        meta={
          all && (
            <>
              <span>
                <span className="num text-foreground">{all.length}</span> events
              </span>
              <span>
                <span className="num text-foreground">{seriesCount}</span> series
              </span>
              {years.length > 0 && (
                <span className="num">
                  {years[years.length - 1]}
                  {years.length > 1 && `–${years[0]}`}
                </span>
              )}
            </>
          )
        }
      />

      <main className="container py-8">
        <Toolbar>
          <FilterInput value={search} onChange={setSearch} placeholder="Filter by event, series, circuit or country…" className="flex-1" />
          {years.length > 1 && (
            <Segmented
              label="Season"
              value={yearFilter}
              onChange={setYearFilter}
              options={[{ value: "all", label: "All" }, ...years.map((y) => ({ value: String(y), label: <span className="num">{y}</span> }))]}
            />
          )}
        </Toolbar>

        <div className="mt-8">
          {!all ? (
            <RowsSkeleton rows={8} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No events found">
              {search ? <>Nothing matches “{search}”. Try a series, circuit or country.</> : "Published events will appear here."}
            </EmptyState>
          ) : (
            <div className="space-y-10">
              {groups.map(([year, events]) => (
                <section key={year}>
                  <SectionHeader kicker="Season" title={<span className="num">{year}</span>} right={<Count n={events.length} label={events.length === 1 ? "event" : "events"} />} />
                  <div className="grid gap-px overflow-hidden rounded border bg-border">
                    <EventListHead />
                    {events.map((ev) => (
                      <EventCard
                        key={ev.id}
                        event={ev}
                        showSeries
                        hideYear
                        winners={winners ? winners[ev.id] || [] : undefined}
                        colors={colors[ev.seasonId]}
                        aside={ev.date && ev.date > today ? <UpcomingTag /> : undefined}
                      />
                    ))}
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

export default ResultsPage;
