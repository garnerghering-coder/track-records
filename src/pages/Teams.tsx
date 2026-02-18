import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search as SearchIcon, Users } from "lucide-react";
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

const categoryLabels: Record<string, string> = Object.fromEntries(
  categoryOptions.filter(c => c.value !== "all").map(c => [c.value, c.label])
);

const TeamsPage = () => {
  const [teams, setTeams] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [nationality, setNationality] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTeams = async () => {
      setLoading(true);
      let query = supabase.from("team_profiles" as any).select("*");

      if (search) {
        query = query.ilike("name", `%${search}%`);
      }
      if (category !== "all") {
        query = query.eq("primary_category", category as any);
      }
      if (nationality) {
        query = query.ilike("nationality", `%${nationality}%`);
      }
      query = query.order("name", { ascending: true });

      const { data } = await query;
      setTeams(data ?? []);
      setLoading(false);
    };

    const debounce = setTimeout(fetchTeams, 300);
    return () => clearTimeout(debounce);
  }, [search, category, nationality]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section
        className="pt-24 pb-10"
        style={{ background: "linear-gradient(135deg, hsl(220 20% 8%) 0%, hsl(220 25% 14%) 100%)" }}
      >
        <div className="container">
          <h1 className="font-display text-3xl font-bold sm:text-4xl" style={{ color: "hsl(0 0% 100%)" }}>
            Teams
          </h1>
          <p className="mt-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            Browse motorsport teams by name, category, and nationality.
          </p>
        </div>
      </section>

      <div className="container py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-8">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by team name…"
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
            placeholder="Nationality…"
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            className="w-full sm:w-[160px]"
          />
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading teams…</p>
        ) : teams.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No teams found matching your criteria.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map(team => (
              <Link
                key={team.id}
                to={`/team/${team.id}`}
                className="group rounded-lg border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg overflow-hidden bg-primary/10">
                    {team.logo_url ? (
                      <img src={team.logo_url} alt={team.name} className="h-full w-full object-cover" />
                    ) : (
                      <Users className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-base font-semibold text-card-foreground group-hover:text-primary transition-colors truncate">
                      {team.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {team.nationality && (
                        <span className="inline-flex items-center gap-1">
                          <FlagImage nationality={team.nationality} size={16} /> {team.nationality}
                        </span>
                      )}
                      {team.primary_category && (
                        <span>{categoryLabels[team.primary_category] || team.primary_category}</span>
                      )}
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

export default TeamsPage;
