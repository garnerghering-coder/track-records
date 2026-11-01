/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { EmptyState, FilterInput, PageHeader, RowsSkeleton } from "@/components/tr/primitives";
import { Count, Toolbar } from "@/components/browse/Segmented";
import { formatDateRange } from "@/lib/date-utils";

interface SeriesRow {
  id: string;
  name: string;
  short_name: string | null;
  years: number[];
  events: number;
  latest: { id: string; name: string; start_date: string | null; end_date: string | null } | null;
}

const GRID = "grid grid-cols-[minmax(0,1fr)_1rem] gap-x-6 md:grid-cols-[minmax(0,1.4fr)_8rem_5rem_minmax(0,1.2fr)_1rem]";

const SeriesPage = () => {
  const [seriesList, setSeriesList] = useState<SeriesRow[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("v2_series")
      .select("id, name, short_name, v2_seasons(id, year, v2_events(id, name, start_date, end_date, status))")
      .order("name")
      .then(({ data }) => {
        const today = new Date().toISOString().slice(0, 10);
        setSeriesList(
          ((data || []) as any[]).map((s) => {
            const seasons = (s.v2_seasons || []) as any[];
            const evs = seasons.flatMap((se) => (se.v2_events || []).filter((e: any) => e.status === "published"));
            const past = evs.filter((e: any) => e.start_date && e.start_date <= today).sort((a: any, b: any) => (b.start_date || "").localeCompare(a.start_date || ""));
            return {
              id: s.id,
              name: s.name,
              short_name: s.short_name,
              years: [...new Set(seasons.filter((se) => (se.v2_events || []).some((e: any) => e.status === "published")).map((se) => se.year as number))].sort((a, b) => b - a),
              events: evs.length,
              latest: past[0] || null,
            };
          }),
        );
      });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!seriesList || !q) return seriesList || [];
    return seriesList.filter((s) => s.name.toLowerCase().includes(q) || (s.short_name || "").toLowerCase().includes(q));
  }, [seriesList, search]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Series & Championships" description="Browse motorsport series, their seasons, schedules and championship standings." canonical="/series" />
      <Header />
      <PageHeader
        kicker="Championships"
        title="Series"
        meta={
          seriesList && (
            <>
              <span>
                <span className="num text-foreground">{seriesList.length}</span> series
              </span>
              <span>
                <span className="num text-foreground">{seriesList.reduce((n, s) => n + s.events, 0)}</span> events
              </span>
            </>
          )
        }
      />

      <main className="container py-8">
        <Toolbar>
          <FilterInput value={search} onChange={setSearch} placeholder="Filter by series name…" className="flex-1" />
          {seriesList && <Count n={filtered.length} label="series" />}
        </Toolbar>

        <div className="mt-6">
          {!seriesList ? (
            <RowsSkeleton rows={3} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No series found">Nothing matches “{search}”.</EmptyState>
          ) : (
            <div className="grid gap-px overflow-hidden rounded border bg-border">
              <div className={`${GRID} hidden h-9 items-center bg-card px-4 md:grid`}>
                <span className="label-caps">Series</span>
                <span className="label-caps">Seasons</span>
                <span className="label-caps text-right">Events</span>
                <span className="label-caps">Latest round</span>
                <span />
              </div>
              {filtered.map((s) => (
                <Link key={s.id} to={`/series/${s.id}`} className={`${GRID} group items-center gap-y-2 bg-card px-4 py-4 transition-colors hover:bg-accent/60`}>
                  <div className="min-w-0">
                    <div className="label-caps text-primary">{s.short_name || "Series"}</div>
                    <div className="mt-0.5 font-display text-lg font-bold uppercase leading-tight transition-colors group-hover:text-primary">{s.name}</div>
                    {/* Mobile meta */}
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground md:hidden">
                      <span>
                        <span className="num text-foreground">{s.events}</span> events
                      </span>
                      {s.years.length > 0 && <span className="num">{s.years.join(" · ")}</span>}
                      {s.latest && <span className="truncate">Latest: {s.latest.name}</span>}
                    </div>
                  </div>
                  <div className="hidden flex-wrap gap-1 md:flex">
                    {s.years.length ? (
                      s.years.map((y) => (
                        <span key={y} className="num rounded-sm border px-1.5 py-0.5 text-xs text-foreground">
                          {y}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="num hidden text-right text-lg text-foreground md:block">{s.events}</div>
                  <div className="hidden min-w-0 md:block">
                    {s.latest ? (
                      <>
                        <div className="truncate text-sm text-foreground">{s.latest.name}</div>
                        <div className="num text-xs text-muted-foreground">{formatDateRange(s.latest.start_date, s.latest.end_date)}</div>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">No results yet</span>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default SeriesPage;
