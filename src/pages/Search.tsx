import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search as SearchIcon } from "lucide-react";
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
  type: "driver" | "team" | "event" | "series" | "circuit";
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
      const lower = `%${search}%`;
      const items: ResultItem[] = [];

      const shouldSearch = (type: string) => typeFilterVal === "all" || typeFilterVal === type;

      const promises: Promise<void>[] = [];

      if (shouldSearch("driver")) {
        promises.push((async () => {
          let q = supabase.from("driver_profiles").select("id, first_name, last_name, nationality, primary_category")
            .or(`first_name.ilike.${lower},last_name.ilike.${lower}`).limit(20);
          if (category !== "all") q = q.eq("primary_category", category as any);
          const { data } = await q;
          (data || []).forEach((d: any) => items.push({
            type: "driver", id: d.id, label: `${d.first_name} ${d.last_name}`,
            url: `/driver/${d.id}`, nationality: d.nationality, category: d.primary_category,
          }));
        })());
      }
      if (shouldSearch("team")) {
        promises.push((async () => {
          let q = supabase.from("team_profiles").select("id, name, nationality, primary_category")
            .ilike("name", lower).limit(20);
          if (category !== "all") q = q.eq("primary_category", category as any);
          const { data } = await q;
          (data || []).forEach((t: any) => items.push({
            type: "team", id: t.id, label: t.name,
            url: `/team/${t.id}`, nationality: t.nationality, category: t.primary_category,
          }));
        })());
      }
      if (shouldSearch("event")) {
        promises.push((async () => {
          let q = supabase.from("race_events").select("id, event_name, series_name, season_year, category, location")
            .or(`event_name.ilike.${lower},series_name.ilike.${lower},location.ilike.${lower}`).limit(30);
          if (category !== "all") q = q.eq("category", category as any);
          const { data } = await q;
          (data || []).forEach((e: any) => items.push({
            type: "event", id: e.id, label: e.event_name,
            url: `/event/${e.id}`, subtitle: `${e.series_name} · ${e.season_year}`,
            category: e.category,
          }));
        })());
      }
      if (shouldSearch("series")) {
        promises.push((async () => {
          let q = supabase.from("series").select("id, name, category").ilike("name", lower).limit(20);
          if (category !== "all") q = q.eq("category", category as any);
          const { data } = await q;
          (data || []).forEach((s: any) => items.push({
            type: "series", id: s.id, label: s.name,
            url: `/series/${s.id}`, category: s.category,
          }));
        })());
      }
      if (shouldSearch("circuit")) {
        promises.push((async () => {
          const { data } = await supabase.from("circuits").select("id, name, country, location")
            .or(`name.ilike.${lower},country.ilike.${lower},location.ilike.${lower}`).limit(20);
          (data || []).forEach((c: any) => items.push({
            type: "circuit", id: c.id, label: c.name,
            url: `/circuit/${c.id}`, subtitle: [c.location, c.country].filter(Boolean).join(", "),
          }));
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
          <h1 className="font-display text-3xl font-bold text-foreground">Search</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Search across drivers, teams, events, series, and circuits.
          </p>
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
              <Link
                key={`${r.type}-${r.id}`}
                to={r.url}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-all"
              >
                <Badge variant="secondary" className="text-xs uppercase shrink-0 w-16 justify-center">{r.type}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {r.nationality && <FlagImage nationality={r.nationality} size={14} />}
                    <span className="font-display text-sm font-semibold text-card-foreground truncate">{r.label}</span>
                  </div>
                </div>
                {r.category && (
                  <span className="text-xs text-muted-foreground shrink-0">{categoryLabels[r.category] || r.category}</span>
                )}
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
              <Link
                key={`${r.type}-${r.id}`}
                to={r.url}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-all"
              >
                <Badge variant="secondary" className="text-xs uppercase shrink-0 w-16 justify-center">{r.type}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {r.nationality && <FlagImage nationality={r.nationality} size={14} />}
                    <span className="font-display text-sm font-semibold text-card-foreground truncate">{r.label}</span>
                  </div>
                  {r.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{r.subtitle}</p>}
                </div>
                {r.category && (
                  <span className="text-xs text-muted-foreground shrink-0">{categoryLabels[r.category] || r.category}</span>
                )}
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
