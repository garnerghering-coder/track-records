import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search as SearchIcon, ArrowLeft, Trophy, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

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

const SeriesPage = () => {
  const [seriesList, setSeriesList] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSeries = async () => {
      setLoading(true);
      let query = supabase.from("series").select("*");

      if (search) {
        query = query.ilike("name", `%${search}%`);
      }
      if (category !== "all") {
        query = query.eq("category", category as any);
      }
      query = query.order("name", { ascending: true });

      const { data } = await query;
      setSeriesList(data ?? []);
      setLoading(false);
    };

    const debounce = setTimeout(fetchSeries, 300);
    return () => clearTimeout(debounce);
  }, [search, category]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section
        className="pt-24 pb-10"
        style={{ background: "linear-gradient(135deg, hsl(220 20% 8%) 0%, hsl(220 25% 14%) 100%)" }}
      >
        <div className="container">
          <Link to="/" className="inline-flex items-center gap-1 text-sm mb-4" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
          <h1 className="font-display text-3xl font-bold sm:text-4xl" style={{ color: "hsl(0 0% 100%)" }}>
            Series & Championships
          </h1>
          <p className="mt-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            Browse motorsport series, championships, and their race history.
          </p>
        </div>
      </section>

      <div className="container py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-8">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by series name…"
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
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading series…</p>
        ) : seriesList.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No series found matching your criteria.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {seriesList.map(s => (
              <Link
                key={s.id}
                to={`/series/${s.id}`}
                className="group rounded-lg border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg overflow-hidden bg-primary/10">
                    {s.logo_url ? (
                      <img src={s.logo_url} alt={s.name} className="h-full w-full object-cover" />
                    ) : (
                      <Trophy className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-base font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">
                      {s.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {s.category && (
                        <Badge variant="secondary" className="text-xs">
                          {categoryLabels[s.category] || s.category}
                        </Badge>
                      )}
                      {s.website && (
                        <span className="inline-flex items-center gap-1">
                          <Globe className="h-3 w-3" /> Website
                        </span>
                      )}
                    </div>
                    {s.description && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{s.description}</p>
                    )}
                  </div>
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

export default SeriesPage;
