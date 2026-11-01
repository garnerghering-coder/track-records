import { ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { classLabel, getClassColor } from "@/lib/classes";
import FlagImage from "@/components/FlagImage";

/* ── Layout ───────────────────────────────────────────────────── */

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-10", className)}>{children}</main>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("eyebrow flex flex-wrap items-center gap-x-2 gap-y-1", className)}>{children}</div>;
}

export function SectionHead({
  eyebrow,
  title,
  to,
  action,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  to?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex items-end justify-between gap-6", className)}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
        <h2 className="display text-[2.1rem] sm:text-[2.6rem]">{title}</h2>
      </div>
      {action}
      {to && (
        <Link to={to} className="group mb-1.5 flex shrink-0 items-center gap-1 text-sm text-ink-2 hover:text-ink">
          <span className="link-u">See all</span>
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

/* ── Class ────────────────────────────────────────────────────── */

export function ClassTag({ name, color, className, solid }: { name?: string | null; color?: string | null; className?: string; solid?: boolean }) {
  if (!name) return null;
  const c = color || getClassColor(name);
  return (
    <span
      className={cn("inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em]", className)}
      style={solid ? { backgroundColor: c, color: "#fff" } : { backgroundColor: `${c}1f`, color: "inherit", boxShadow: `inset 0 0 0 1px ${c}55` }}
    >
      {!solid && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />}
      {classLabel(name)}
    </span>
  );
}

/* ── Numbers ──────────────────────────────────────────────────── */

export function PosNum({ n, size = "md", className }: { n: number | string | null | undefined; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const sz = { sm: "text-base", md: "text-2xl", lg: "text-5xl", xl: "text-[5.5rem] leading-[0.8]" }[size];
  return <span className={cn("font-accent tabular-nums leading-none", sz, className)}>{n ?? "—"}</span>;
}

export function CarNum({ n, className }: { n?: string | number | null; className?: string }) {
  if (n == null) return null;
  return (
    <span className={cn("num inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded-md border bg-sheet px-1.5 text-[12px] font-medium", className)}>
      {n}
    </span>
  );
}

/** Animated count-up for headline numbers (respects reduced motion). */
export function Ticker({ value, className, format }: { value: number; className?: string; format?: (n: number) => string }) {
  const [v, setV] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || from === value) {
      setV(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 700);
      setV(Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{format ? format(v) : v.toLocaleString()}</span>;
}

/* ── People ───────────────────────────────────────────────────── */

export function DriverLink({ id, name, nationality, className, flag = true }: { id: string; name: string; nationality?: string | null; className?: string; flag?: boolean }) {
  return (
    <Link to={`/driver/${id}`} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap hover:underline hover:decoration-1 hover:underline-offset-4", className)}>
      {flag && nationality && <FlagImage nationality={nationality} size={14} className="rounded-[2px]" />}
      {name}
    </Link>
  );
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const ini = name
    .replace(/\s*\(R\)\s*$/i, "")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <span className={cn("display inline-flex items-center justify-center rounded-full bg-ink text-paper", className)} aria-hidden>
      {ini}
    </span>
  );
}

/* ── Imagery ──────────────────────────────────────────────────── */

export function Livery({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  const [ok, setOk] = useState(!!src);
  if (!src || !ok) return null;
  return <img src={src} alt={alt} loading="lazy" onError={() => setOk(false)} className={cn("pointer-events-none select-none object-contain", className)} />;
}

export function TrackMap({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  const [ok, setOk] = useState(!!src);
  if (!src || !ok) return null;
  return <img src={src} alt={alt} loading="lazy" onError={() => setOk(false)} className={cn("logo-adapt pointer-events-none select-none object-contain", className)} />;
}

/* ── Data viz ─────────────────────────────────────────────────── */

export function Sparkline({ values, className, color = "currentColor", height = 28 }: { values: number[]; className?: string; color?: string; height?: number }) {
  if (values.length < 2) return null;
  const w = 100;
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${height - ((v - min) / (max - min || 1)) * (height - 2) - 1}`);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cn("h-7 w-full", className)} aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={w} cy={pts[pts.length - 1].split(",")[1]} r="2.2" fill={color} />
    </svg>
  );
}

/* ── States ───────────────────────────────────────────────────── */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-ink/[0.06]", className)} />;
}

export function Note({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-dashed px-6 py-10 text-center", className)}>
      <div className="display text-2xl">{title}</div>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-ink-2">{children}</div>}
    </div>
  );
}

/* ── Tabs ─────────────────────────────────────────────────────── */

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode; disabled?: boolean }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-full border bg-sheet p-1 [scrollbar-width:none]", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          disabled={it.disabled}
          onClick={() => onChange(it.value)}
          className={cn(
            "h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition-colors disabled:opacity-35",
            value === it.value ? "bg-ink text-paper" : "text-ink-2 hover:bg-ink/[0.06] hover:text-ink",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ── Dates ────────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dateRange(a?: string | null, b?: string | null) {
  if (!a) return "";
  const d1 = new Date(a + (a.length === 10 ? "T12:00:00" : ""));
  const d2 = b ? new Date(b + (b.length === 10 ? "T12:00:00" : "")) : null;
  const m1 = MONTHS[d1.getMonth()];
  if (!d2 || d2.toDateString() === d1.toDateString()) return `${m1} ${d1.getDate()}, ${d1.getFullYear()}`;
  const m2 = MONTHS[d2.getMonth()];
  return m1 === m2 ? `${m1} ${d1.getDate()}–${d2.getDate()}, ${d2.getFullYear()}` : `${m1} ${d1.getDate()} – ${m2} ${d2.getDate()}, ${d2.getFullYear()}`;
}
