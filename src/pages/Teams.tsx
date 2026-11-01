/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FlagImage from "@/components/FlagImage";
import SEOHead from "@/components/SEOHead";
import { EmptyState, FilterInput, PageHeader, RowsSkeleton } from "@/components/tr/primitives";
import { Count, Segmented, Toolbar } from "@/components/browse/Segmented";
import { fetchTeamSeasonCars, uniqSorted } from "@/components/browse/directory-data";

interface TeamRow {
  id: string;
  name: string;
  shortName: string | null;
  nationality: string | null;
  series: { id: string; label: string }[];
  cars: { id: string; label: string }[];
  years: number[];
}

const TeamsPage = () => {
  const [teams, setTeams] = useState<TeamRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("all");

  useEffect(() => {
    Promise.all([
      supabase.from("v2_teams").select("id, full_name, short_name, nationality").order("full_name"),
      supabase.from("v2_cars").select("id, manufacturer, model_name"),
      fetchTeamSeasonCars(),
    ]).then(([{ data: t }, { data: c }, links]) => {
      const carLabel = Object.fromEntries(((c || []) as any[]).map((x) => [x.id, [x.manufacturer?.trim(), x.model_name].filter(Boolean).join(" ")]));
      setTeams(
        ((t || []) as any[]).map((team) => {
          const mine = links.filter((l) => l.teamId === team.id);
          const series = new Map<string, string>();
          for (const l of mine) if (l.seriesId) series.set(l.seriesId, l.seriesShort || "");
          return {
            id: team.id,
            name: team.full_name,
            shortName: team.short_name,
            nationality: team.nationality,
            series: [...series.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)),
            cars: uniqSorted(mine.map((l) => l.carId)).map((id) => ({ id, label: carLabel[id] || "Unknown car" })),
            years: uniqSorted(mine.map((l) => l.year), (a, b) => b - a),
          };
        }),
      );
    });
  }, []);

  const seriesOptions = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    for (const t of teams || []) for (const s of t.series) m.set(s.id, { label: s.label, n: (m.get(s.id)?.n || 0) + 1 });
    return [...m.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [teams]);

  const filtered = useMemo(() => {
    let list = teams || [];
    if (seriesFilter !== "all") list = list.filter((t) => t.series.some((s) => s.id === seriesFilter));
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.shortName || "").toLowerCase().includes(q) ||
          t.cars.some((c) => c.label.toLowerCase().includes(q)),
      );
    return list;
  }, [teams, search, seriesFilter]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Teams" description="Every team in the database, with the series they race in and the cars they run." canonical="/teams" />
      <Header />
      <PageHeader
        kicker="Directory"
        title="Teams"
        meta={
          teams && (
            <>
              <span>
                <span className="num text-foreground">{teams.length}</span> teams
              </span>
              <span>
                <span className="num text-foreground">{seriesOptions.length}</span> series
              </span>
            </>
          )
        }
      />

      <main className="container py-8">
        <Toolbar>
          <FilterInput value={search} onChange={setSearch} placeholder="Filter by team or car…" className="flex-1" />
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
          {!teams ? (
            <RowsSkeleton rows={10} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No teams found">{search ? <>Nothing matches “{search}”.</> : "Try another series."}</EmptyState>
          ) : (
            <>
              <div className="mb-2 flex justify-end">
                <Count n={filtered.length} label={filtered.length === 1 ? "team" : "teams"} />
              </div>
              <div className="overflow-hidden rounded border bg-card">
                <table className="data-table table-fixed">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th className="hidden w-40 md:table-cell">Series</th>
                      <th className="hidden lg:table-cell">Cars</th>
                      <th className="w-28 text-right sm:w-32">Seasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => (
                      <tr key={t.id} className="group">
                        <td className="py-2">
                          <Link to={`/team/${t.id}`} className="flex min-w-0 items-center gap-2 font-medium text-foreground group-hover:text-primary">
                            {t.nationality && <FlagImage nationality={t.nationality} size={16} />}
                            <span className="truncate">{t.name}</span>
                          </Link>
                          {(t.series.length > 0 || t.cars.length > 0) && (
                            <div className="mt-0.5 truncate text-xs text-muted-foreground lg:hidden">
                              <span className="md:hidden">{t.series.map((s) => s.label).join(", ")}</span>
                              {t.series.length > 0 && t.cars.length > 0 && <span className="md:hidden"> · </span>}
                              {t.cars.map((c) => c.label).join(", ")}
                            </div>
                          )}
                        </td>
                        <td className="hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {t.series.length ? (
                              t.series.map((s) => (
                                <Link key={s.id} to={`/series/${s.id}`} className="label-caps rounded-sm border px-1.5 py-0.5 hover:border-foreground/30 hover:text-foreground">
                                  {s.label}
                                </Link>
                              ))
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className="hidden truncate text-muted-foreground lg:table-cell">
                          {t.cars.length
                            ? t.cars.map((c, i) => (
                                <span key={c.id}>
                                  {i > 0 && ", "}
                                  <Link to={`/car/${c.id}`} className="hover:text-foreground">
                                    {c.label}
                                  </Link>
                                </span>
                              ))
                            : "—"}
                        </td>
                        <td className="num whitespace-nowrap text-right text-xs text-muted-foreground">{t.years.length ? t.years.join(" · ") : "—"}</td>
                      </tr>
                    ))}
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

export default TeamsPage;
