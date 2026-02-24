import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search as SearchIcon, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FlagImage from "@/components/FlagImage";
import SEOHead from "@/components/SEOHead";
import { formatDateRange } from "@/lib/date-utils";
import { computeTrackMetrics, categoryColor } from "@/lib/track-calculations";

type ResultItem = {
  type: "driver" | "team" | "event" | "series" | "circuit" | "car";
  id: string;
  label: string;
  url: string;
  subtitle?: string;
  nationality?: string | null;
  tags?: { label: string; color: string }[];
};

const typeFilter = [
  { value: "all", label: "All Types" },
  { value: "driver", label: "Drivers" },
  { value: "team", label: "Teams" },
  { value: "event", label: "Events" },
  { value: "series", label: "Series" },
  { value: "circuit", label: "Circuits" },
  { value: "car", label: "Cars" },
];

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [typeFilterVal, setTypeFilterVal] = useState(initialTab === "drivers" ? "driver" : "all");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [allDrivers, setAllDrivers] = useState<ResultItem[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);

  // Load all drivers when tab=drivers with no query
  useEffect(() => {
    if (initialTab === "drivers" && !search.trim()) {
      setDriversLoading(true);
      (async () => {
        const { data } = await supabase.from("v2_drivers").select("id, full_name, nationality")
          .order("full_name").limit(500);
        setAllDrivers((data || []).map((d: any) => ({
          type: "driver" as const, id: d.id, label: d.full_name,
          url: `/driver/${d.id}`, nationality: d.nationality,
        })));
        setDriversLoading(false);
      })();
    }
  }, [initialTab]);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q && q !== search) setSearch(q);
  }, [searchParams]);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    setLoading(true);

    const timer = setTimeout(async () => {
      const items: ResultItem[] = [];
      const shouldSearch = (type: string) => typeFilterVal === "all" || typeFilterVal === type;

      // Resolve aliases
      const { data: aliases } = await supabase
        .from("search_aliases").select("alias, canonical, entity_type")
        .ilike("alias", `%${search}%`);
      const searchTerms = [search];
      if (aliases) for (const a of aliases) searchTerms.push(a.canonical);

      const promises: Promise<void>[] = [];

      if (shouldSearch("driver")) {
        promises.push((async () => {
          const existing = new Set<string>();
          for (const term of searchTerms) {
            const { data } = await supabase.from("v2_drivers").select("id, full_name, nationality, short_name")
              .or(`full_name.ilike.%${term}%,nationality.ilike.%${term}%,short_name.ilike.%${term}%`).limit(20);
            (data || []).forEach((d: any) => {
              if (!existing.has(d.id)) {
                items.push({ type: "driver", id: d.id, label: d.full_name, url: `/driver/${d.id}`, nationality: d.nationality });
                existing.add(d.id);
              }
            });
          }
        })());
      }

      if (shouldSearch("team")) {
        promises.push((async () => {
          const existing = new Set<string>();
          for (const term of searchTerms) {
            const { data } = await supabase.from("v2_teams").select("id, full_name, nationality, short_name")
              .or(`full_name.ilike.%${term}%,nationality.ilike.%${term}%,short_name.ilike.%${term}%`).limit(20);
            (data || []).forEach((t: any) => {
              if (!existing.has(t.id)) {
                items.push({ type: "team", id: t.id, label: t.full_name, url: `/team/${t.id}`, nationality: t.nationality });
                existing.add(t.id);
              }
            });
          }
        })());
      }

      if (shouldSearch("event")) {
        promises.push((async () => {
          const existing = new Set<string>();
          for (const term of searchTerms) {
            const { data } = await supabase.from("v2_events")
              .select("id, name, start_date, end_date, status, v2_seasons(year, v2_series(name)), v2_circuits(name, country)")
              .or(`name.ilike.%${term}%`)
              .eq("status", "published" as any).limit(30);
            // Also search by circuit name/country
            const { data: data2 } = await supabase.from("v2_events")
              .select("id, name, start_date, end_date, status, v2_seasons(year, v2_series(name)), v2_circuits!inner(name, country)")
              .or(`name.ilike.%${term}%,country.ilike.%${term}%`, { referencedTable: "v2_circuits" })
              .eq("status", "published" as any).limit(20);
            for (const e of [...(data || []), ...(data2 || [])]) {
              if (!existing.has(e.id)) {
                const dateStr = e.start_date ? formatDateRange(e.start_date, e.end_date) : "";
                items.push({
                  type: "event", id: e.id, label: e.name,
                  url: `/events/${e.id}`, subtitle: `${(e as any).v2_seasons?.v2_series?.name || ""} · ${dateStr || (e as any).v2_seasons?.year || ""}`,
                });
                existing.add(e.id);
              }
            }
          }
        })());
      }

      if (shouldSearch("series")) {
        promises.push((async () => {
          const existing = new Set<string>();
          for (const term of searchTerms) {
            const { data } = await supabase.from("v2_series").select("id, name, short_name")
              .or(`name.ilike.%${term}%,short_name.ilike.%${term}%`).limit(20);
            (data || []).forEach((s: any) => {
              if (!existing.has(s.id)) {
                items.push({ type: "series", id: s.id, label: s.name, url: `/series/${s.id}`, subtitle: s.short_name });
                existing.add(s.id);
              }
            });
          }
        })());
      }

      if (shouldSearch("circuit")) {
        promises.push((async () => {
          const existing = new Set<string>();
          for (const term of searchTerms) {
            const { data } = await supabase.from("v2_circuits").select("id, name, country, location")
              .or(`name.ilike.%${term}%,country.ilike.%${term}%,location.ilike.%${term}%`).limit(20);
            if (!data) continue;
            const circuitIds = data.map((c: any) => c.id);
            const { data: layoutData } = circuitIds.length > 0
              ? await supabase.from("v2_circuit_layouts").select("circuit_id, length_km, turns, total_straight_length_km, total_elevation_change_m, heavy_braking_corners").in("circuit_id", circuitIds).order("sort_order").limit(100)
              : { data: [] };
            const layoutMap: Record<string, any> = {};
            (layoutData || []).forEach((l: any) => { if (!layoutMap[l.circuit_id]) layoutMap[l.circuit_id] = l; });

            data.forEach((c: any) => {
              if (!existing.has(c.id)) {
                const l = layoutMap[c.id];
                let tags: { label: string; color: string }[] = [];
                if (l) {
                  const m = computeTrackMetrics(
                    l.length_km ? Number(l.length_km) : null, l.turns,
                    l.total_straight_length_km ? Number(l.total_straight_length_km) : null,
                    l.total_elevation_change_m ? Number(l.total_elevation_change_m) : null,
                    l.heavy_braking_corners
                  );
                  if (m.tcsCategory) tags.push({ label: m.tcsCategory, color: categoryColor(m.tcsCategory) });
                  if (m.eiCategory) tags.push({ label: m.eiCategory, color: categoryColor(m.eiCategory) });
                  if (m.csiCategory) tags.push({ label: m.csiCategory, color: categoryColor(m.csiCategory) });
                  if (m.tdiCategory) tags.push({ label: m.tdiCategory, color: categoryColor(m.tdiCategory) });
                }
                items.push({ type: "circuit", id: c.id, label: c.name, url: `/circuit/${c.id}`, subtitle: [c.location, c.country].filter(Boolean).join(", "), tags });
                existing.add(c.id);
              }
            });
          }
        })());
      }

      if (shouldSearch("car")) {
        promises.push((async () => {
          const existing = new Set<string>();
          for (const term of searchTerms) {
            const { data } = await supabase.from("v2_cars").select("id, model_name, manufacturer")
              .or(`model_name.ilike.%${term}%,manufacturer.ilike.%${term}%`).limit(20);
            (data || []).forEach((c: any) => {
              if (!existing.has(c.id)) {
                items.push({ type: "car", id: c.id, label: [c.manufacturer, c.model_name].filter(Boolean).join(" "), url: `/car/${c.id}`, subtitle: c.manufacturer });
                existing.add(c.id);
              }
            });
          }
        })());
      }

      await Promise.all(promises);

      setResults(items);
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, typeFilterVal]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Search" description="Search across drivers, teams, events, series, circuits, and cars." canonical="/search" />
      <Header />
      <section className="pt-24 pb-10 bg-card border-b border-border">
        <div className="container">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
          <h1 className="font-display text-3xl font-bold text-foreground">Search</h1>
          <p className="mt-2 text-sm text-muted-foreground">Search across drivers, teams, events, series, circuits, and cars.</p>
        </div>
      </section>

      <div className="container py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-8">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search everything…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSearchParams(e.target.value ? { q: e.target.value } : {}); }}
              className="pl-10"
            />
          </div>
          <Select value={typeFilterVal} onValueChange={setTypeFilterVal}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {typeFilter.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {!search.trim() && typeFilterVal === "driver" && allDrivers.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-4">{allDrivers.length} drivers</p>
            {allDrivers.map(r => (
              <Link key={`${r.type}-${r.id}`} to={r.url} className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-all">
                <Badge variant="secondary" className="text-xs uppercase shrink-0 w-16 justify-center">{r.type}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {r.nationality && <FlagImage nationality={r.nationality} size={14} />}
                    <span className="font-display text-sm font-semibold text-card-foreground truncate">{r.label}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : !search.trim() && driversLoading ? (
          <p className="text-center text-muted-foreground py-12">Loading drivers…</p>
        ) : !search.trim() ? (
          <p className="text-center text-muted-foreground py-12">Type something to search.</p>
        ) : loading ? (
          <p className="text-center text-muted-foreground py-12">Searching…</p>
        ) : results.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No results found for "{search}".</p>
          </div>
        ) : (
          <div className="space-y-2">
            {results.map(r => (
              <Link key={`${r.type}-${r.id}`} to={r.url} className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-all">
                <Badge variant="secondary" className="text-xs uppercase shrink-0 w-16 justify-center">{r.type}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {r.nationality && <FlagImage nationality={r.nationality} size={14} />}
                    <span className="font-display text-sm font-semibold text-card-foreground truncate">{r.label}</span>
                  </div>
                  {r.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{r.subtitle}</p>}
                  {r.tags && r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {r.tags.map((t) => (
                        <span key={t.label} className={`text-xs font-semibold ${t.color}`}>{t.label}</span>
                      ))}
                    </div>
                  )}
                </div>
                
              </Link>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default SearchPage;
