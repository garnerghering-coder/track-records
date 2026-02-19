import { useEffect, useState } from "react";
import { Outlet, useNavigate, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Users, Car, Flag, MapPin, Trophy, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/manage", label: "Events", icon: Calendar, match: ["/manage", "/manage/events"] },
  { to: "/manage/drivers", label: "Drivers", icon: Users, match: ["/manage/drivers"] },
  { to: "/manage/teams", label: "Teams", icon: Flag, match: ["/manage/teams"] },
  { to: "/manage/cars", label: "Cars", icon: Car, match: ["/manage/cars"] },
  { to: "/manage/circuits", label: "Circuits", icon: MapPin, match: ["/manage/circuits"] },
  { to: "/manage/series", label: "Series", icon: Trophy, match: ["/manage/series"] },
];

export default function ManageLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).eq("role", "admin");
      if (!data || data.length === 0) { navigate("/"); return; }
      setLoading(false);
    };
    check();
  }, [navigate]);

  if (loading) return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading…</div>;

  const isActive = (match: string[]) => match.some(m => location.pathname === m || (m !== "/manage" && location.pathname.startsWith(m)));

  return (
    <div className="flex min-h-screen w-full">
      <aside className={cn("border-r border-border bg-sidebar flex flex-col transition-all", collapsed ? "w-14" : "w-56")}>
        <div className="flex items-center justify-between p-3 border-b border-sidebar-border">
          {!collapsed && <span className="text-sm font-semibold text-sidebar-foreground uppercase tracking-wider">Manage</span>}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground" onClick={() => setCollapsed(!collapsed)}>
            <Menu className="h-4 w-4" />
          </Button>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.match) ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <Link to="/" className={cn("text-xs text-sidebar-foreground hover:text-sidebar-primary transition-colors", collapsed && "text-center block")}>
            {collapsed ? "←" : "← Back to site"}
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
