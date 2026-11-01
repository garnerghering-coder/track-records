import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X, Menu, LogOut, Shield } from "lucide-react";
import { pgQuote } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import logoFull from "@/assets/logo-full.png";

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkAdmin(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkAdmin(session.user.id);else setIsAdmin(false);
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
    if (!searchQuery.trim()) {setSearchResults([]);return;}
    const timer = setTimeout(async () => {
      const lower = `%${searchQuery}%`;
      const [drivers, teams, events, series, circuits] = await Promise.all([
      supabase.from("v2_drivers").select("id, full_name, nationality").or(`full_name.ilike.${pgQuote(lower)},nationality.ilike.${pgQuote(lower)},short_name.ilike.${pgQuote(lower)}`).limit(5),
      supabase.from("v2_teams").select("id, full_name, nationality, short_name").or(`full_name.ilike.${pgQuote(lower)},nationality.ilike.${pgQuote(lower)},short_name.ilike.${pgQuote(lower)}`).limit(5),
      supabase.from("v2_events").select("id, name, start_date, v2_seasons(year, v2_series(name)), v2_circuits(name, country)").or(`name.ilike.${pgQuote(lower)}`).eq("status", "published" as any).limit(5),
      supabase.from("v2_series").select("id, name, short_name").or(`name.ilike.${pgQuote(lower)},short_name.ilike.${pgQuote(lower)}`).limit(4),
      supabase.from("v2_circuits").select("id, name, country, location").or(`name.ilike.${pgQuote(lower)},country.ilike.${pgQuote(lower)},location.ilike.${pgQuote(lower)}`).limit(4)]
      );
      const results: any[] = [];
      (drivers.data || []).forEach((d: any) => results.push({ type: "driver", id: d.id, label: d.full_name, url: `/driver/${d.id}` }));
      (teams.data || []).forEach((t: any) => results.push({ type: "team", id: t.id, label: t.full_name, url: `/team/${t.id}` }));
      (events.data || []).forEach((e: any) => {
        const seriesName = e.v2_seasons?.v2_series?.name || "";
        const circuitName = e.v2_circuits?.name || "";
        const subtitle = [seriesName, circuitName].filter(Boolean).join(" · ");
        results.push({ type: "event", id: e.id, label: e.name, url: `/events/${e.id}`, subtitle });
      });
      (series.data || []).forEach((s: any) => results.push({ type: "series", id: s.id, label: s.name, url: `/series/${s.id}` }));
      (circuits.data || []).forEach((c: any) => results.push({ type: "circuit", id: c.id, label: c.country ? `${c.name}, ${c.country}` : c.name, url: `/circuit/${c.id}` }));
      setSearchResults(results);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery("");
    }
  };

  const navLinks = [
  { to: "/series", label: "Series", match: "/series" },
  { to: "/search?tab=drivers", label: "Drivers", match: "/drivers-nav" },
  { to: "/search?tab=circuits", label: "Circuits", match: "/circuits-nav" },
  { to: "/results", label: "Results", match: "/results" },
  { to: "/calendar", label: "Calendar", match: "/calendar" },
  { to: "/articles", label: "Articles", match: "/articles" }];

  const isActive = (match: string) => {
    // Special handling for driver/circuit nav links
    if (match === "/drivers-nav") return location.pathname === "/search" && location.search.includes("tab=drivers");
    if (match === "/circuits-nav") return location.pathname === "/search" && location.search.includes("tab=circuits");
    return location.pathname === match || location.pathname.startsWith(match + "/");
  };


  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="container flex h-14 items-center justify-between">
        <Link to="/" className="cursor-target flex items-center">
          <img alt="Track Records" className="h-7 w-auto" src="/lovable-uploads/bdb4b583-1508-42b0-bfde-3780509298af.png" />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {/* Search toggle */}
          <div className="relative">
            <button
              onClick={() => {setSearchOpen(!searchOpen);setSearchQuery("");setSearchResults([]);}}
              className="cursor-target text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">

              Search
            </button>
            {searchOpen &&
            <div className="absolute right-0 top-full mt-2 w-96 rounded-lg border border-border bg-card shadow-xl p-2 z-50">
                <form onSubmit={handleSearchSubmit} className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                  autoFocus
                  placeholder="Search everything…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-8 h-9 text-sm" />

                  <button type="button" onClick={() => {setSearchOpen(false);setSearchQuery("");setSearchResults([]);}} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </form>
                {searchResults.length > 0 &&
              <div className="mt-2 max-h-72 overflow-y-auto space-y-0.5">
                    {searchResults.map((r) =>
                <Link
                  key={`${r.type}-${r.id}`}
                  to={r.url}
                  onClick={() => {setSearchOpen(false);setSearchQuery("");}}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent transition-colors">

                        <span className="text-[10px] uppercase font-medium text-muted-foreground w-12 shrink-0">{r.type}</span>
                        <div className="min-w-0 flex-1">
                          <span className="text-card-foreground truncate block">{r.label}</span>
                          {r.subtitle && <span className="text-[10px] text-muted-foreground truncate block">{r.subtitle}</span>}
                        </div>
                      </Link>
                )}
                    {searchQuery.trim() &&
                <button
                  onClick={() => {navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);setSearchOpen(false);setSearchQuery("");}}
                  className="w-full text-left rounded px-2 py-1.5 text-sm text-primary hover:bg-accent transition-colors">

                        View all results for "{searchQuery}"
                      </button>
                }
                  </div>
              }
                {searchQuery.trim() && searchResults.length === 0 &&
              <p className="text-xs text-muted-foreground p-2 text-center">No results found.</p>
              }
              </div>
            }
          </div>

          {navLinks.map((link) =>
          <Link key={link.to} to={link.to} className={`cursor-target text-sm font-medium transition-colors hover:text-foreground ${isActive(link.match) ? "text-foreground" : "text-muted-foreground"}`}>
              {link.label}
            </Link>
          )}
          {isAdmin &&
          <>
            <Link to="/manage" className="cursor-target text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Manage
            </Link>
            


          </>
          }
          {session ?
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
              Log Out
            </Button> :

          <div className="flex items-center gap-2">
              <Link to="/auth"><Button variant="ghost" size="sm">Log In</Button></Link>
              <Link to="/auth?signup=true"><Button size="sm">Sign Up</Button></Link>
            </div>
          }
        </nav>

        {/* Mobile */}
        <div className="flex items-center gap-2 md:hidden">
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-foreground">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen &&
      <div className="md:hidden border-t border-border bg-background p-4 space-y-2">
          {navLinks.map((link) =>
        <Link key={link.to} to={link.to} onClick={() => setMobileMenuOpen(false)} className={`block py-2 text-sm font-medium hover:text-foreground ${isActive(link.match) ? "text-foreground" : "text-muted-foreground"}`}>
              {link.label}
            </Link>
        )}
          {session &&
        <Link to="/contribute" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              Contribute
            </Link>
        }
          {isAdmin &&
        <>
          <Link to="/manage" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              Manage
            </Link>
        </>
        }
          {session ?
        <button onClick={() => {handleLogout();setMobileMenuOpen(false);}} className="block py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              Log Out
            </button> :

        <Link to="/auth" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-sm font-medium text-primary">
              Sign Up / Log In
            </Link>
        }
        </div>
      }
    </header>);

};

export default Header;