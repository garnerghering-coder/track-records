/**
 * Building blocks shared by the record pages (driver, team, car, compare and
 * the directories). Visual language follows src/pages/Index.tsx.
 */
import { ReactNode, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, Search, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ClassTag, Eyebrow, PosNum, Skeleton, Ticker } from "@/site/ui";
import { fmtDay, fmtDayShort, raceTitle, resultLabel, isWin, isPodium, type Entry, type ShapeAxis } from "@/site/records";

/* ── Tones: A = ink, B = the second voice in comparisons ───────── */

export const TONE_A = "text-ink";
export const TONE_B = "text-[#5f6f00] dark:text-[#b3c25e]";

/* ── Record strip ─────────────────────────────────────────────── */

export interface StripItem {
  label: string;
  value: number | string | null;
  sub?: ReactNode;
  fmt?: (n: number) => string;
  hint?: string;
}

export function RecordStrip({ items, className }: { items: StripItem[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-3xl border bg-rule sm:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]",
        items.length % 2 === 1 && "[&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1",
        className,
      )}
    >
      {items.map((it) => (
        <div key={it.label} className="bg-sheet px-5 py-5 sm:py-6" title={it.hint}>
          <dt className="eyebrow">{it.label}</dt>
          <dd className="mt-2">
            <span className="num block text-[1.9rem] leading-none sm:text-[2.2rem]">
              {it.value == null ? <span className="text-ink-3">—</span> : typeof it.value === "number" ? <Ticker value={it.value} format={it.fmt} /> : it.value}
            </span>
            {it.sub && <span className="mt-1.5 block truncate text-xs text-ink-3">{it.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Result marks (timeline, compare, rows) ───────────────────── */

function markClass(e: Entry) {
  if (e.status === "dns") return "border border-dashed border-ink-3/60 text-ink-3 bg-transparent";
  if (e.status === "dnf") return "border border-loss/60 text-loss bg-loss/[0.06]";
  if (isWin(e)) return "bg-ink text-paper";
  if (isPodium(e)) return "border-[1.5px] border-ink text-ink bg-sheet";
  return "bg-ink/[0.08] text-ink-2";
}

export function ResultMark({ e, className }: { e: Entry; className?: string }) {
  return (
    <span className={cn("inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 font-accent text-[12px] leading-none tabular-nums", markClass(e), className)}>
      {e.status === "dnf" ? "×" : e.status === "dns" ? "–" : e.pic ?? e.position ?? "?"}
    </span>
  );
}

export function MarkLegend({ className }: { className?: string }) {
  const items = [
    { c: "bg-ink", l: "Class win" },
    { c: "border-[1.5px] border-ink bg-sheet", l: "Podium" },
    { c: "bg-ink/[0.12]", l: "Finished" },
    { c: "border border-loss/60 bg-loss/[0.06]", l: "Did not finish" },
  ];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-3", className)}>
      {items.map((i) => (
        <span key={i.l} className="inline-flex items-center gap-1.5">
          <span className={cn("h-3 w-3 rounded-full", i.c)} />
          {i.l}
        </span>
      ))}
    </div>
  );
}

/* ── Career timeline ──────────────────────────────────────────── */

export interface Lane {
  id: string;
  title: ReactNode;
  sub?: ReactNode;
  year: number;
  rows: Entry[];
}

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function yearFrac(d: string) {
  const [y, m, dd] = d.split("-").map(Number);
  const t = Date.UTC(y, m - 1, dd);
  const a = Date.UTC(y, 0, 1);
  const b = Date.UTC(y + 1, 0, 1);
  return (t - a) / (b - a);
}

/** Seasons as lanes, one mark per race; hover/focus fills the readout. */
export function Timeline({ lanes, describe }: { lanes: Lane[]; describe: (e: Entry) => ReactNode }) {
  const all = lanes.flatMap((l) => l.rows);
  const latest = all.reduce<Entry | null>((b, e) => (!b || e.raceDate > b.raceDate ? e : b), null);
  const [active, setActive] = useState<string | null>(null);
  const cur = all.find((e) => e.key === active) || latest;

  const placed = useMemo(
    () =>
      lanes.map((l) => {
        const rows = [...l.rows].sort((a, b) => a.raceDate.localeCompare(b.raceDate) || a.sessionName.localeCompare(b.sessionName));
        const lastX: number[] = [];
        const marks = rows.map((e) => {
          const x = Math.min(0.985, Math.max(0.015, yearFrac(e.raceDate)));
          let row = 0;
          while (lastX[row] != null && x - lastX[row] < 0.045) row++;
          lastX[row] = x;
          return { e, x, row };
        });
        return { lane: l, marks, rows: Math.max(1, ...marks.map((m) => m.row + 1)) };
      }),
    [lanes],
  );

  return (
    <div className="overflow-hidden rounded-3xl border bg-sheet">
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <div className="min-w-[600px]">
          {/* month ruler */}
          <div className="grid grid-cols-[5.5rem_1fr] border-b sm:grid-cols-[10rem_1fr]">
            <div className="sticky left-0 z-10 bg-sheet" />
            <div className="relative h-9">
              {MONTH_SHORT.map((m, i) => (
                <span key={i} className="absolute top-3 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3" style={{ left: `calc(${(i / 12) * 100}% + 6px)` }}>
                  <span className="hidden md:inline">{m}</span>
                  <span className="md:hidden">{MONTH_INITIALS[i]}</span>
                </span>
              ))}
            </div>
          </div>
          {placed.map(({ lane, marks, rows }) => (
            <div key={lane.id} className="grid grid-cols-[5.5rem_1fr] border-b last:border-b-0 sm:grid-cols-[10rem_1fr]">
              <div className="sticky left-0 z-10 flex flex-col justify-center border-r bg-sheet px-3 py-4 sm:px-5">
                <div className="display text-[1.6rem] leading-none sm:text-[1.9rem]">{lane.title}</div>
                {lane.sub && <div className="eyebrow mt-1.5 truncate">{lane.sub}</div>}
              </div>
              <div className="relative" style={{ height: 24 + rows * 40 }}>
                {Array.from({ length: 11 }, (_, i) => (
                  <span key={i} className="absolute inset-y-0 w-px bg-rule/70" style={{ left: `${((i + 1) / 12) * 100}%` }} />
                ))}
                <span className="absolute inset-x-0 h-px bg-rule" style={{ top: 32 }} />
                {marks.map(({ e, x, row }) => (
                  <Link
                    key={e.key}
                    to={`/events/${e.eventId}`}
                    onMouseEnter={() => setActive(e.key)}
                    onFocus={() => setActive(e.key)}
                    aria-label={`${raceTitle(e)}, ${fmtDay(e.raceDate)}: ${resultLabel(e)}${e.className ? ` in ${e.className}` : ""}`}
                    className={cn(
                      "absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-sheet transition-transform duration-200 hover:scale-110 focus-visible:scale-110",
                      cur?.key === e.key && "z-10 scale-110 ring-2 ring-hl ring-offset-2 ring-offset-sheet",
                    )}
                    style={{ left: `${x * 100}%`, top: 32 + row * 40 }}
                  >
                    <ResultMark e={e} />
                    <span className="absolute -bottom-1.5 left-1/2 h-[3px] w-3 -translate-x-1/2 rounded-full" style={{ backgroundColor: e.classColor }} />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* readout */}
      {cur && (
        <div className="flex flex-col gap-3 border-t bg-paper/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6" aria-live="polite">
          <div className="flex min-w-0 items-center gap-4">
            <ResultMark e={cur} className="h-10 min-w-10 text-base" />
            <div className="min-w-0">
              <div className="eyebrow">{fmtDay(cur.raceDate)}{cur.key === latest?.key && !active ? " · latest" : ""}</div>
              <Link to={`/events/${cur.eventId}`} className="display mt-0.5 block truncate text-[1.45rem] leading-tight hover:underline hover:decoration-1 hover:underline-offset-4">
                {raceTitle(cur)}
              </Link>
            </div>
          </div>
          <div className="text-sm text-ink-2 sm:text-right">{describe(cur)}</div>
        </div>
      )}
    </div>
  );
}

/* ── Shape radar ──────────────────────────────────────────────── */

export interface ShapeSeries {
  axes: ShapeAxis[];
  tone: string; // text colour class (uses currentColor)
  dashed?: boolean;
  label?: string;
}

export function ShapeRadar({ series, className, showValues = true }: { series: ShapeSeries[]; className?: string; showValues?: boolean }) {
  const axes = series[0]?.axes ?? [];
  const n = axes.length;
  const S = 360;
  const c = S / 2;
  const R = 112;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [c + Math.cos(a) * R * (v / 100), c + Math.sin(a) * R * (v / 100)] as const;
  };
  const ring = (v: number) => axes.map((_, i) => pt(i, v).join(",")).join(" ");
  const anyValue = series.some((s) => s.axes.some((a) => a.value != null));

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className={cn("h-auto w-full overflow-visible", className)} role="img" aria-label={series.map((s) => `${s.label ? s.label + ": " : ""}${s.axes.map((a) => `${a.label} ${a.value ?? "no data"}`).join(", ")}`).join(". ")}>
      {[25, 50, 75, 100].map((v) => (
        <polygon key={v} points={ring(v)} fill="none" className="stroke-rule" strokeWidth={v === 100 ? 1.2 : 1} strokeDasharray={v === 50 ? "3 4" : undefined} />
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 100);
        return <line key={a.key} x1={c} y1={c} x2={x} y2={y} className="stroke-rule" strokeWidth={1} />;
      })}
      {series.map((s, si) => {
        const known = s.axes.map((a, i) => ({ a, i })).filter((p) => p.a.value != null);
        if (!known.length) return null;
        const pts = known.map(({ a, i }) => pt(i, Math.max(4, a.value!)));
        return (
          <g key={si} className={cn(s.tone, "origin-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50 motion-safe:duration-700")} style={{ transformOrigin: `${c}px ${c}px` }}>
            {pts.length >= 3 && <polygon points={pts.map((p) => p.join(",")).join(" ")} fill="currentColor" fillOpacity={si === 0 ? 0.1 : 0.16} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeDasharray={s.dashed ? "6 4" : undefined} />}
            {pts.length === 2 && <line x1={pts[0][0]} y1={pts[0][1]} x2={pts[1][0]} y2={pts[1][1]} stroke="currentColor" strokeWidth={2} strokeDasharray="6 4" />}
            {pts.map((p, k) => (
              <circle key={k} cx={p[0]} cy={p[1]} r={4} fill="currentColor" className="stroke-sheet" strokeWidth={2} />
            ))}
          </g>
        );
      })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 128);
        const anchor = Math.abs(x - c) < 8 ? "middle" : x > c ? "start" : "end";
        const dy = y < c - 40 ? -6 : y > c + 40 ? 14 : 4;
        const vals = series.map((s) => s.axes[i]?.value);
        return (
          <g key={a.key}>
            <text x={x} y={y + dy} textAnchor={anchor} className={cn("font-mono text-[10px] uppercase tracking-[0.14em]", vals.some((v) => v != null) ? "fill-ink-2" : "fill-ink-3")}>
              {a.short}
            </text>
            {showValues && (
              <text x={x} y={y + dy + 15} textAnchor={anchor} className="font-mono text-[12px]">
                {vals.map((v, k) => (
                  <tspan key={k} className={v == null ? "fill-ink-3" : cn(series[k].tone, "fill-current")}>
                    {k > 0 ? "  " : ""}
                    {v == null ? "—" : Math.round(v)}
                  </tspan>
                ))}
              </text>
            )}
          </g>
        );
      })}
      {!anyValue && (
        <text x={c} y={c + 4} textAnchor="middle" className="fill-ink-3 font-mono text-[10px] uppercase tracking-[0.14em]">
          Shape still forming
        </text>
      )}
    </svg>
  );
}

/* ── Share ─────────────────────────────────────────────────────── */

export function ShareButton({ title, text, className, label = "Share record" }: { title: string; text?: string; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
      toast("Link copied", { description: "Paste it anywhere to share this record." });
    } catch {
      toast("Couldn't copy the link", { description: url });
    }
  };
  return (
    <button
      type="button"
      onClick={share}
      className={cn("inline-flex h-12 items-center gap-2.5 rounded-full bg-ink pl-2 pr-6 text-[15px] font-medium text-paper transition-transform hover:scale-[1.02] active:scale-[0.99]", className)}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-paper/15">{done ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}</span>
      {done ? "Copied" : label}
    </button>
  );
}

export function GhostLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={cn("group inline-flex h-12 items-center gap-2 rounded-full border px-6 text-[15px] transition-colors hover:bg-ink/[0.05]", className)}>
      {children}
      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}

/* ── Results list ─────────────────────────────────────────────── */

/** One race, from the point of view of one car entry. */
export function ResultRow({ e, primary, secondary, compact }: { e: Entry; primary?: ReactNode; secondary?: ReactNode; compact?: boolean }) {
  return (
    <li className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b py-4 last:border-b-0 sm:grid-cols-[4.5rem_minmax(0,1.3fr)_minmax(0,1fr)_6.5rem] sm:gap-x-6">
      <div className="hidden num text-xs text-ink-3 sm:block">{fmtDayShort(e.raceDate)}</div>
      <div className="min-w-0">
        <Link to={`/events/${e.eventId}`} className="display block truncate text-[1.35rem] leading-tight hover:underline hover:decoration-1 hover:underline-offset-4">
          {raceTitle(e)}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
          <span className="sm:hidden">{fmtDayShort(e.raceDate)} ·</span>
          {e.circuitName && <span className="truncate">{e.circuitName}</span>}
          {e.endurance && <span className="rounded-full border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.1em]">Endurance</span>}
        </div>
      </div>
      <div className={cn("col-span-1 row-start-2 min-w-0 text-sm sm:col-auto sm:row-auto", compact && "hidden sm:block")}>
        <div className="flex min-w-0 items-center gap-2">
          <ClassTag name={e.className} color={e.classColor} />
          <span className="num shrink-0 text-xs text-ink-3">#{e.carNumber}</span>
          <span className="truncate text-ink-2">{primary}</span>
        </div>
        {secondary && <div className="mt-1 truncate text-xs text-ink-3">{secondary}</div>}
      </div>
      <div className="row-span-2 text-right sm:row-auto">
        <ResultCell e={e} />
      </div>
    </li>
  );
}

export function ResultCell({ e, align = "right" }: { e: Entry; align?: "left" | "right" }) {
  if (e.status === "dnf" || e.status === "dns")
    return (
      <div className={align === "right" ? "text-right" : ""}>
        <span className={cn("font-mono text-sm font-medium tracking-wide", e.status === "dnf" ? "text-loss" : "text-ink-3")}>{e.status.toUpperCase()}</span>
        <div className="num mt-0.5 text-[11px] text-ink-3">{e.laps != null ? `${e.laps} laps` : ""}</div>
      </div>
    );
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <PosNum n={e.pic ?? e.position} size="md" />
      <div className="num mt-0.5 text-[11px] text-ink-3">
        {e.classSize > 1 ? `of ${e.classSize}` : ""}
        {e.position != null && e.fieldSize > e.classSize ? ` · P${e.position} ovr` : ""}
      </div>
    </div>
  );
}

/* ── Season block heading ─────────────────────────────────────── */

export function SeasonHead({ year, series, right }: { year: number; series: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-ink/80 pb-3 pt-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="display text-[2.4rem] leading-none">{year}</span>
        <span className="eyebrow min-w-0 truncate">{series}</span>
      </div>
      {right && <div className="text-xs text-ink-3 sm:shrink-0 sm:text-right">{right}</div>}
    </div>
  );
}

/* ── Directory controls ───────────────────────────────────────── */

export function SearchField({ value, onChange, placeholder, className, inputRef }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string; inputRef?: React.Ref<HTMLInputElement> }) {
  return (
    <label className={cn("relative flex h-12 items-center rounded-full border bg-sheet pl-11 pr-3 transition-colors focus-within:border-ink/40", className)}>
      <Search className="absolute left-4 h-4 w-4 text-ink-3" aria-hidden />
      <span className="sr-only">{placeholder}</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
        type="search"
        autoComplete="off"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear search" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-ink/[0.06] hover:text-ink">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </label>
  );
}

export function Chip({ active, onClick, children, dot }: { active: boolean; onClick: () => void; children: ReactNode; dot?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] transition-colors",
        active ? "border-ink bg-ink text-paper" : "bg-sheet text-ink-2 hover:border-ink/30 hover:text-ink",
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />}
      {children}
    </button>
  );
}

/* ── Page states ──────────────────────────────────────────────── */

export function RecordSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading record">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-6 h-20 w-4/5 sm:h-28" />
          <Skeleton className="mt-6 h-5 w-full max-w-lg" />
          <Skeleton className="mt-2 h-5 w-2/3 max-w-md" />
          <div className="mt-8 flex gap-3">
            <Skeleton className="h-12 w-40 rounded-full" />
            <Skeleton className="h-12 w-40 rounded-full" />
          </div>
        </div>
        <Skeleton className="aspect-[16/10] w-full rounded-[28px]" />
      </div>
      <Skeleton className="mt-12 h-28 rounded-3xl" />
      <Skeleton className="mt-16 h-64 rounded-3xl" />
    </div>
  );
}

export function NotOnRecord({ what, back, backLabel }: { what: string; back: string; backLabel: string }) {
  return (
    <div className="py-16 sm:py-24">
      <Eyebrow>Not on the record</Eyebrow>
      <h1 className="display mt-4 max-w-2xl text-5xl leading-[0.95] sm:text-7xl">
        We can't find that <em>{what}</em>.
      </h1>
      <p className="mt-5 max-w-md text-ink-2">The link may be old, or the {what} was merged into another record.</p>
      <GhostLink to={back} className="mt-8">
        {backLabel}
      </GhostLink>
    </div>
  );
}

/** Hero imagery: livery over a class-tinted field with the car number ghosted behind. */
export function LiveryStage({ src, number, color, alt, className, caption }: { src?: string; number?: string | null; color?: string; alt: string; className?: string; caption?: ReactNode }) {
  const [ok, setOk] = useState(true);
  return (
    <figure className={cn("relative", className)}>
      <div className="relative aspect-[16/10] overflow-hidden rounded-[28px]" style={{ background: `radial-gradient(120% 90% at 70% 60%, ${color || "#888"}2e, transparent 65%)` }}>
        {number && <span className="pointer-events-none absolute -right-3 -top-6 select-none font-accent text-[11rem] leading-none text-ink/[0.06] sm:text-[15rem]">{number}</span>}
        {src && ok ? (
          <img
            src={src}
            alt={alt}
            onError={() => setOk(false)}
            className="absolute inset-0 m-auto w-[94%] select-none object-contain drop-shadow-[0_30px_28px_rgba(0,0,0,0.28)] transition-transform duration-700 hover:-translate-x-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-8 motion-safe:duration-700"
          />
        ) : (
          <div className="absolute inset-0 flex items-end p-6">
            <span className="eyebrow">No livery on file</span>
          </div>
        )}
      </div>
      {caption && <figcaption className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-ink-3">{caption}</figcaption>}
    </figure>
  );
}

/* ── Card used by the team and car directories ────────────────── */

export function RecordCard({
  to,
  livery,
  number,
  tint,
  eyebrow,
  title,
  tags,
  stats,
}: {
  to: string;
  livery?: string;
  number?: string | null;
  tint?: string;
  eyebrow: ReactNode;
  title: ReactNode;
  tags?: ReactNode;
  stats: { label: string; value: number | string }[];
}) {
  const [ok, setOk] = useState(true);
  return (
    <Link
      to={to}
      className="group flex flex-col overflow-hidden rounded-3xl border bg-sheet transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(0,0,0,0.35)] motion-reduce:hover:translate-y-0"
    >
      <div className="relative h-36 overflow-hidden" style={{ background: `linear-gradient(135deg, ${tint || "#888"}26, transparent 70%)` }}>
        {number && <span className="absolute -bottom-6 -right-2 font-accent text-[7rem] leading-none text-ink/[0.06]">{number}</span>}
        {livery && ok ? (
          <img
            src={livery}
            alt=""
            loading="lazy"
            onError={() => setOk(false)}
            className="absolute inset-x-4 bottom-2 m-auto h-28 w-[88%] object-contain transition-transform duration-500 group-hover:-translate-x-2 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="eyebrow absolute bottom-4 left-5">No livery on file</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="display mt-2 text-[1.75rem] leading-[1.02] decoration-1 underline-offset-4 group-hover:underline">{title}</h3>
        {tags && <div className="mt-3 flex flex-wrap gap-1.5">{tags}</div>}
        <div className="h-5 shrink-0" />
        <dl className="mt-auto grid grid-cols-3 gap-2 border-t pt-4">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-3">{s.label}</dt>
              <dd className="num mt-1 text-lg leading-none">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Link>
  );
}

/* ── Results grouped by race (teams and cars run several entries) ── */

export function RaceGroups({ races, line, head }: { races: Entry[][]; line: (e: Entry) => ReactNode; head?: (rows: Entry[]) => ReactNode }) {
  return (
    <ul>
      {races.map((rows) => {
        const e = rows[0];
        return (
          <li key={e.sessionId} className="grid gap-x-6 gap-y-3 border-b py-5 last:border-b-0 sm:grid-cols-[4.5rem_minmax(0,0.9fr)_minmax(0,1.4fr)]">
            <div className="num hidden pt-1.5 text-xs text-ink-3 sm:block">{fmtDayShort(e.raceDate)}</div>
            <div className="min-w-0">
              <Link to={`/events/${e.eventId}`} className="display block truncate text-[1.35rem] leading-tight hover:underline hover:decoration-1 hover:underline-offset-4">
                {raceTitle(e)}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                <span className="sm:hidden">{fmtDayShort(e.raceDate)} ·</span>
                {e.circuitName && <span className="truncate">{e.circuitName}</span>}
              </div>
              {head && <div className="mt-2 text-xs text-ink-3">{head(rows)}</div>}
            </div>
            <ul className="min-w-0 space-y-2.5">
              {rows.map((r) => (
                <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0 text-sm">{line(r)}</div>
                  <ResultCell e={r} />
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
