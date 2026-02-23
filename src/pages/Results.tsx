import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon, Trophy, Calendar } from "lucide-react";
import { formatDateRange } from "@/lib/date-utils";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FlagImage from "@/components/FlagImage";
import SEOHead from "@/components/SEOHead";

interface DisplayEvent {
  id: string;
  name: string;
  series: string;
  year: number;
  circuitName: string | null;
  country: string | null;
  date: string | null;
  endDate: string | null;
}

interface PodiumEntry {
  driverId: string;
  name: string;
  position: number;
}

function shortenName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

const PODIUM_COLORS: Record<number, string> = {
  1: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  2: "bg-gray-300/15 text-gray-300 border-gray-400/40",
  3: "bg-amber-700/20 text-amber-600 border-amber-700/40",
};

const ResultsPage = () => {
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const [podiums, setPodiums] = useState<Record<string, PodiumEntry[]>>({});
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
        circuitName: e.v2_circuits?.name || null,
        country: e.v2_circuits?.country || null,
        date: e.start_date,
        endDate: e.end_date,
      }));

      if (yearFilter) combined = combined.filter(e => e.year === parseInt(yearFilter));
      if (search) {
        const lower = search.toLowerCase();
        combined = combined.filter(e =>
          e.name.toLowerCase().includes(lower) ||
          e.series.toLowerCase().includes(lower) ||
          (e.circuitName || "").toLowerCase().includes(lower) ||
          (e.country || "").toLowerCase().includes(lower)
        );
      }

      setEvents(combined);

      // Fetch podium data
      const eventIds = combined.map(e => e.id);
      if (eventIds.length > 0) {
        const { data: raceSessions } = await supabase
          .from("v2_sessions")
          .select("id, event_id, session_type, parent_session_id")
          .in("event_id", eventIds)
          .in("session_type", ["race", "endurance_race", "sprint_race"] as any)
          .eq("status", "published" as any)
          .is("parent_session_id", null);

        if (raceSessions && raceSessions.length > 0) {
          const sIds = raceSessions.map(rs => rs.id);
          const sessionEventMap: Record<string, string> = {};
          raceSessions.forEach(rs => { sessionEventMap[rs.id] = rs.event_id; });

          const { data: topResults } = await supabase
            .from("v2_race_results" as any)
            .select("session_id, position, driver_id, v2_drivers(full_name)")
            .in("session_id", sIds)
            .lte("position", 3)
            .order("position");

          const podiumMap: Record<string, PodiumEntry[]> = {};
          for (const r of (topResults || []) as any[]) {
            const eventId = sessionEventMap[r.session_id];
            if (!eventId) continue;
            if (!podiumMap[eventId]) podiumMap[eventId] = [];
            if (podiumMap[eventId].length < 3 && !podiumMap[eventId].some(p => p.position === r.position)) {
              podiumMap[eventId].push({ driverId: r.driver_id, name: r.v2_drivers?.full_name || "Unknown", position: r.position });
            }
          }
          setPodiums(podiumMap);
        } else {
          setPodiums({});
        }
      }

      setLoading(false);
    };

    const debounce = setTimeout(fetchEvents, 300);
    return () => clearTimeout(debounce);
  }, [search, yearFilter]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Race Results" description="Browse race events and view detailed classified results." canonical="/results" />
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
            {events.map(ev => {
              const evPodium = (podiums[ev.id] || []).sort((a, b) => a.position - b.position);
              const location = ev.circuitName ? `${ev.circuitName}${ev.country ? `, ${ev.country}` : ""}` : null;
              return (
                <Link key={ev.id} to={`/events/${ev.id}`} className="group rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      <FlagImage nationality={ev.country} size={24} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-sm font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">{ev.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{ev.series} · {ev.year}</p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        {location && <span className="truncate">{location}</span>}
                        {ev.date && <span className="shrink-0 flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDateRange(ev.date, ev.endDate)}</span>}
                      </div>
                    </div>
                  </div>

                  {evPodium.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-1.5">
                      {evPodium.map(p => (
                        <span key={p.position} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PODIUM_COLORS[p.position] || ""}`}>
                          <Trophy className="h-2.5 w-2.5" />
                          <span className="opacity-60">P{p.position}</span>
                          <span className="truncate max-w-[80px]">{shortenName(p.name)}</span>
                        </span>
                      ))}
                    </div>
                  )}
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
