import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search as SearchIcon, Ticket } from "lucide-react";
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

interface RaceEvent {
  id: string;
  event_name: string;
  series_name: string;
  season_year: number;
  category: string | null;
  location: string | null;
  event_date: string | null;
  ticket_url: string | null;
  circuit_id: string | null;
  series_id: string | null;
}

const CalendarPage = () => {
  const [events, setEvents] = useState<RaceEvent[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [allSeries, setAllSeries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSeries = async () => {
      const { data } = await supabase.from("race_events").select("series_name").order("series_name");
      if (data) {
        const unique = [...new Set(data.map(d => d.series_name))];
        setAllSeries(unique);
      }
    };
    fetchSeries();
  }, []);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      const today = new Date().toISOString().split("T")[0];

      let query = supabase
        .from("race_events")
        .select("id, event_name, series_name, season_year, category, location, event_date, ticket_url, circuit_id, series_id")
        .gte("event_date", today)
        .order("event_date", { ascending: true });

      if (category !== "all") query = query.eq("category", category as any);
      if (seriesFilter) query = query.eq("series_name", seriesFilter);

      const { data } = await query.limit(200);
      let filtered = (data as RaceEvent[]) ?? [];

      if (search) {
        const lower = search.toLowerCase();
        filtered = filtered.filter(e =>
          e.event_name.toLowerCase().includes(lower) ||
          e.series_name.toLowerCase().includes(lower) ||
          (e.location || "").toLowerCase().includes(lower)
        );
      }

      setEvents(filtered);
      setLoading(false);
    };

    const debounce = setTimeout(fetchEvents, 300);
    return () => clearTimeout(debounce);
  }, [search, category, seriesFilter]);

  // Group by month
  const monthGroups = events.reduce<Record<string, RaceEvent[]>>((acc, ev) => {
    const date = ev.event_date ? new Date(ev.event_date) : null;
    const key = date
      ? date.toLocaleDateString("en-US", { year: "numeric", month: "long" })
      : "Date TBD";
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="pt-24 pb-10 bg-card border-b border-border">
        <div className="container">
          <h1 className="font-display text-3xl font-bold text-foreground">Upcoming Races</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Browse upcoming motorsport events. Filter by series, category, or search by name.
          </p>
        </div>
      </section>

      <div className="container py-8">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-8">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search events, locations, cities…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categoryOptions.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={seriesFilter || "all"} onValueChange={v => setSeriesFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-full sm:w-[220px]"><SelectValue placeholder="All Series" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Series</SelectItem>
              {allSeries.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Timeline */}
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading events…</p>
        ) : events.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No upcoming events found.</p>
            <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters or check past results.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {Object.entries(monthGroups).map(([month, monthEvents]) => (
              <div key={month}>
                <h2 className="font-display text-lg font-semibold text-foreground mb-4 border-b border-border pb-2">{month}</h2>
                <div className="space-y-3">
                  {monthEvents.map(ev => {
                    const date = ev.event_date ? new Date(ev.event_date) : null;
                    return (
                      <div key={ev.id} className="flex gap-4 items-start rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors">
                        {/* Date badge */}
                        {date && (
                          <div className="flex flex-col items-center justify-center w-14 shrink-0 text-center">
                            <span className="text-xs font-medium text-muted-foreground uppercase">
                              {date.toLocaleDateString("en-US", { weekday: "short" })}
                            </span>
                            <span className="font-display text-2xl font-bold text-foreground leading-none">
                              {date.getDate()}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <Link to={`/event/${ev.id}`} className="font-display text-base font-semibold text-card-foreground hover:text-primary transition-colors">
                            {ev.event_name}
                          </Link>
                          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            {ev.series_id ? (
                              <Link to={`/series/${ev.series_id}`} className="hover:text-primary transition-colors">{ev.series_name}</Link>
                            ) : (
                              <span>{ev.series_name}</span>
                            )}
                            {ev.location && (
                              ev.circuit_id ? (
                                <Link to={`/circuit/${ev.circuit_id}`} className="hover:text-primary transition-colors">{ev.location}</Link>
                              ) : (
                                <span>{ev.location}</span>
                              )
                            )}
                            {ev.category && <Badge variant="secondary" className="text-xs">{categoryLabels[ev.category] || ev.category}</Badge>}
                          </div>
                        </div>
                        {ev.ticket_url && (
                          <a
                            href={ev.ticket_url}
                            target="_blank"
                            rel="noopener"
                            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <Ticket className="h-3.5 w-3.5" /> Tickets
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default CalendarPage;
