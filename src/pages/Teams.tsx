import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon, Car } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FlagImage from "@/components/FlagImage";
import SEOHead from "@/components/SEOHead";

const TeamsPage = () => {
  const [teams, setTeams] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTeams = async () => {
      setLoading(true);
      let query = supabase.from("v2_teams").select("*").order("full_name");
      if (search) query = query.ilike("full_name", `%${search}%`);
      const { data } = await query;
      setTeams(data ?? []);
      setLoading(false);
    };
    const debounce = setTimeout(fetchTeams, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Teams" description="Browse motorsport teams." canonical="/teams" />
      <Header />
      <section className="pt-24 pb-10" style={{ background: "linear-gradient(135deg, hsl(220 20% 8%) 0%, hsl(220 25% 14%) 100%)" }}>
        <div className="container">
          <h1 className="font-display text-3xl font-bold sm:text-4xl" style={{ color: "hsl(0 0% 100%)" }}>Teams</h1>
          <p className="mt-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>Browse motorsport teams.</p>
        </div>
      </section>

      <div className="container py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-8">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by team name…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading teams…</p>
        ) : teams.length === 0 ? (
          <div className="text-center py-16"><p className="text-muted-foreground">No teams found.</p></div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team: any) => (
              <Link key={team.id} to={`/team/${team.id}`} className="group rounded-lg border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Car className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-base font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">
                      {team.full_name}
                    </h3>
                    {team.nationality && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <FlagImage nationality={team.nationality} size={16} /> {team.nationality}
                      </div>
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

export default TeamsPage;
