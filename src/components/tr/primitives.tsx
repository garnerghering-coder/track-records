import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClassColor } from "@/lib/classes";

/* ── Page header ──────────────────────────────────────────────── */
export function PageHeader({
  kicker,
  title,
  meta,
  actions,
  children,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("relative border-b bg-card/40", className)}>
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="container relative py-8 md:py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            {kicker && <div className="label-caps mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">{kicker}</div>}
            <h1 className="font-display text-3xl font-bold uppercase leading-[1.05] tracking-tight text-foreground sm:text-4xl md:text-[2.75rem]">
              {title}
            </h1>
            {meta && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">{meta}</div>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

/* ── Section header ───────────────────────────────────────────── */
export function SectionHeader({
  title,
  kicker,
  to,
  linkLabel = "View all",
  right,
  className,
}: {
  title: ReactNode;
  kicker?: ReactNode;
  to?: string;
  linkLabel?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-end justify-between gap-4 border-b pb-2.5", className)}>
      <div className="min-w-0">
        {kicker && <div className="label-caps mb-1">{kicker}</div>}
        <h2 className="font-display text-xl font-bold uppercase tracking-wide text-foreground">{title}</h2>
      </div>
      {right}
      {to && (
        <Link
          to={to}
          className="group flex shrink-0 items-center gap-0.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {linkLabel}
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

/* ── Class badge ──────────────────────────────────────────────── */
export function ClassBadge({ name, color, className }: { name: string; color?: string | null; className?: string }) {
  const c = color || getClassColor(name);
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-sm border px-1.5 font-display text-[11px] font-bold uppercase tracking-wider",
        className,
      )}
      style={{ borderColor: `${c}66`, color: c, backgroundColor: `${c}14` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
      {name}
    </span>
  );
}

/* ── Position cell ────────────────────────────────────────────── */
export function Pos({ value, className }: { value: number | string | null | undefined; className?: string }) {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  const podium = n === 1 ? "bg-signal text-signal-foreground" : n === 2 || n === 3 ? "bg-foreground/90 text-background" : "text-foreground";
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded-sm px-1 font-accent text-sm leading-none",
        Number.isFinite(n) && n <= 3 ? podium : "",
        className,
      )}
    >
      {value ?? "—"}
    </span>
  );
}

/* ── Stat block ───────────────────────────────────────────────── */
export function Stat({
  label,
  value,
  sub,
  accent,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 bg-card px-4 py-3.5", className)}>
      <div className="label-caps truncate">{label}</div>
      <div className={cn("mt-1 font-accent text-3xl leading-none", accent ? "text-primary" : "text-foreground")}>{value}</div>
      {sub && <div className="mt-1.5 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Row of stats separated by hairlines */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-px overflow-hidden rounded border bg-border", className)}>{children}</div>;
}

/* ── Panel ────────────────────────────────────────────────────── */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded border bg-card", className)}>{children}</div>;
}

/* ── Empty state ──────────────────────────────────────────────── */
export function EmptyState({ title, children, icon }: { title: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded border border-dashed px-6 py-12 text-center">
      {icon && <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center text-muted-foreground">{icon}</div>}
      <div className="font-display text-base font-semibold uppercase tracking-wide text-foreground">{title}</div>
      {children && <div className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

/* ── Loading skeleton rows ────────────────────────────────────── */
export function RowsSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("divide-y rounded border", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-12 items-center gap-4 px-4">
          <div className="h-3 w-6 animate-pulse rounded-sm bg-muted" />
          <div className="h-3 flex-1 animate-pulse rounded-sm bg-muted" style={{ maxWidth: `${40 + ((i * 17) % 40)}%` }} />
          <div className="h-3 w-16 animate-pulse rounded-sm bg-muted" />
        </div>
      ))}
    </div>
  );
}

/* ── Filter input (search box used on listing pages) ──────────── */
export { default as FilterInput } from "./FilterInput";
