/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { pgQuote, cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FlagImage from "@/components/FlagImage";
import SEOHead from "@/components/SEOHead";
import { EmptyState, FilterInput, PageHeader, RowsSkeleton } from "@/components/tr/primitives";
import { Count, Segmented } from "@/components/browse/Segmented";
import { formatDateRange } from "@/lib/date-utils";
import { computeTrackMetrics, categoryHexColor } from "@/lib/track-calculations";
import { getCountryCode } from "@/lib/countries";

type ResultType = "driver" | "team" | "event" | "series" | "circuit" | "car";
type FilterVal = "all" | ResultType;

type ResultItem = {
  type: ResultType;
  id: string;
  label: string;
  url: string;
  subtitle?: string;
  nationality?: string | null;
  tags?: { label: string; color: string }[];
};

type CircuitRow = {
  id: string;
  name: string;
  location: string | null;
  country: string | null;
  lengthKm: number | null;
  turns: number | null;
  character: string | null;
  events: number;
};

const typeFilter: { value: FilterVal; label: string; plural: string; tab?: string }[] = [
  { value: "all", label: "All", plural: "Results" },
  { value: "driver", label: "Drivers", plural: "Drivers", tab: "drivers" },
  { value: "team", label: "Teams", plural: "Teams", tab: "teams" },
  { value: "event", label: "Events", plural: "Events", tab: "events" },
  { value: "series", label: "Series", plural: "Series", tab: "series" },
  { value: "circuit", label: "Circuits", plural: "Circuits", tab: "circuits" },
  { value: "car", label: "Cars", plural: "Cars", tab: "cars" },
];
const tabToType = (tab: string | null): FilterVal => typeFilter.find((t) => t.tab && t.tab === tab)?.value ?? "all";

const surname = (full: string) => {
  const parts = full.trim().split(/\s+/);
  // Keep particles with the surname: "van der Zande", "De Angelis"
  let i = parts.length - 1;
  while (i > 1 && /^(van|von|der|de|da|di|del|le|la)$/i.test(parts[i - 1])) i--;
  return parts.slice(i).join(" ");
};
const sortKey = (full: string) => surname(full).toLowerCase();

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab");
  const typeFilterVal = tabToType(tab);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [drivers, setDrivers] = useState<ResultItem[] | null>(null);
  const [circuits, setCircuits] = useState<CircuitRow[] | null>(null);
  const letterRefs = useRef<Record<string, HTMLElement | null>>({});

  const updateParams = (next: { q?: string; type?: FilterVal }) => {
    const q = next.q ?? search;
    const type = next.type ?? typeFilterVal;
    const p: Record<string, string> = {};
    const t = typeFilter.find((x) => x.value === type)?.tab;
    if (t) p.tab = t;
    if (q) p.q = q;
    setSearchParams(p, { replace: next.q !== undefined });
  };

  const setType = (v: FilterVal) => updateParams({ type: v });

  // Directory data for the Drivers / Circuits tabs
  useEffect(() => {
    if (typeFilterVal === "driver" && !drivers) {
      supabase
        .from("v2_drivers")
        .select("id, full_name, nationality")
        .order("full_name")
        .limit(2000)
        .then(({ data }) =>
          setDrivers(
            ((data || []) as any[])
              .map((d) => ({ type: "driver" as const, id: d.id, label: d.full_name, url: `/driver/${d.id}`, nationality: d.nationality }))
              .sort((a, b) => sortKey(a.label).localeCompare(sortKey(b.label)) || a.label.localeCompare(b.label)),
          ),
        );
    }
    if (typeFilterVal === "circuit" && !circuits) {
      Promise.all([
        supabase.from("v2_circuits").select("id, name, country, location").order("name").limit(1000),
        supabase
          .from("v2_circuit_layouts")
          .select("circuit_id, length_km, turns, total_straight_length_km, total_elevation_change_m, heavy_braking_corners, sort_order")
          .order("sort_order")
          .limit(2000),
        supabase.from("v2_events").select("circuit_id").eq("status", "published" as any).limit(2000),
      ]).then(([{ data: cs }, { data: ls }, { data: es }]) => {
        const layout: Record<string, any> = {};
        for (const l of (ls || []) as any[]) if (!layout[l.circuit_id]) layout[l.circuit_id] = l;
        const evCount: Record<string, number> = {};
        for (const e of (es || []) as any[]) if (e.circuit_id) evCount[e.circuit_id] = (evCount[e.circuit_id] || 0) + 1;
        setCircuits(
          ((cs || []) as any[]).map((c) => {
            const l = layout[c.id];
            const m = l
              ? computeTrackMetrics(
                  l.length_km,
                  l.turns,
                  l.total_straight_length_km,
                  l.total_elevation_change_m,
                  l.heavy_braking_corners,
                )
              : null;
            return {
              id: c.id,
              name: c.name,
              location: c.location,
              country: c.country,
              lengthKm: l?.length_km != null ? Number(l.length_km) : null,
              turns: l?.turns ?? null,
              character: m?.tcsCategory ?? null,
              events: evCount[c.id] || 0,
            };
          }),
        );
      });
    }
  }, [typeFilterVal, drivers, circuits]);

  // Keep the input in sync when ?q= changes from outside (command palette, back button)
  useEffect(() => {
    const q = searchParams.get("q") || "";
    if (q !== search) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);

    const timer = setTimeout(async () => {
      const items: ResultItem[] = [];
      const shouldSearch = (type: string) => typeFilterVal === "all" || typeFilterVal === type;

      // Resolve aliases
      const { data: aliases } = await supabase.from("search_aliases").select("alias, canonical, entity_type").ilike("alias", `%${search}%`);
      const searchTerms = [search];
      if (aliases) for (const a of aliases) searchTerms.push(a.canonical);

      const promises: Promise<void>[] = [];

      if (shouldSearch("driver")) {
        promises.push(
          (async () => {
            const existing = new Set<string>();
            for (const term of searchTerms) {
              const { data } = await supabase
                .from("v2_drivers")
                .select("id, full_name, nationality, short_name")
                .or(`full_name.ilike.${pgQuote(`%${term}%`)},nationality.ilike.${pgQuote(`%${term}%`)},short_name.ilike.${pgQuote(`%${term}%`)}`)
                .limit(20);
              (data || []).forEach((d: any) => {
                if (!existing.has(d.id)) {
                  items.push({ type: "driver", id: d.id, label: d.full_name, url: `/driver/${d.id}`, nationality: d.nationality });
                  existing.add(d.id);
                }
              });
            }
          })(),
        );
      }

      if (shouldSearch("team")) {
        promises.push(
          (async () => {
            const existing = new Set<string>();
            for (const term of searchTerms) {
              const { data } = await supabase
                .from("v2_teams")
                .select("id, full_name, nationality, short_name")
                .or(`full_name.ilike.${pgQuote(`%${term}%`)},nationality.ilike.${pgQuote(`%${term}%`)},short_name.ilike.${pgQuote(`%${term}%`)}`)
                .limit(20);
              (data || []).forEach((t: any) => {
                if (!existing.has(t.id)) {
                  items.push({ type: "team", id: t.id, label: t.full_name, url: `/team/${t.id}`, nationality: t.nationality });
                  existing.add(t.id);
                }
              });
            }
          })(),
        );
      }

      if (shouldSearch("event")) {
        promises.push(
          (async () => {
            const existing = new Set<string>();
            for (const term of searchTerms) {
              const { data } = await supabase
                .from("v2_events")
                .select("id, name, start_date, end_date, status, v2_seasons(year, v2_series(name)), v2_circuits(name, country)")
                .or(`name.ilike.${pgQuote(`%${term}%`)}`)
                .eq("status", "published" as any)
                .limit(30);
              // Also search by circuit name/country
              const { data: data2 } = await supabase
                .from("v2_events")
                .select("id, name, start_date, end_date, status, v2_seasons(year, v2_series(name)), v2_circuits!inner(name, country)")
                .or(`name.ilike.${pgQuote(`%${term}%`)},country.ilike.${pgQuote(`%${term}%`)}`, { referencedTable: "v2_circuits" })
                .eq("status", "published" as any)
                .limit(20);
              for (const e of [...(data || []), ...(data2 || [])]) {
                if (!existing.has(e.id)) {
                  const dateStr = e.start_date ? formatDateRange(e.start_date, e.end_date) : "";
                  items.push({
                    type: "event",
                    id: e.id,
                    label: e.name,
                    url: `/events/${e.id}`,
                    subtitle: `${(e as any).v2_seasons?.v2_series?.name || ""} · ${dateStr || (e as any).v2_seasons?.year || ""}`,
                    nationality: (e as any).v2_circuits?.country,
                  });
                  existing.add(e.id);
                }
              }
            }
          })(),
        );
      }

      if (shouldSearch("series")) {
        promises.push(
          (async () => {
            const existing = new Set<string>();
            for (const term of searchTerms) {
              const { data } = await supabase
                .from("v2_series")
                .select("id, name, short_name")
                .or(`name.ilike.${pgQuote(`%${term}%`)},short_name.ilike.${pgQuote(`%${term}%`)}`)
                .limit(20);
              (data || []).forEach((s: any) => {
                if (!existing.has(s.id)) {
                  items.push({ type: "series", id: s.id, label: s.name, url: `/series/${s.id}`, subtitle: s.short_name });
                  existing.add(s.id);
                }
              });
            }
          })(),
        );
      }

      if (shouldSearch("circuit")) {
        promises.push(
          (async () => {
            const existing = new Set<string>();
            for (const term of searchTerms) {
              const { data } = await supabase
                .from("v2_circuits")
                .select("id, name, country, location")
                .or(`name.ilike.${pgQuote(`%${term}%`)},country.ilike.${pgQuote(`%${term}%`)},location.ilike.${pgQuote(`%${term}%`)}`)
                .limit(20);
              if (!data) continue;
              const circuitIds = data.map((c: any) => c.id);
              const { data: layoutData } =
                circuitIds.length > 0
                  ? await supabase
                      .from("v2_circuit_layouts")
                      .select("circuit_id, length_km, turns, total_straight_length_km, total_elevation_change_m, heavy_braking_corners")
                      .in("circuit_id", circuitIds)
                      .order("sort_order")
                      .limit(100)
                  : { data: [] };
              const layoutMap: Record<string, any> = {};
              (layoutData || []).forEach((l: any) => {
                if (!layoutMap[l.circuit_id]) layoutMap[l.circuit_id] = l;
              });

              data.forEach((c: any) => {
                if (!existing.has(c.id)) {
                  const l = layoutMap[c.id];
                  const tags: { label: string; color: string }[] = [];
                  if (l) {
                    const m = computeTrackMetrics(
                      l.length_km,
                      l.turns,
                      l.total_straight_length_km,
                      l.total_elevation_change_m,
                      l.heavy_braking_corners,
                    );
                    for (const cat of [m.tcsCategory, m.eiCategory, m.csiCategory, m.tdiCategory]) if (cat) tags.push({ label: cat, color: categoryHexColor(cat) });
                  }
                  items.push({
                    type: "circuit",
                    id: c.id,
                    label: c.name,
                    url: `/circuit/${c.id}`,
                    subtitle: [c.location, c.country].filter(Boolean).join(", "),
                    nationality: c.country,
                    tags,
                  });
                  existing.add(c.id);
                }
              });
            }
          })(),
        );
      }

      if (shouldSearch("car")) {
        promises.push(
          (async () => {
            const existing = new Set<string>();
            for (const term of searchTerms) {
              const { data } = await supabase
                .from("v2_cars")
                .select("id, model_name, manufacturer")
                .or(`model_name.ilike.${pgQuote(`%${term}%`)},manufacturer.ilike.${pgQuote(`%${term}%`)}`)
                .limit(20);
              (data || []).forEach((c: any) => {
                if (!existing.has(c.id)) {
                  items.push({ type: "car", id: c.id, label: [c.manufacturer, c.model_name].filter(Boolean).join(" "), url: `/car/${c.id}`, subtitle: c.manufacturer });
                  existing.add(c.id);
                }
              });
            }
          })(),
        );
      }

      await Promise.all(promises);

      setResults(items);
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, typeFilterVal]);

  /* Results grouped by type, in tab order */
  const grouped = useMemo(() => {
    const order = typeFilter.map((t) => t.value);
    const m = new Map<ResultType, ResultItem[]>();
    for (const r of results) {
      if (!m.has(r.type)) m.set(r.type, []);
      m.get(r.type)!.push(r);
    }
    return [...m.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [results]);

  const driverLetters = useMemo(() => {
    const m = new Map<string, ResultItem[]>();
    for (const d of drivers || []) {
      const ch = sortKey(d.label).charAt(0).toUpperCase();
      const k = /[A-Z]/.test(ch) ? ch : "#";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d);
    }
    return [...m.entries()];
  }, [drivers]);

  const isDirectory = !search.trim() && (typeFilterVal === "driver" || typeFilterVal === "circuit");
  const meta = typeFilter.find((t) => t.value === typeFilterVal)!;
  const pageTitle = typeFilterVal === "driver" ? "Drivers" : typeFilterVal === "circuit" ? "Circuits" : "Search";
  const kicker = typeFilterVal === "driver" || typeFilterVal === "circuit" ? "Directory" : "Database";

  const headerMeta =
    typeFilterVal === "driver" && drivers ? (
      <span>
        <span className="num text-foreground">{drivers.length}</span> drivers ·{" "}
        <span className="num text-foreground">{new Set(drivers.map((d) => getCountryCode(d.nationality)).filter(Boolean)).size}</span> nationalities
      </span>
    ) : typeFilterVal === "circuit" && circuits ? (
      <span>
        <span className="num text-foreground">{circuits.length}</span> circuits ·{" "}
        <span className="num text-foreground">{new Set(circuits.map((c) => c.country).filter(Boolean)).size}</span> countries
      </span>
    ) : (
      <span>Drivers, teams, events, series, circuits and cars.</span>
    );

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={pageTitle}
        description={
          typeFilterVal === "driver"
            ? "Every driver in the database, A–Z by surname."
            : typeFilterVal === "circuit"
              ? "Every circuit in the database with layout length, turns and character."
              : "Search across drivers, teams, events, series, circuits, and cars."
        }
        canonical={meta.tab ? `/search?tab=${meta.tab}` : "/search"}
      />
      <Header />
      <PageHeader kicker={kicker} title={pageTitle} meta={headerMeta} />

      <main className="container py-8">
        <div className="flex flex-col gap-3">
          <FilterInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              updateParams({ q: v });
            }}
            placeholder={
              typeFilterVal === "driver"
                ? "Search drivers by name or nationality…"
                : typeFilterVal === "circuit"
                  ? "Search circuits by name, location or country…"
                  : "Search everything…"
            }
          />
          <div className="flex items-center justify-between gap-3">
            <Segmented label="Type" value={typeFilterVal} onChange={setType} options={typeFilter.map((t) => ({ value: t.value, label: t.label }))} />
            {search.trim() && !loading && <Count n={results.length} label={results.length === 1 ? "match" : "matches"} className="hidden sm:inline" />}
          </div>
        </div>

        <div className="mt-6">
          {isDirectory && typeFilterVal === "driver" ? (
            !drivers ? (
              <RowsSkeleton rows={10} />
            ) : (
              <>
                {/* A–Z jump bar */}
                <div className="mb-4 flex flex-wrap gap-px overflow-hidden rounded border bg-border">
                  {driverLetters.map(([l]) => (
                    <button
                      key={l}
                      onClick={() => letterRefs.current[l]?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="h-8 min-w-[2rem] flex-1 bg-card font-display text-sm font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="space-y-6">
                  {driverLetters.map(([letter, list]) => (
                    <section key={letter} ref={(el) => (letterRefs.current[letter] = el)} className="scroll-mt-20">
                      <div className="mb-2 flex items-end justify-between border-b pb-1.5">
                        <h2 className="font-accent text-2xl leading-none text-foreground">{letter}</h2>
                        <Count n={list.length} label={list.length === 1 ? "driver" : "drivers"} />
                      </div>
                      {/* Cells draw right/bottom rules; the negative margin tucks the outer ones under the frame */}
                      <div className="overflow-hidden rounded border bg-card">
                        <div className="-mb-px -mr-px grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {list.map((d) => (
                            <DriverCell key={d.id} d={d} />
                          ))}
                        </div>
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )
          ) : isDirectory && typeFilterVal === "circuit" ? (
            !circuits ? (
              <RowsSkeleton rows={10} />
            ) : (
              <CircuitTable circuits={circuits} />
            )
          ) : !search.trim() ? (
            <EmptyState title={`Search ${meta.value === "all" ? "the database" : meta.plural.toLowerCase()}`}>
              Type a name, nationality, circuit or country. Tip: press <kbd className="rounded-sm border bg-muted px-1 font-mono text-[11px]">/</kbd> anywhere to
              open quick search.
            </EmptyState>
          ) : loading ? (
            <RowsSkeleton rows={6} />
          ) : results.length === 0 ? (
            <EmptyState title="No matches">Nothing found for “{search}”.</EmptyState>
          ) : (
            <div className="space-y-8">
              {grouped.map(([type, list]) => {
                const t = typeFilter.find((x) => x.value === type)!;
                return (
                  <section key={type}>
                    <div className="mb-2 flex items-end justify-between border-b pb-1.5">
                      <h2 className="font-display text-lg font-bold uppercase tracking-wide">{t.plural}</h2>
                      <Count n={list.length} label={list.length === 1 ? "match" : "matches"} />
                    </div>
                    <div className="grid gap-px overflow-hidden rounded border bg-border">
                      {list.map((r) => (
                        <ResultRow key={`${r.type}-${r.id}`} r={r} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

function DriverCell({ d }: { d: ResultItem }) {
  const sn = surname(d.label);
  const first = d.label.slice(0, d.label.length - sn.length).trim();
  const code = getCountryCode(d.nationality);
  return (
    <Link to={d.url} className="group flex min-w-0 items-center gap-2.5 border-b border-r px-3 py-2.5 transition-colors hover:bg-accent/60">
      <span className="flex w-5 shrink-0 justify-center">
        <FlagImage nationality={d.nationality} size={18} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        {first && <span className="text-muted-foreground group-hover:text-foreground">{first} </span>}
        <span className="font-semibold uppercase tracking-wide text-foreground group-hover:text-primary">{sn}</span>
      </span>
      {code && <span className="num shrink-0 text-[11px] text-muted-foreground">{code}</span>}
    </Link>
  );
}

function CircuitTable({ circuits }: { circuits: CircuitRow[] }) {
  return (
    <div className="overflow-hidden rounded border bg-card">
      <table className="data-table table-fixed">
        <thead>
          <tr>
            <th>Circuit</th>
            <th className="hidden md:table-cell">Location</th>
            <th className="hidden w-44 lg:table-cell">Character</th>
            <th className="w-20 text-right">Length</th>
            <th className="hidden w-16 text-right sm:table-cell">Turns</th>
            <th className="w-16 text-right">Events</th>
          </tr>
        </thead>
        <tbody>
          {circuits.map((c) => (
            <tr key={c.id} className="group">
              <td className="py-2">
                <Link to={`/circuit/${c.id}`} className="flex min-w-0 items-center gap-2 font-medium text-foreground group-hover:text-primary">
                  <span className="flex w-5 shrink-0 justify-center">
                    <FlagImage nationality={c.country} size={18} />
                  </span>
                  <span className="min-w-0 leading-snug">{c.name}</span>
                </Link>
                <div className="truncate pl-7 text-xs text-muted-foreground md:hidden">{[c.location, c.country].filter(Boolean).join(", ")}</div>
              </td>
              <td className="hidden truncate text-muted-foreground md:table-cell">{[c.location, c.country].filter(Boolean).join(", ") || "—"}</td>
              <td className="hidden lg:table-cell">
                {c.character ? (
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryHexColor(c.character) }} />
                    {c.character}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="num text-right">
                {c.lengthKm != null ? (
                  <>
                    {c.lengthKm.toFixed(3)}
                    <span className="ml-0.5 text-[10px] text-muted-foreground">km</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="num hidden text-right sm:table-cell">{c.turns ?? <span className="text-muted-foreground">—</span>}</td>
              <td className={cn("num text-right", c.events ? "text-foreground" : "text-muted-foreground")}>{c.events || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultRow({ r }: { r: ResultItem }) {
  return (
    <Link to={r.url} className="group flex min-w-0 items-center gap-3 bg-card px-4 py-3 transition-colors hover:bg-accent/60">
      {(r.type === "driver" || r.type === "circuit" || r.type === "event" || r.nationality) && (
        <span className="flex w-5 shrink-0 justify-center">
          <FlagImage nationality={r.nationality} size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground group-hover:text-primary">{r.label}</div>
        {(r.subtitle || (r.tags && r.tags.length > 0)) && (
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {r.subtitle && <span className="truncate">{r.subtitle}</span>}
            {r.tags?.map((t) => (
              <span key={t.label} className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                {t.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

export default SearchPage;
