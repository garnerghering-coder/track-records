import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * Theme-aware colors for canvas / SVG charts on the event page.
 * Reads the design tokens from :root (light) or .dark and re-reads them
 * whenever the theme class on <html> changes, so canvases can redraw.
 */
export interface ChartTheme {
  dark: boolean;
  fg: string;
  muted: string;
  border: string;
  card: string;
  popover: string;
  primary: string;
  fastest: string;
  flag: string;
  dnf: string;
  pb: string;
  /** hsl() string for a token with alpha, e.g. a("--muted-foreground", 0.2) */
  a: (token: string, alpha: number) => string;
}

function readTheme(): ChartTheme {
  const fallback = (v: string, d: string) => (v && v.trim() ? v.trim() : d);
  const cs = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const get = (t: string, d: string) => fallback(cs?.getPropertyValue(t) || "", d);
  const hsl = (t: string, d: string) => `hsl(${get(t, d)})`;
  return {
    dark: typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
    fg: hsl("--foreground", "0 0% 95%"),
    muted: hsl("--muted-foreground", "240 4% 62%"),
    border: hsl("--border", "240 4% 15.5%"),
    card: hsl("--card", "240 5% 8.5%"),
    popover: hsl("--popover", "240 5% 9.5%"),
    primary: hsl("--primary", "46 100% 52%"),
    fastest: hsl("--fastest", "274 90% 70%"),
    flag: hsl("--flag", "48 100% 55%"),
    dnf: hsl("--dnf", "0 80% 62%"),
    pb: hsl("--pb", "142 70% 50%"),
    a: (token: string, alpha: number) => `hsl(${get(token, "240 4% 62%")} / ${alpha})`,
  };
}

export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme();
  const [theme, setTheme] = useState<ChartTheme>(() => readTheme());

  // Re-read after next-themes has applied the class for the resolved theme
  useEffect(() => {
    const id = requestAnimationFrame(() => setTheme(readTheme()));
    return () => cancelAnimationFrame(id);
  }, [resolvedTheme]);

  // …and whenever the class on <html> changes for any other reason
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(readTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return theme;
}

/** Canvas font stacks matching the site typography */
export const CHART_FONT = {
  mono: "'JetBrains Mono', ui-monospace, monospace",
  display: "'Barlow Condensed', 'Barlow', sans-serif",
  body: "'Barlow', system-ui, sans-serif",
};

/* ── Shared control styles for the event page ─────────────────── */

/** Toggle chip (filters, presets). Active = filled foreground, like a timing-screen selector. */
export function chip(active: boolean, extra = ""): string {
  return [
    "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border px-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors",
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground",
    extra,
  ].join(" ");
}

/** Compact outline action button (PDF, Session summary…) */
export const toolButton =
  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border bg-card px-3 font-display text-xs font-semibold uppercase tracking-[0.1em] text-foreground transition-colors hover:border-foreground/40 hover:bg-accent disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5";

/** Segmented control wrapper + item */
export const segWrap = "inline-flex min-w-0 max-w-full overflow-x-auto rounded-sm border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
export function segItem(active: boolean): string {
  return [
    "h-7 shrink-0 whitespace-nowrap px-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors [&+&]:border-l",
    active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
  ].join(" ");
}
