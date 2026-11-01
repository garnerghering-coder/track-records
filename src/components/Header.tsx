import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, Moon, Search, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import CommandPalette from "@/components/tr/CommandPalette";

const NAV = [
  { to: "/results", label: "Results", match: (p: string, s: string) => p === "/results" || p.startsWith("/events/") },
  { to: "/series", label: "Series", match: (p: string) => p.startsWith("/series") },
  { to: "/search?tab=drivers", label: "Drivers", match: (p: string, s: string) => p.startsWith("/driver/") || (p === "/search" && s.includes("tab=drivers")) },
  { to: "/teams", label: "Teams", match: (p: string) => p.startsWith("/team") },
  { to: "/search?tab=circuits", label: "Circuits", match: (p: string, s: string) => p.startsWith("/circuit/") || (p === "/search" && s.includes("tab=circuits")) },
  { to: "/cars", label: "Cars", match: (p: string) => p.startsWith("/car") },
  { to: "/calendar", label: "Calendar", match: (p: string) => p === "/calendar" },
  { to: "/articles", label: "Articles", match: (p: string) => p.startsWith("/articles") },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  return (
    <button
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn("flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", className)}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

const Header = () => {
  const { pathname, search } = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // ⌘K / Ctrl+K / "/" opens search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname, search]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
        <div className="container flex h-14 items-center gap-6">
          <Link to="/" className="flex shrink-0 items-center" aria-label="Track Records home">
            <img alt="Track Records" className="logo-adapt h-6 w-auto" src="/brand/logo.png" />
          </Link>

          <nav className="hidden h-full items-stretch lg:flex">
            {NAV.map((l) => {
              const active = l.match(pathname, search);
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className={cn(
                    "relative flex items-center px-3 font-display text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l.label}
                  {active && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-primary" />}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex h-8 items-center gap-2 rounded border bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground md:w-56"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
              <span className="hidden flex-1 text-left md:inline">Search…</span>
              <kbd className="hidden rounded-sm border bg-muted px-1.5 font-mono text-[10px] md:inline">⌘K</kbd>
            </button>
            <ThemeToggle />
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="flex h-8 w-8 items-center justify-center rounded text-foreground hover:bg-accent lg:hidden"
              aria-label="Menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t bg-background lg:hidden">
            <nav className="container grid grid-cols-2 gap-px py-3">
              {NAV.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className={cn(
                    "rounded px-3 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.1em]",
                    l.match(pathname, search) ? "bg-accent text-foreground" : "text-muted-foreground",
                  )}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
};

export default Header;
