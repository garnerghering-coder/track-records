/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Small building blocks shared by the entity profile pages
 * (driver / team / car / circuit). Presentation only.
 */
import { Fragment, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Link2, Share2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FlagImage from "@/components/FlagImage";
import { ClassBadge, EmptyState, Pos, RowsSkeleton } from "@/components/tr/primitives";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getClassColor } from "@/lib/classes";
import { shortName } from "@/lib/race-data";
import { formatDateRange } from "@/lib/date-utils";

/** Compact outlined action button (Copy link, etc.) */
export const actionBtn =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded border bg-card px-3 font-display text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition-colors hover:border-foreground/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0";

/* ── Share / copy link ─────────────────────────────────────────── */
export function ShareButton({ title, text }: { title: string; text?: string }) {
  const { toast } = useToast();
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: url });
    } catch {
      toast({ title: "Couldn't copy link", description: url, variant: "destructive" });
    }
  };

  const onClick = async () => {
    const url = window.location.href;
    if (canShare) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e: any) {
        if (e?.name === "AbortError") return; // user dismissed the share sheet
      }
    }
    copy(url);
  };

  return (
    <button type="button" onClick={onClick} className={actionBtn}>
      {canShare ? <Share2 /> : <Link2 />}
      {canShare ? "Share" : "Copy link"}
    </button>
  );
}

/* ── Loading / not found shells ───────────────────────────────── */
export function ProfileLoading() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="border-b bg-card/40">
        <div className="container py-8 md:py-10">
          <div className="h-3 w-24 animate-pulse rounded-sm bg-muted" />
          <div className="mt-3 h-9 w-2/3 max-w-md animate-pulse rounded-sm bg-muted" />
          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded border bg-border sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[76px] bg-card" />
            ))}
          </div>
        </div>
      </section>
      <main className="container py-10">
        <RowsSkeleton rows={8} />
      </main>
    </div>
  );
}

export function ProfileNotFound({ what, backTo, backLabel }: { what: string; backTo: string; backLabel: string }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-16">
        <EmptyState title={`${what} not found`}>
          This record may have been merged or removed.{" "}
          <Link to={backTo} className="text-primary hover:underline">
            {backLabel}
          </Link>
        </EmptyState>
      </main>
      <Footer />
    </div>
  );
}

/* ── Result helpers ───────────────────────────────────────────── */
export const isRaceSessionType = (t?: string | null) => t === "race" || t === "endurance_race" || t === "sprint_race";

/** Class + position-in-class for a result row; falls back to overall position. */
export function classInfo(r: any): { cls: string | null; classPos: number | null; overall: number | null } {
  const ex = r?.extra_data && typeof r.extra_data === "object" ? r.extra_data : null;
  const cls: string | null = ex?.Class ? String(ex.Class) : null;
  const pic = ex?.PIC != null && ex.PIC !== "" ? Number(ex.PIC) : NaN;
  const overall = typeof r?.position === "number" ? r.position : null;
  return { cls, classPos: cls && Number.isFinite(pic) ? pic : overall, overall };
}

/** A car that never took the start (Al Kamel "Not Started"): not a start, no points. */
export const isNonStart = (r: { status?: string | null } | null | undefined) => r?.status === "dns";

/** A race result that counts as a classified finish. */
export const isClassified = (r: any) => r?.position != null && (!r.status || r.status === "finished" || r.status === "classified");

/** "Jan 24, 2026" from an ISO date or timestamp */
export function fmtDate(d?: string | null): string {
  if (!d) return "";
  const dt = new Date(d + (d.length === 10 ? "T00:00:00Z" : ""));
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Non-finished status rendered in timing colours. Renders nothing for a normal finish. */
export function StatusCell({ status }: { status?: string | null }) {
  if (!status || status === "finished") return null;
  const bad = status === "dnf" || status === "dns" || status === "dsq";
  return (
    <span className={cn("font-display text-xs font-bold uppercase tracking-wider", bad ? "text-dnf" : "text-muted-foreground")}>
      {status === "classified" ? "Classified" : status.toUpperCase()}
    </span>
  );
}

/** Count list used in "career record" style panels. */
export function CountList({
  title,
  items,
  empty = "—",
}: {
  title: ReactNode;
  items: { key: string; label: ReactNode; count?: number; sub?: ReactNode }[];
  empty?: ReactNode;
}) {
  return (
    <div className="min-w-0 bg-card">
      <div className="label-caps flex h-9 items-center border-b px-4">{title}</div>
      {items.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">{empty}</div>
      ) : (
        <ul className="divide-y">
          {items.map((it) => (
            <li key={it.key} className="flex min-h-[40px] items-center justify-between gap-3 px-4 py-2 text-sm">
              <div className="min-w-0">
                <div className="leading-snug">{it.label}</div>
                {it.sub && <div className="truncate text-xs text-muted-foreground">{it.sub}</div>}
              </div>
              {it.count != null && <span className="num shrink-0 text-xs text-muted-foreground">{it.count}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Format a season span like "2024 – 2026" or "2025". */
export function yearSpan(years: number[]): string {
  if (!years.length) return "—";
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? String(min) : `${min}–${max}`;
}

/* ── Entries: one row per car per race (drivers merged) ───────── */
export interface Entry {
  key: string;
  event: any;
  session: any;
  seasonId?: string;
  year?: number;
  carNumber: string | null;
  cls: string | null;
  classPos: number | null;
  overall: number | null;
  status: string | null;
  classified: boolean;
  drivers: { id: string; name: string; nationality?: string | null }[];
  team: { id: string; name: string } | null;
  car: { id: string; name: string } | null;
}

/**
 * Collapse per-driver race result rows into per-car entries.
 * Rows must carry `v2_sessions(... v2_events(...))`. Hourly sub-sessions of
 * endurance races are skipped (the parent session carries the classification).
 */
export function buildEntries(rows: any[], teamAlias?: Record<string, string>): Entry[] {
  const map = new Map<string, Entry>();
  for (const r of rows) {
    const session = r.v2_sessions;
    if (session?.parent_session_id) continue;
    const event = session?.v2_events;
    const key = `${session?.id ?? r.session_id}:${r.car_number ?? r.v2_drivers?.id ?? ""}`;
    let e = map.get(key);
    if (!e) {
      const ci = classInfo(r);
      const seasonId = event?.v2_seasons?.id;
      e = {
        key,
        event,
        session,
        seasonId,
        year: event?.v2_seasons?.year,
        carNumber: r.car_number ?? null,
        cls: ci.cls,
        classPos: ci.classPos,
        overall: ci.overall,
        status: r.status ?? null,
        classified: isClassified(r),
        drivers: [],
        team: r.v2_teams ? { id: r.v2_teams.id, name: (teamAlias && teamAlias[`${r.v2_teams.id}:${seasonId}`]) || r.v2_teams.full_name } : null,
        car: r.v2_cars ? { id: r.v2_cars.id, name: [r.v2_cars.manufacturer, r.v2_cars.model_name].filter(Boolean).join(" ") } : null,
      };
      map.set(key, e);
    }
    if (r.v2_drivers && !e.drivers.some((d) => d.id === r.v2_drivers.id))
      e.drivers.push({ id: r.v2_drivers.id, name: r.v2_drivers.full_name, nationality: r.v2_drivers.nationality });
  }
  return [...map.values()].sort(
    (a, b) =>
      (b.event?.start_date || "").localeCompare(a.event?.start_date || "") ||
      (b.session?.date || "").localeCompare(a.session?.date || "") ||
      (a.classPos ?? 999) - (b.classPos ?? 999),
  );
}

/** Honest aggregate numbers for a set of entries. */
export function entryStats(entries: Entry[]) {
  const fin = entries.filter((e) => e.classified && e.classPos != null);
  const wins = fin.filter((e) => e.classPos === 1).length;
  const podiums = fin.filter((e) => e.classPos! <= 3).length;
  const best = fin.reduce<Entry | null>((b, e) => (!b || e.classPos! < b.classPos! ? e : b), null);
  const bestCount = best ? fin.filter((e) => e.classPos === best.classPos).length : 0;
  const years = [...new Set(entries.map((e) => e.year).filter(Boolean))] as number[];
  const events = new Set(entries.map((e) => e.event?.id).filter(Boolean)).size;
  const classAware = entries.some((e) => e.cls);
  const dnfs = entries.filter((e) => e.status === "dnf").length;
  return { starts: entries.filter((e) => !isNonStart(e)).length, finishes: fin.length, wins, podiums, best, bestCount, years, events, classAware, dnfs };
}

/** Per-driver tallies across entries, sorted by starts. */
export function driverTallies(entries: Entry[]) {
  const m = new Map<string, { driver: Entry["drivers"][number]; starts: number; wins: number; podiums: number; best: number | null; years: Set<number> }>();
  for (const e of entries) {
    for (const d of e.drivers) {
      const t = m.get(d.id) ?? { driver: d, starts: 0, wins: 0, podiums: 0, best: null, years: new Set<number>() };
      if (!isNonStart(e)) t.starts++;
      if (e.year) t.years.add(e.year);
      if (e.classified && e.classPos != null) {
        if (e.classPos === 1) t.wins++;
        if (e.classPos <= 3) t.podiums++;
        if (t.best == null || e.classPos < t.best) t.best = e.classPos;
      }
      m.set(d.id, t);
    }
  }
  return [...m.values()].sort((a, b) => b.starts - a.starts || b.wins - a.wins || a.driver.name.localeCompare(b.driver.name));
}

/** Hairline table of per-car entries, grouped by season. `other` picks the team or car column. */
export function EntriesTable({
  entries,
  other,
  classColors,
}: {
  entries: Entry[];
  other: "team" | "car";
  classColors: Record<string, Record<string, string>>;
}) {
  const groups: { year: string; rows: Entry[] }[] = [];
  for (const e of entries) {
    const y = String(e.year ?? "—");
    const last = groups[groups.length - 1];
    if (last && last.year === y) last.rows.push(e);
    else groups.push({ year: y, rows: [e] });
  }
  return (
    <div className="overflow-hidden rounded border bg-card">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="hidden w-[7.5rem] sm:table-cell">Date</th>
              <th>Event</th>
              <th className="hidden w-12 text-right sm:table-cell">No.</th>
              <th className="hidden md:table-cell">Drivers</th>
              <th className="hidden lg:table-cell">{other === "team" ? "Team" : "Car"}</th>
              <th>Class</th>
              <th className="text-center">Pos</th>
              <th className="hidden text-right sm:table-cell">Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.year}>
                <tr className="hover:bg-transparent">
                  <td colSpan={8} className="!h-8 bg-muted/50">
                    <span className="label-caps num text-foreground">{g.year}</span>
                    <span className="label-caps ml-2">
                      · {g.rows.length} {g.rows.length === 1 ? "entry" : "entries"}
                    </span>
                  </td>
                </tr>
                {g.rows.map((e) => {
                  const date = fmtDate(e.session?.date) || (e.event?.start_date ? formatDateRange(e.event.start_date, e.event.end_date) : "—");
                  const otherLink =
                    other === "team"
                      ? e.team && (
                          <Link to={`/team/${e.team.id}`} className="hover:text-primary">
                            {e.team.name}
                          </Link>
                        )
                      : e.car && (
                          <Link to={`/car/${e.car.id}`} className="hover:text-primary">
                            {e.car.name}
                          </Link>
                        );
                  return (
                    <tr key={e.key}>
                      <td className="num hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell">{date}</td>
                      <td className="py-2 sm:min-w-[11rem]">
                        {e.event ? (
                          <Link to={`/events/${e.event.id}`} className="font-medium leading-snug hover:text-primary">
                            {e.event.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                        <div className="text-xs leading-snug text-muted-foreground">
                          <span className="num whitespace-nowrap sm:hidden">
                            {date}
                            {e.carNumber && <> · #{e.carNumber}</>} ·{" "}
                          </span>
                          {e.event?.v2_seasons?.v2_series?.short_name || e.event?.v2_seasons?.v2_series?.name}
                          {e.session?.name && e.session.name !== "Race" && <> · {e.session.name}</>}
                        </div>
                        {e.drivers.length > 0 && (
                          <div className="mt-0.5 text-xs text-muted-foreground md:hidden">{e.drivers.map((d) => shortName(d.name)).join(" / ")}</div>
                        )}
                      </td>
                      <td className="num hidden text-right font-semibold sm:table-cell">{e.carNumber ? `#${e.carNumber}` : "—"}</td>
                      <td className="hidden py-2 md:table-cell">
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {e.drivers.length === 0 && <span className="text-muted-foreground">—</span>}
                          {e.drivers.map((d) => (
                            <Link key={d.id} to={`/driver/${d.id}`} className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-primary">
                              <FlagImage nationality={d.nationality} size={14} />
                              {shortName(d.name)}
                            </Link>
                          ))}
                        </div>
                      </td>
                      <td className="hidden text-muted-foreground lg:table-cell">{otherLink || "—"}</td>
                      <td>
                        {e.cls ? <ClassBadge name={e.cls} color={getClassColor(e.cls, e.seasonId ? classColors[e.seasonId] : undefined)} /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="text-center">
                        <div className="inline-flex flex-col items-center">
                          <Pos value={e.classPos} />
                          {e.cls && e.overall != null && e.overall !== e.classPos && (
                            <span className="num mt-0.5 whitespace-nowrap text-[10px] leading-none text-muted-foreground">P{e.overall} OA</span>
                          )}
                          {e.status && e.status !== "finished" && (
                            <span className="mt-0.5 sm:hidden">
                              <StatusCell status={e.status} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap text-right sm:table-cell">
                        <StatusCell status={e.status} />
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Hairline table of drivers with their tallies. */
export function DriverTallyTable({ tallies, classAware }: { tallies: ReturnType<typeof driverTallies>; classAware: boolean }) {
  return (
    <div className="overflow-hidden rounded border bg-card">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Driver</th>
              <th className="w-16 text-right">Starts</th>
              <th className="w-16 text-right">{classAware ? "C. wins" : "Wins"}</th>
              <th className="hidden w-20 text-right sm:table-cell">Podiums</th>
              <th className="w-14 text-center">Best</th>
              <th className="hidden w-28 text-right md:table-cell">Seasons</th>
            </tr>
          </thead>
          <tbody>
            {tallies.map((t) => (
              <tr key={t.driver.id}>
                <td>
                  <Link to={`/driver/${t.driver.id}`} className="inline-flex items-center gap-2 font-medium hover:text-primary">
                    <FlagImage nationality={t.driver.nationality} size={16} />
                    {t.driver.name}
                  </Link>
                </td>
                <td className="num text-right">{t.starts}</td>
                <td className={cn("num text-right", t.wins > 0 ? "font-semibold text-primary" : "text-muted-foreground")}>{t.wins}</td>
                <td className={cn("num hidden text-right sm:table-cell", t.podiums > 0 ? "text-foreground" : "text-muted-foreground")}>{t.podiums}</td>
                <td className="text-center">
                  <Pos value={t.best} />
                </td>
                <td className="num hidden text-right text-xs text-muted-foreground md:table-cell">{yearSpan([...t.years])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
