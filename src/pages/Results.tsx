import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon, Trophy, MapPin, Calendar } from "lucide-react";
import { formatDateRange } from "@/lib/date-utils";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

interface DisplayEvent {
  id: string;
  name: string;
  series: string;
  year: number;
  location: string | null;
  date: string | null;
  endDate: string | null;
}

const ResultsPage = () => {
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);

      const { data } = await supabase
        .from("v2_events")
        .select("id, name, start_date, end_date, status, v2_seasons(year, v2_series(name)), v2_circuits(name, country)")
        .eq("status", "published" as any)
        .order("start_date", { ascending: false })
        .limit(200);

      let combined: DisplayEvent[] = ((data || []) as any[]).map(e => ({
        id: e.id,
        name: e.name,
        series: e.v2_seasons?.v2_series?.name || "",
        year: e.v2_seasons?.year || 0,
        location: e.v2_circuits ? `${e.v2_circuits.name}${e.v2_circuits.country ? `, ${e.v2_circuits.country}` : ""}` : null,
        date: e.start_date,
        endDate: e.end_date,
      }));

      if (yearFilter) combined = combined.filter(e => e.year === parseInt(yearFilter));
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
  }, [search, yearFilter]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="pt-24 pb-10" style={{ background: "linear-gradient(135deg, hsl(220 20% 8%) 0%, hsl(220 25% 14%) 100%)" }}>
        <div className="container">
          <h1 className="font-display text-3xl font-bold sm:text-4xl" style={{ color: "hsl(0 0% 100%)" }}>Race Results</h1>
          <p className="mt-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>Browse race events and view detailed classified results.</p>
        </div>
      </section>

      <div className="container py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-8">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by event, series, or location…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Input placeholder="Year…" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} type="number" className="w-full sm:w-[120px]" />
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading events…</p>
        ) : events.length === 0 ? (
          <div className="text-center py-16"><p className="text-muted-foreground">No race events found.</p></div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map(ev => (
              <Link key={ev.id} to={`/events/${ev.id}`} className="group rounded-lg border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all">
                <div className="flex items-start gap-3">
                  <Trophy className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-base font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">{ev.name}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">{ev.series}</p>
                    <div className="mt-2 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                      <span>{ev.year}</span>
                      {ev.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {ev.location}</span>}
                      {ev.date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDateRange(ev.date, ev.endDate)}</span>}
                    </div>
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

export default ResultsPage;
