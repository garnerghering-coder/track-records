import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search as SearchIcon, CheckCircle, Trophy } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getFlagForCountry } from "@/lib/countries";

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

const categoryLabels: Record<string, string> = Object.fromEntries(
  categoryOptions.filter(c => c.value !== "all").map(c => [c.value, c.label])
);

interface ResultRow {
  id: string;
  event_name: string | null;
  series_name: string;
  season_year: number;
  category: string | null;
  finishing_position: number | null;
  championship_position: number | null;
  notes: string | null;
  verification_status: string;
  driver_profiles: {
    id: string;
    first_name: string;
    last_name: string;
    nationality: string | null;
    photo_url: string | null;
    primary_category: string | null;
  };
}

const ResultsPage = () => {
  const [results, setResults] = useState<ResultRow[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [yearFilter, setYearFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);

      let query = supabase
        .from("race_results")
        .select("id, event_name, series_name, season_year, category, finishing_position, championship_position, notes, verification_status, driver_profiles(id, first_name, last_name, nationality, photo_url, primary_category)")
        .order("season_year", { ascending: false })
        .order("created_at", { ascending: false });

      if (category !== "all") {
        query = query.eq("category", category as any);
      }
      if (yearFilter) {
        query = query.eq("season_year", parseInt(yearFilter));
      }

      const { data } = await query.limit(200);

      let filtered = (data as unknown as ResultRow[]) ?? [];

      // Client-side filter by driver name or event/series name
      if (search) {
        const lower = search.toLowerCase();
        filtered = filtered.filter(r => {
          const driverName = `${r.driver_profiles.first_name} ${r.driver_profiles.last_name}`.toLowerCase();
          const event = (r.event_name || "").toLowerCase();
          const series = r.series_name.toLowerCase();
          return driverName.includes(lower) || event.includes(lower) || series.includes(lower);
        });
      }

      setResults(filtered);
      setLoading(false);
    };

    const debounce = setTimeout(fetchResults, 300);
    return () => clearTimeout(debounce);
  }, [search, category, yearFilter]);

  // Group by event
  const grouped = results.reduce<Record<string, ResultRow[]>>((acc, r) => {
    const key = `${r.season_year}|${r.series_name}|${r.event_name || ""}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const groupKeys = Object.keys(grouped);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section
        className="pt-24 pb-10"
        style={{ background: "linear-gradient(135deg, hsl(220 20% 8%) 0%, hsl(220 25% 14%) 100%)" }}
      >
        <div className="container">
          <h1 className="font-display text-3xl font-bold sm:text-4xl" style={{ color: "hsl(0 0% 100%)" }}>
            Race Results
          </h1>
          <p className="mt-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            Search race results by driver name, event, series, category, or year.
          </p>
        </div>
      </section>

      <div className="container py-8">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-8">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by driver, event, or series…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Year…"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            type="number"
            className="w-full sm:w-[120px]"
          />
        </div>

        {/* Results */}
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading results…</p>
        ) : groupKeys.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No race results found matching your criteria.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupKeys.map(key => {
              const entries = grouped[key];
              const first = entries[0];
              const catLabel = first.category ? (categoryLabels[first.category] || first.category) : "";
              // Sort by finishing position
              const sorted = [...entries].sort((a, b) => (a.finishing_position ?? 999) - (b.finishing_position ?? 999));

              return (
                <div key={key} className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="px-5 py-4 border-b border-border bg-muted/30">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Trophy className="h-5 w-5 text-primary shrink-0" />
                      <h2 className="font-display text-lg font-semibold text-card-foreground">
                        {first.event_name || first.series_name}
                      </h2>
                      {first.event_name && (
                        <span className="text-sm text-muted-foreground">• {first.series_name}</span>
                      )}
                      <span className="text-sm text-muted-foreground">• {first.season_year}</span>
                      {catLabel && (
                        <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5">{catLabel}</span>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-border/50">
                    {sorted.map(r => {
                      const flag = getFlagForCountry(r.driver_profiles.nationality);
                      return (
                        <Link
                          key={r.id}
                          to={`/driver/${r.driver_profiles.id}`}
                          className="flex items-center gap-4 px-5 py-3 hover:bg-muted/30 transition-colors"
                        >
                          <div className="w-8 text-center shrink-0">
                            {r.finishing_position != null ? (
                              <span className={`font-display text-lg font-bold ${r.finishing_position === 1 ? "text-primary" : "text-card-foreground"}`}>
                                {r.finishing_position}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {r.driver_profiles.photo_url ? (
                              <img src={r.driver_profiles.photo_url} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                                {r.driver_profiles.first_name[0]}{r.driver_profiles.last_name[0]}
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-card-foreground">
                                {flag && <span className="mr-1">{flag}</span>}
                                {r.driver_profiles.first_name} {r.driver_profiles.last_name}
                              </span>
                            </div>
                          </div>
                          {r.championship_position != null && (
                            <span className="text-xs text-muted-foreground shrink-0">Champ P{r.championship_position}</span>
                          )}
                          {r.verification_status === "verified" && (
                            <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                          )}
                          {r.notes && (
                            <span className="text-xs text-muted-foreground truncate max-w-[140px] hidden sm:block">{r.notes}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default ResultsPage;
