import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search as SearchIcon, Trophy, MapPin, Calendar } from "lucide-react";
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

interface DisplayEvent {
  id: string;
  name: string;
  series: string;
  year: number;
  category: string | null;
  location: string | null;
  date: string | null;
  source: "v1" | "v2";
}

const ResultsPage = () => {
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [yearFilter, setYearFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);

      // Fetch V1 events
      let v1Query = supabase
        .from("race_events")
        .select("id, event_name, series_name, season_year, category, location, event_date")
        .order("season_year", { ascending: false })
        .order("event_date", { ascending: false });

      if (category !== "all") v1Query = v1Query.eq("category", category as any);
      if (yearFilter) v1Query = v1Query.eq("season_year", parseInt(yearFilter));

      // Fetch V2 published events
      let v2Query = supabase
        .from("v2_events")
        .select("id, name, start_date, end_date, status, v2_seasons(year, v2_series(name)), v2_circuits(name, country)")
        .eq("status", "published" as any)
        .order("start_date", { ascending: false });

      const [v1Res, v2Res] = await Promise.all([v1Query.limit(200), v2Query.limit(200)]);

      const v1Events: DisplayEvent[] = ((v1Res.data || []) as any[]).map(e => ({
        id: e.id,
        name: e.event_name,
        series: e.series_name,
        year: e.season_year,
        category: e.category,
        location: e.location,
        date: e.event_date,
        source: "v1" as const,
      }));

      const v2Events: DisplayEvent[] = ((v2Res.data || []) as any[]).map(e => ({
        id: e.id,
        name: e.name,
        series: e.v2_seasons?.v2_series?.name || "",
        year: e.v2_seasons?.year || 0,
        category: null,
        location: e.v2_circuits ? `${e.v2_circuits.name}${e.v2_circuits.country ? `, ${e.v2_circuits.country}` : ""}` : null,
        date: e.start_date,
        source: "v2" as const,
      }));

      let combined = [...v2Events, ...v1Events];

      // Apply year filter to v2 events too
      if (yearFilter) {
        combined = combined.filter(e => e.year === parseInt(yearFilter));
      }

      if (search) {
        const lower = search.toLowerCase();
        combined = combined.filter(e =>
          e.name.toLowerCase().includes(lower) ||
          e.series.toLowerCase().includes(lower) ||
          (e.location || "").toLowerCase().includes(lower)
        );
      }

      setEvents(combined);
      setLoading(false);
    };

    const debounce = setTimeout(fetchEvents, 300);
    return () => clearTimeout(debounce);
  }, [search, category, yearFilter]);

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
            Browse race events and view detailed classified results.
          </p>
        </div>
      </section>

      <div className="container py-8">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-8">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by event, series, or location…"
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

        {/* Events list */}
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading events…</p>
        ) : events.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No race events found matching your criteria.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map(ev => {
              const catLabel = ev.category ? (categoryLabels[ev.category] || ev.category) : null;
              const linkTo = ev.source === "v2" ? `/events/${ev.id}` : `/event/${ev.id}`;
              return (
                <Link
                  key={`${ev.source}-${ev.id}`}
                  to={linkTo}
                  className="group rounded-lg border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-3">
                    <Trophy className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-base font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">
                        {ev.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">{ev.series}</p>
                      <div className="mt-2 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                        <span>{ev.year}</span>
                        {ev.location && (
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {ev.location}</span>
                        )}
                        {ev.date && (
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(ev.date).toLocaleDateString()}</span>
                        )}
                      </div>
                      {catLabel && (
                        <Badge variant="secondary" className="mt-2 text-xs">{catLabel}</Badge>
                      )}
                    </div>
                  </div>
                </Link>
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
