import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Moon, Search, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import CommandPalette from "@/components/tr/CommandPalette";
import { supabase } from "@/integrations/supabase/client";

const PRIMARY = [
  { to: "/results", label: "Races", match: (p: string) => p === "/results" || p.startsWith("/events/") },
  { to: "/series", label: "Championships", match: (p: string) => p.startsWith("/series") },
  { to: "/drivers", label: "Drivers", match: (p: string) => p.startsWith("/driver") || p === "/compare" },
  { to: "/circuits", label: "Circuits", match: (p: string) => p.startsWith("/circuit") },
];

const INDEX = [
  { to: "/results", label: "Races", table: "v2_events", blurb: "Every race, replayable" },
  { to: "/series", label: "Championships", table: "v2_series", blurb: "Points races, season by season" },
  { to: "/drivers", label: "Drivers", table: "v2_drivers", blurb: "Career records" },
  { to: "/teams", label: "Teams", table: "v2_teams", blurb: "Entries, wins, line-ups" },
  { to: "/circuits", label: "Circuits", table: "v2_circuits", blurb: "Character, winners, records" },
  { to: "/cars", label: "Cars", table: "v2_cars", blurb: "Machines and their results" },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to day mode" : "Switch to night mode"}
      title={dark ? "Day" : "Night"}
      className={cn("flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-ink/[0.07] hover:text-ink", className)}
    >
      {dark ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
    </button>
  );
}

export const openSearch = () => window.dispatchEvent(new CustomEvent("tr:search"));

function IndexOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!open || Object.keys(counts).length) return;
    Promise.all(INDEX.map((i) => supabase.from(i.table as never).select("id", { count: "exact", head: true }))).then((rs) =>
      setCounts(Object.fromEntries(INDEX.map((i, k) => [i.table, rs[k].count ?? 0]))),
    );
  }, [open, counts]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  return (
    <div
      className={cn("fixed inset-0 z-[60] bg-paper/95 backdrop-blur-xl transition-all duration-300", open ? "visible opacity-100" : "invisible opacity-0")}
      aria-hidden={!open}
      role="dialog"
      aria-label="Index"
    >
      <div className="mx-auto flex h-full max-w-[1320px] flex-col px-4 py-5 sm:px-6 lg:px-10">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Index</span>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full border hover:bg-ink/[0.06]" aria-label="Close index">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="mt-6 grid flex-1 content-center gap-x-10 sm:grid-cols-2">
          {INDEX.map((i, k) => (
            <Link
              key={i.to}
              to={i.to}
              onClick={onClose}
              className={cn("group flex items-baseline justify-between gap-4 border-b py-4 transition-all duration-500 sm:py-6", open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")}
              style={{ transitionDelay: open ? `${60 + k * 40}ms` : "0ms" }}
            >
              <span className="display text-5xl transition-transform duration-300 group-hover:translate-x-2 sm:text-7xl">{i.label}</span>
              <span className="text-right">
                <span className="num block text-sm text-ink">{counts[i.table] != null ? counts[i.table].toLocaleString() : ""}</span>
                <span className="hidden text-xs text-ink-3 sm:block">{i.blurb}</span>
              </span>
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-6 text-sm text-ink-2">
          {[
            { to: "/calendar", label: "Calendar" },
            { to: "/compare", label: "Compare drivers" },
            { to: "/articles", label: "Articles" },
            { to: "/privacy", label: "Privacy" },
          ].map((l) => (
            <Link key={l.to} to={l.to} onClick={onClose} className="link-u hover:text-ink">
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

const Header = () => {
  const { pathname } = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    const onOpen = () => setPaletteOpen(true);
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("keydown", onKey);
    window.addEventListener("tr:search", onOpen);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("tr:search", onOpen);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  useEffect(() => setIndexOpen(false), [pathname]);

  return (
    <>
      <header className={cn("sticky top-0 z-50 transition-all duration-300", scrolled ? "py-2" : "py-3 sm:py-4")}>
        <div className="mx-auto max-w-[1320px] px-3 sm:px-6 lg:px-10">
          <div
            className={cn(
              "flex h-14 items-center gap-2 rounded-full border pl-4 pr-2 transition-all duration-300 sm:pl-5",
              scrolled ? "border-rule bg-sheet/85 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)] backdrop-blur-xl" : "border-transparent bg-transparent",
            )}
          >
            <Link to="/" className="mr-2 flex shrink-0 items-center" aria-label="Track Records home">
              <img alt="Track Records" className="logo-adapt h-[22px] w-auto" src="/brand/logo.png" />
            </Link>
            <nav className="hidden items-center md:flex">
              {PRIMARY.map((l) => {
                const active = l.match(pathname);
                return (
                  <Link key={l.to} to={l.to} className={cn("relative rounded-full px-3.5 py-2 text-[14px] transition-colors", active ? "text-ink" : "text-ink-2 hover:text-ink")}>
                    {l.label}
                    {active && <span className="absolute inset-x-3.5 -bottom-0.5 h-[3px] rounded-full bg-hl" />}
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setPaletteOpen(true)}
                className="group flex h-10 items-center gap-2.5 rounded-full bg-ink/[0.05] px-3.5 text-sm text-ink-2 transition-colors hover:bg-ink/[0.09] hover:text-ink sm:w-64"
                aria-label="Search the record"
              >
                <Search className="h-4 w-4" />
                <span className="hidden flex-1 text-left sm:inline">Search the record</span>
                <kbd className="hidden rounded-md border bg-sheet px-1.5 py-0.5 font-mono text-[10px] text-ink-3 sm:inline">⌘K</kbd>
              </button>
              <ThemeToggle />
              <button onClick={() => setIndexOpen(true)} className="flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-paper transition-transform hover:scale-[1.03]">
                Index
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>
      <IndexOverlay open={indexOpen} onClose={() => setIndexOpen(false)} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
};

export default Header;
