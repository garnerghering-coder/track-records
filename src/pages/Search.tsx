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

const categoryOptions = [
  { value: "all", label: "All Categories" },
  { value: "karting", label: "Karting" },
  { value: "single_seater", label: "Single Seater" },
  { value: "gt", label: "GT" },
  { value: "touring_car", label: "Touring Car" },
  { value: "sports_car", label: "Sports Car" },
  { value: "rally", label: "Rally" },
  { value: "endurance", label: "Endurance" },
  { value: "formula", label: "Formula" },
  { value: "stock_car", label: "Stock Car" },
  { value: "other", label: "Other" },
];

const categoryLabels: Record<string, string> = Object.fromEntries(categoryOptions.filter(c => c.value !== "all").map(c => [c.value, c.label]));

type ResultItem = {
  type: "driver" | "team" | "event" | "series" | "circuit" | "car";
  id: string;
  label: string;
  url: string;
  subtitle?: string;
  nationality?: string | null;
  category?: string | null;
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
  const [category, setCategory] = useState("all");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [allDrivers, setAllDrivers] = useState<ResultItem[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);

  // If arriving at /search?tab=drivers with no query, load all drivers
  useEffect(() => {
    if (initialTab === "drivers" && !search.trim()) {
      setDriversLoading(true);
      supabase.from("driver_profiles").select("id, first_name, last_name, nationality, primary_category")
        .order("last_name").limit(500).then(({ data }) => {
          setAllDrivers((data || []).map((d: any) => ({
            type: "driver" as const, id: d.id, label: `${d.first_name} ${d.last_name}`,
            url: `/driver/${d.id}`, nationality: d.nationality, category: d.primary_category,
          })));
          setDriversLoading(false);
        });
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

      // 1. Resolve aliases first
      const { data: aliases } = await supabase
        .from("search_aliases")
        .select("alias, canonical, entity_type")
        .ilike("alias", `%${search}%`);

      // Build expanded search terms - original + all canonical expansions
      const searchTerms = [search];
      const aliasCanonicals = new Set<string>();
      if (aliases && aliases.length > 0) {
        for (const a of aliases) {
          searchTerms.push(a.canonical);
          aliasCanonicals.add(a.canonical.toLowerCase());
        }
      }

      const promises: Promise<void>[] = [];

      if (shouldSearch("driver")) {
        promises.push((async () => {
          for (const term of searchTerms) {
            const lower = `%${term}%`;
            let q = supabase.from("driver_profiles").select("id, first_name, last_name, nationality, primary_category")
              .or(`first_name.ilike.${lower},last_name.ilike.${lower}`).limit(20);
            if (category !== "all") q = q.eq("primary_category", category as any);
            const { data } = await q;
            const existing = new Set(items.filter(i => i.type === "driver").map(i => i.id));
            (data || []).forEach((d: any) => {
              if (!existing.has(d.id)) {
                items.push({
                  type: "driver", id: d.id, label: `${d.first_name} ${d.last_name}`,
                  url: `/driver/${d.id}`, nationality: d.nationality, category: d.primary_category,
                });
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
            const lower = `%${term}%`;
            let q = supabase.from("team_profiles").select("id, name, nationality, primary_category")
              .ilike("name", lower).limit(20);
            if (category !== "all") q = q.eq("primary_category", category as any);
            const { data } = await q;
            (data || []).forEach((t: any) => {
              if (!existing.has(t.id)) {
                items.push({ type: "team", id: t.id, label: t.name, url: `/team/${t.id}`, nationality: t.nationality, category: t.primary_category });
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
            const lower = `%${term}%`;
            let q = supabase.from("race_events").select("id, event_name, series_name, season_year, category, location, event_date")
              .or(`event_name.ilike.${lower},series_name.ilike.${lower},location.ilike.${lower}`).limit(30);
            if (category !== "all") q = q.eq("category", category as any);
            const { data } = await q;
            (data || []).forEach((e: any) => {
              if (!existing.has(e.id)) {
                const dateStr = e.event_date ? new Date(e.event_date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
                items.push({
                  type: "event", id: e.id, label: e.event_name,
                  url: `/event/${e.id}`, subtitle: `${e.series_name} · ${dateStr || e.season_year}`,
                  category: e.category,
                });
                existing.add(e.id);
              }
            });
          }
        })());
      }

      if (shouldSearch("series")) {
        promises.push((async () => {
          const existing = new Set<string>();
          for (const term of searchTerms) {
            const lower = `%${term}%`;
            let q = supabase.from("series").select("id, name, category, description").ilike("name", lower).limit(20);
            if (category !== "all") q = q.eq("category", category as any);
            const { data } = await q;
            (data || []).forEach((s: any) => {
              if (!existing.has(s.id)) {
                items.push({ type: "series", id: s.id, label: s.name, url: `/series/${s.id}`, category: s.category, subtitle: s.description?.substring(0, 80) });
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
            const lower = `%${term}%`;
            const { data } = await supabase.from("circuits").select("id, name, country, location")
              .or(`name.ilike.${lower},country.ilike.${lower},location.ilike.${lower}`).limit(20);
            (data || []).forEach((c: any) => {
              if (!existing.has(c.id)) {
                items.push({ type: "circuit", id: c.id, label: c.name, url: `/circuit/${c.id}`, subtitle: [c.location, c.country].filter(Boolean).join(", ") });
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
            const lower = `%${term}%`;
            const { data } = await supabase.from("car_models").select("id, name, manufacturer, category")
              .or(`name.ilike.${lower},manufacturer.ilike.${lower}`).limit(20);
            (data || []).forEach((c: any) => {
              if (!existing.has(c.id)) {
                items.push({ type: "car", id: c.id, label: c.name, url: `/car/${c.id}`, subtitle: c.manufacturer, category: c.category });
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
  }, [search, typeFilterVal, category]);

  return (
    <div className="min-h-screen bg-background">
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
              placeholder="Search everything… (try F1, WEC, Le Mans)"
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
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categoryOptions.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {!search.trim() && typeFilterVal === "driver" && allDrivers.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-4">{allDrivers.length} drivers</p>
            {allDrivers.filter(d => category === "all" || d.category === category).map(r => (
              <Link key={`${r.type}-${r.id}`} to={r.url} className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-all">
                <Badge variant="secondary" className="text-xs uppercase shrink-0 w-16 justify-center">{r.type}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {r.nationality && <FlagImage nationality={r.nationality} size={14} />}
                    <span className="font-display text-sm font-semibold text-card-foreground truncate">{r.label}</span>
                  </div>
                </div>
                {r.category && <span className="text-xs text-muted-foreground shrink-0">{categoryLabels[r.category] || r.category}</span>}
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
                </div>
                {r.category && <span className="text-xs text-muted-foreground shrink-0">{categoryLabels[r.category] || r.category}</span>}
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
