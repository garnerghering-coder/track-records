import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import heroImage from "@/assets/hero-racing.jpg";

const Index = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({ drivers: 0, teams: 0, events: 0, series: 0, cars: 0 });
  const [recentEvents, setRecentEvents] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const [d, t, e, s, c] = await Promise.all([
        supabase.from("driver_profiles").select("id", { count: "exact", head: true }),
        supabase.from("team_profiles").select("id", { count: "exact", head: true }),
        supabase.from("race_events").select("id", { count: "exact", head: true }),
        supabase.from("series").select("id", { count: "exact", head: true }),
        supabase.from("car_models").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        drivers: d.count ?? 0,
        teams: t.count ?? 0,
        events: e.count ?? 0,
        series: s.count ?? 0,
        cars: c.count ?? 0,
      });
    };

    const fetchRecent = async () => {
      const { data } = await supabase
        .from("race_events")
        .select("id, event_name, series_name, season_year, location, event_date")
        .order("created_at", { ascending: false })
        .limit(6);
      setRecentEvents(data ?? []);
    };

    fetchStats();
    fetchRecent();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="relative flex min-h-[85vh] items-center justify-center overflow-hidden pt-16">
        <div className="absolute inset-0">
          <img src={heroImage} alt="Racing on track" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/70 to-background" />
        </div>

        <div className="container relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <h1 className="font-display text-5xl font-bold leading-tight tracking-wide sm:text-6xl lg:text-7xl text-foreground">
              The Motorsport
              <br />
              <span className="text-primary">Database.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg font-body text-muted-foreground font-light">
              Search drivers, teams, series, circuits, and race results — all in one place.
            </p>

            {/* Search bar */}
            <form onSubmit={handleSearch} className="mx-auto mt-8 max-w-xl">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search drivers, teams, series, circuits…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-14 pl-12 pr-32 text-base bg-card border-border"
                />
                <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 px-6">
                  Search
                </Button>
              </div>
            </form>

            <div className="mt-6 flex items-center justify-center gap-3 text-sm text-muted-foreground">
              <Link to="/search?tab=drivers" className="hover:text-foreground transition-colors">Drivers</Link>
              <span>·</span>
              <Link to="/teams" className="hover:text-foreground transition-colors">Teams</Link>
              <span>·</span>
              <Link to="/results" className="hover:text-foreground transition-colors">Results</Link>
              <span>·</span>
              <Link to="/calendar" className="hover:text-foreground transition-colors">Calendar</Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Live Stats */}
      <section className="border-y border-border bg-card py-12">
        <div className="container">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
            {[
              { label: "Drivers", value: stats.drivers, to: "/search?tab=drivers" },
              { label: "Teams", value: stats.teams, to: "/teams" },
              { label: "Race Events", value: stats.events, to: "/results" },
              { label: "Series", value: stats.series, to: "/series" },
              { label: "Cars", value: stats.cars, to: "/cars" },
            ].map((stat) => (
              <Link key={stat.label} to={stat.to}>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="text-center group cursor-pointer"
                >
                  <div className="font-accent text-4xl font-bold text-primary group-hover:scale-110 transition-transform">
                    {stat.value.toLocaleString()}
                  </div>
                  <div className="mt-1 text-sm font-medium text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
                    {stat.label}
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Recently Added */}
      {recentEvents.length > 0 && (
        <section className="py-16">
          <div className="container">
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-display text-2xl font-semibold text-foreground">
                Recently Added
              </h2>
              <Link to="/results" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentEvents.map((ev) => (
                <Link
                  key={ev.id}
                  to={`/event/${ev.id}`}
                  className="group rounded-lg border border-border bg-card p-5 hover:border-primary/40 transition-all"
                >
                  <h3 className="font-display text-base font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">
                    {ev.event_name}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 truncate">{ev.series_name}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{ev.season_year}</span>
                    {ev.location && <span>{ev.location}</span>}
                    {ev.event_date && <span>{new Date(ev.event_date).toLocaleDateString()}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-16">
        <div className="container">
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <h2 className="font-display text-3xl font-bold text-foreground">
              Help Build the Database
            </h2>
            <p className="mt-4 max-w-lg mx-auto text-muted-foreground">
              Contribute race results, add driver and team profiles, and help create the most complete motorsport database.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link to="/contribute">
                <Button size="lg" className="gap-2 px-8 font-medium">
                  Start Contributing <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/auth?signup=true">
                <Button size="lg" variant="outline" className="px-8">
                  Sign Up Free
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
