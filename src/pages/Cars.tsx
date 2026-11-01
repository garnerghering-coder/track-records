/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { EmptyState, FilterInput, PageHeader, RowsSkeleton } from "@/components/tr/primitives";
import { Count, Segmented, Toolbar } from "@/components/browse/Segmented";
import { fetchTeamSeasonCars, uniqSorted } from "@/components/browse/directory-data";

interface CarRow {
  id: string;
  manufacturer: string;
  model: string;
  series: { id: string; label: string }[];
  teams: number;
  years: number[];
}

const CarsPage = () => {
  const [cars, setCars] = useState<CarRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("all");

  useEffect(() => {
    Promise.all([supabase.from("v2_cars").select("*").order("model_name"), fetchTeamSeasonCars()]).then(([{ data }, links]) => {
      setCars(
        ((data || []) as any[])
          .map((c) => {
            const mine = links.filter((l) => l.carId === c.id);
            const series = new Map<string, string>();
            for (const l of mine) if (l.seriesId) series.set(l.seriesId, l.seriesShort || "");
            return {
              id: c.id,
              manufacturer: (c.manufacturer || "").trim() || "Other",
              model: c.model_name,
              series: [...series.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)),
              teams: new Set(mine.map((l) => l.teamId)).size,
              years: uniqSorted(mine.map((l) => l.year), (a, b) => b - a),
            };
          })
          .sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.model.localeCompare(b.model)),
      );
    });
  }, []);

  const seriesOptions = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    for (const c of cars || []) for (const s of c.series) m.set(s.id, { label: s.label, n: (m.get(s.id)?.n || 0) + 1 });
    return [...m.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [cars]);

  const filtered = useMemo(() => {
    let list = cars || [];
    if (seriesFilter !== "all") list = list.filter((c) => c.series.some((s) => s.id === seriesFilter));
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) => c.model.toLowerCase().includes(q) || c.manufacturer.toLowerCase().includes(q));
    return list;
  }, [cars, search, seriesFilter]);

  const groups = useMemo(() => {
    const m = new Map<string, CarRow[]>();
    for (const c of filtered) {
      if (!m.has(c.manufacturer)) m.set(c.manufacturer, []);
      m.get(c.manufacturer)!.push(c);
    }
    return [...m.entries()];
  }, [filtered]);

  const makes = useMemo(() => new Set((cars || []).map((c) => c.manufacturer)).size, [cars]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Cars" description="Every car model in the database, by manufacturer, with the series and teams that race it." canonical="/cars" />
      <Header />
      <PageHeader
        kicker="Directory"
        title="Cars"
        meta={
          cars && (
            <>
              <span>
                <span className="num text-foreground">{cars.length}</span> models
              </span>
              <span>
                <span className="num text-foreground">{makes}</span> manufacturers
              </span>
            </>
          )
        }
      />
      <main className="container py-8">
        <Toolbar>
          <FilterInput value={search} onChange={setSearch} placeholder="Filter by manufacturer or model…" className="flex-1" />
          {seriesOptions.length > 1 && (
            <Segmented
              label="Series"
              value={seriesFilter}
              onChange={setSeriesFilter}
              options={[{ value: "all", label: "All" }, ...seriesOptions.map(([id, s]) => ({ value: id, label: s.label, count: s.n }))]}
            />
          )}
        </Toolbar>

        <div className="mt-6">
          {!cars ? (
            <RowsSkeleton rows={10} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No cars found">{search ? <>Nothing matches “{search}”.</> : "Try another series."}</EmptyState>
          ) : (
            <>
              <div className="mb-2 flex justify-end">
                <Count n={filtered.length} label={filtered.length === 1 ? "model" : "models"} />
              </div>
              <div className="overflow-hidden rounded border bg-card">
                <table className="data-table table-fixed">
                  <thead>
                    <tr>
                      <th className="hidden w-44 sm:table-cell">Manufacturer</th>
                      <th>Model</th>
                      <th className="hidden w-48 md:table-cell">Series</th>
                      <th className="w-16 text-right">Teams</th>
                      <th className="hidden w-32 text-right sm:table-cell">Seasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(([make, list]) =>
                      list.map((c, i) => (
                        <tr key={c.id} className="group">
                          <td className={i === 0 ? "hidden font-display text-sm font-bold uppercase tracking-wide sm:table-cell" : "hidden sm:table-cell"}>
                            {i === 0 ? make : ""}
                          </td>
                          <td>
                            <Link to={`/car/${c.id}`} className="block truncate font-medium text-foreground group-hover:text-primary">
                              <span className="mr-1.5 font-display font-bold uppercase tracking-wide text-muted-foreground sm:hidden">{make}</span>
                              {c.model}
                            </Link>
                          </td>
                          <td className="hidden md:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {c.series.length ? (
                                c.series.map((s) => (
                                  <Link key={s.id} to={`/series/${s.id}`} className="label-caps rounded-sm border px-1.5 py-0.5 hover:border-foreground/30 hover:text-foreground">
                                    {s.label}
                                  </Link>
                                ))
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          </td>
                          <td className="num text-right">{c.teams || <span className="text-muted-foreground">—</span>}</td>
                          <td className="num hidden text-right text-xs text-muted-foreground sm:table-cell">{c.years.length ? c.years.join(" · ") : "—"}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CarsPage;
