import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Search, Shield, LogOut, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const Header = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkAdmin(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkAdmin(session.user.id);else
      setIsAdmin(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const checkAdmin = async (userId: string) => {
    const { data } = await supabase.
    from("user_roles").
    select("role").
    eq("user_id", userId).
    eq("role", "admin");
    setIsAdmin(!!data && data.length > 0);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 bg-secondary">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary">
            <span className="font-display text-sm font-bold text-primary-foreground">TR</span>
          </div>
          <span className="font-display text-xl font-bold tracking-wider text-foreground">
            TrackRecord
          </span>
        </Link>

        <nav className="hidden items-center gap-4 md:flex">
          <Link to="/search" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <Search className="h-4 w-4" />
            Find Drivers
          </Link>
          <Link to="/results" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <Trophy className="h-4 w-4" />
            Race Results
          </Link>
          {isAdmin &&
          <Link to="/admin" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              <Shield className="h-4 w-4" />
              Admin
            </Link>
          }
          {session ?
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5">
              <LogOut className="h-4 w-4" />
              Log Out
            </Button> :

          <>
              <Link to="/auth">
                <Button variant="outline" size="sm">Log In</Button>
              </Link>
              <Link to="/auth?signup=true">
                <Button size="sm">Sign Up</Button>
              </Link>
            </>
          }
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          {session ?
          <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button> :

          <Link to="/auth">
              <Button size="sm">Sign Up</Button>
            </Link>
          }
        </div>
      </div>
    </header>);

};

export default Header;