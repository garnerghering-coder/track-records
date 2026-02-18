import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User, Shield, LogOut, Trophy, Users, PenLine, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const Header = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkAdmin(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkAdmin(session.user.id); else setIsAdmin(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const checkAdmin = async (userId: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
    setIsAdmin(!!data && data.length > 0);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      const lower = `%${searchQuery}%`;
      const [drivers, teams, events] = await Promise.all([
        supabase.from("driver_profiles").select("id, first_name, last_name").or(`first_name.ilike.${lower},last_name.ilike.${lower}`).limit(5),
        supabase.from("team_profiles" as any).select("id, name").ilike("name", lower).limit(5) as any,
        supabase.from("race_events").select("id, event_name, series_name").or(`event_name.ilike.${lower},series_name.ilike.${lower}`).limit(5),
      ]);
      const results: any[] = [];
      (drivers.data || []).forEach((d: any) => results.push({ type: "driver", id: d.id, label: `${d.first_name} ${d.last_name}`, url: `/driver/${d.id}` }));
      ((teams as any).data || []).forEach((t: any) => results.push({ type: "team", id: t.id, label: t.name, url: `/team/${t.id}` }));
      (events.data || []).forEach((e: any) => results.push({ type: "event", id: e.id, label: `${e.event_name} — ${e.series_name}`, url: `/event/${e.id}` }));
      setSearchResults(results);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between bg-secondary">
        <Link to="/" className="flex items-center gap-2 bg-secondary">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary">
            <span className="font-display text-sm font-bold text-primary-foreground">TR</span>
          </div>
          <span className="font-display text-xl font-bold tracking-wider text-foreground">
            TrackRecord
          </span>
        </Link>

        <nav className="hidden items-center gap-4 md:flex">
          {/* Search toggle */}
          <div className="relative">
            <button onClick={() => { setSearchOpen(!searchOpen); setSearchQuery(""); setSearchResults([]); }} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              <Search className="h-4 w-4" />
              Search
            </button>
            {searchOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-border bg-card shadow-lg p-2 z-50">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="Search drivers, teams, events…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-8 pr-8 h-8 text-sm"
                  />
                  <button onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
                    {searchResults.map(r => (
                      <Link
                        key={`${r.type}-${r.id}`}
                        to={r.url}
                        onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                      >
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground w-10">{r.type}</span>
                        <span className="text-card-foreground truncate">{r.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
                {searchQuery.trim() && searchResults.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2 text-center">No results found.</p>
                )}
              </div>
            )}
          </div>

          <Link to="/search" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <User className="h-4 w-4" />
            Drivers
          </Link>
          <Link to="/teams" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <Users className="h-4 w-4" />
            Teams
          </Link>
          <Link to="/results" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <Trophy className="h-4 w-4" />
            Results
          </Link>
          {session && (
            <Link to="/contribute" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              <PenLine className="h-4 w-4" />
              Contribute
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              <Shield className="h-4 w-4" />
              Admin
            </Link>
          )}
          {session ? (
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5">
              <LogOut className="h-4 w-4" />
              Log Out
            </Button>
          ) : (
            <>
              <Link to="/auth">
                <Button variant="outline" size="sm">Log In</Button>
              </Link>
              <Link to="/auth?signup=true">
                <Button size="sm">Sign Up</Button>
              </Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          {session ? (
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          ) : (
            <Link to="/auth">
              <Button size="sm">Sign Up</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
