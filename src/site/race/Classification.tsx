/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getClassColor } from "@/lib/classes";
import { classRank, fmtDuration, fmtLap, mergeStints, parseTime } from "@/lib/insights";
import { lastName, useLoad, useNames } from "@/site/data";
import { Livery, Skeleton, Tabs } from "@/site/ui";

type Kind = "race" | "qualifying" | "practice";
export const kindOf = (t: string): Kind => (t === "qualifying" ? "qualifying" : t === "practice" ? "practice" : "race");

interface CarRow {
  carNumber: string;
  className: string | null;
  pic: number;
  position: number;
  driverIds: string[];
  teamId: string | null;
  carId: string | null;
  laps: number | null;
  gap: string | null;
  best: number | null;
  status: string;
  points: number | null;
  pits: number | null;
}

async function loadSession(sessionId: string, kind: Kind): Promise<CarRow[]> {
  const table = kind === "race" ? "v2_race_results" : kind === "qualifying" ? "v2_qualifying_results" : "v2_practice_results";
  const { data } = await supabase.from(table as never).select("*").eq("session_id", sessionId).order("position");
  const by = new Map<string, CarRow>();
  for (const r of (data || []) as any[]) {
    const key = String(r.car_number ?? r.id);
    let c = by.get(key);
    const best = parseTime(r.fastest_lap_time ?? r.best_time ?? r.best_lap_time);
    if (!c) {
      c = {
        carNumber: key,
        className: r.extra_data?.Class ?? null,
        pic: Number(r.extra_data?.PIC) || r.position,
        position: r.position,
        driverIds: [],
        teamId: r.team_id ?? null,
        carId: r.car_id ?? null,
        laps: r.laps_completed ?? r.laps_run ?? r.laps ?? null,
        gap: r.gap_to_leader ?? r.gap_to_pole ?? r.gap_to_p1 ?? null,
        best,
        status: r.status || "",
        points: r.points ?? null,
        pits: r.pit_stops ?? null,
      };
      by.set(key, c);
    }
    if (r.driver_id && !c.driverIds.includes(r.driver_id)) c.driverIds.push(r.driver_id);
    if (best != null && (c.best == null || best < c.best)) c.best = best;
  }
  return [...by.values()].sort((a, b) => a.position - b.position);
}

async function loadDrilldown(sessionIds: string[]) {
  const [st, pt] = await Promise.all([
    supabase.from("v2_stints").select("session_id, car_number, driver_id, start_elapsed, end_elapsed, start_lap, end_lap").in("session_id", sessionIds),
    supabase.from("v2_pit_stops").select("session_id, car_number, driver_id, lap_number, stop_duration, pit_in_elapsed, pit_out_elapsed").in("session_id", sessionIds),
  ]);
  return { stints: mergeStints((st.data || []) as any[]), pits: (pt.data || []) as any[] };
}

export default function Classification({
  session,
  childIds,
  classColors,
  liveries,
  duration,
}: {
  session: { id: string; name: string; session_type: string };
  childIds: string[];
  classColors: Record<string, string>;
  liveries: Record<string, string>;
  duration: number | null;
}) {
  const kind = kindOf(session.session_type);
  const names = useNames();
  const rows = useLoad(`cls:${session.id}`, () => loadSession(session.id, kind)).data;
  const drill = useLoad(kind === "race" ? `drill:${session.id}` : null, () => loadDrilldown([session.id, ...childIds])).data;
  const [cls, setCls] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const classes = useMemo(() => [...new Set((rows || []).map((r) => r.className).filter(Boolean) as string[])].sort((a, b) => classRank(a) - classRank(b)), [rows]);
  const multi = classes.length > 1;
  const shown = (rows || []).filter((r) => !cls || r.className === cls).sort((a, b) => (cls ? a.pic - b.pic : a.position - b.position));
  const fastest = Math.min(...(rows || []).map((r) => r.best ?? Infinity));
  const color = (c: string | null) => (c ? classColors[c] || getClassColor(c) : "#71717a");

  if (!rows) return <Skeleton className="h-[480px]" />;
  if (!rows.length) return <p className="py-12 text-center text-ink-2">No classification was published for {session.name}.</p>;

  return (
    <div>
      {multi && (
        <Tabs
          className="mb-4"
          value={cls}
          onChange={setCls}
          items={[{ value: "", label: `All · ${rows.length}` }, ...classes.map((c) => ({ value: c, label: <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color(c) }} />{c} · {rows.filter((r) => r.className === c).length}</span> }))]}
        />
      )}
      <div className="overflow-hidden rounded-3xl border bg-sheet">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-b text-left font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                <th className="w-14 py-3 pl-5 font-normal">{cls || !multi ? "Pos" : "Pos"}</th>
                <th className="w-16 font-normal">Car</th>
                <th className="font-normal">Drivers</th>
                <th className="hidden font-normal lg:table-cell">Team</th>
                <th className="w-16 text-right font-normal">Laps</th>
                <th className="w-28 text-right font-normal">{kind === "race" ? "Gap" : "Best"}</th>
                {kind === "race" && <th className="hidden w-24 text-right font-normal md:table-cell">Fastest</th>}
                {kind === "race" && rows.some((r) => r.points != null) && <th className="hidden w-14 text-right font-normal md:table-cell">Pts</th>}
                <th className="w-10 pr-4" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const dnf = /dnf|retired|dns|dsq/i.test(r.status);
                const expandable = kind === "race" && !!drill;
                const isOpen = open === r.carNumber;
                return (
                  <Fragment key={r.carNumber}>
                    <tr
                      className={cn("border-b transition-colors last:border-0", expandable && "cursor-pointer hover:bg-ink/[0.03]", isOpen && "bg-ink/[0.03]", dnf && "text-ink-3")}
                      onClick={() => expandable && setOpen(isOpen ? null : r.carNumber)}
                    >
                      <td className="py-3 pl-5">
                        <span className="font-accent text-xl tabular-nums">{cls || !multi ? r.pic : r.position}</span>
                        {multi && !cls && <span className="num ml-1.5 text-[10px] text-ink-3">{r.pic}</span>}
                      </td>
                      <td>
                        <span className="num inline-flex h-6 min-w-[2.5rem] items-center justify-center rounded-md px-1.5 text-xs font-semibold text-white" style={{ backgroundColor: color(r.className) }}>
                          {r.carNumber}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-x-3">
                          {r.driverIds.map((id) => (
                            <Link key={id} to={`/driver/${id}`} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap hover:underline hover:underline-offset-4">
                              {lastName(names?.drivers[id]?.full_name) || "—"}
                            </Link>
                          ))}
                        </div>
                        <div className="truncate text-[12px] text-ink-3 lg:hidden">{r.teamId ? names?.teams[r.teamId]?.full_name : ""}</div>
                      </td>
                      <td className="hidden max-w-[240px] truncate text-ink-2 lg:table-cell">
                        {r.teamId && (
                          <Link to={`/team/${r.teamId}`} onClick={(e) => e.stopPropagation()} className="hover:underline hover:underline-offset-4">
                            {names?.teams[r.teamId]?.full_name}
                          </Link>
                        )}
                      </td>
                      <td className="num text-right">{r.laps ?? "—"}</td>
                      <td className="num text-right">
                        {kind === "race" ? (dnf ? <span className="font-sans text-xs uppercase tracking-wider text-loss">{r.status.toUpperCase()}</span> : r.position === 1 || (cls && r.pic === 1) ? "—" : r.gap || "—") : fmtLap(r.best)}
                      </td>
                      {kind === "race" && <td className={cn("num hidden text-right md:table-cell", r.best === fastest && "font-semibold text-fastest")}>{fmtLap(r.best)}</td>}
                      {kind === "race" && rows.some((x) => x.points != null) && <td className="num hidden text-right md:table-cell">{r.points ?? ""}</td>}
                      <td className="pr-4 text-right">{expandable && <ChevronDown className={cn("ml-auto h-4 w-4 text-ink-3 transition-transform", isOpen && "rotate-180")} />}</td>
                    </tr>
                    {isOpen && drill && (
                      <tr className="border-b bg-ink/[0.02]">
                        <td colSpan={9} className="px-5 py-5">
                          <CarDrill carNumber={r.carNumber} drill={drill} duration={duration} livery={liveries[r.carNumber]} names={names} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {kind === "race" && (
        <p className="mt-3 text-xs text-ink-3">
          <span className="font-semibold text-fastest">Purple</span> marks the fastest lap. Tap a car to see its stints and pit stops.
        </p>
      )}
    </div>
  );
}

const DRIVER_TINTS = ["#1d4ed8", "#c2410c", "#047857", "#7c3aed", "#be185d"];

function CarDrill({
  carNumber,
  drill,
  duration,
  livery,
  names,
}: {
  carNumber: string;
  drill: { stints: any[]; pits: any[] };
  duration: number | null;
  livery?: string;
  names: ReturnType<typeof useNames>;
}) {
  const stints = drill.stints.filter((s) => String(s.car_number) === carNumber).sort((a, b) => a.start_elapsed - b.start_elapsed);
  const seen = new Set<string>();
  const pits = drill.pits
    .filter((p) => String(p.car_number) === carNumber)
    .filter((p) => {
      const k = `${Math.round(p.pit_in_elapsed ?? p.lap_number)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.pit_in_elapsed ?? 0) - (b.pit_in_elapsed ?? 0));
  const total = duration || Math.max(1, ...stints.map((s) => s.end_elapsed));
  const drivers = [...new Set(stints.map((s) => s.driver_id).filter(Boolean))] as string[];
  const tint = (id: string) => DRIVER_TINTS[drivers.indexOf(id) % DRIVER_TINTS.length];
  const timeBy = (id: string) => stints.filter((s) => s.driver_id === id).reduce((n, s) => n + (s.end_elapsed - s.start_elapsed), 0);

  if (!stints.length && !pits.length) return <p className="text-sm text-ink-3">No stint or pit data for this car.</p>;
  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <Livery src={livery} alt={`#${carNumber}`} className="h-20 w-full" />
      <div>
        <div className="eyebrow mb-2">Stints across the race</div>
        <div className="relative h-7 overflow-hidden rounded-full bg-ink/[0.06]">
          {stints.map((s, i) => (
            <span
              key={i}
              className="absolute inset-y-0 border-r border-sheet"
              title={`${names?.drivers[s.driver_id]?.full_name || "Unknown"} · ${fmtDuration(s.end_elapsed - s.start_elapsed)}`}
              style={{ left: `${(s.start_elapsed / total) * 100}%`, width: `${((s.end_elapsed - s.start_elapsed) / total) * 100}%`, backgroundColor: s.driver_id ? tint(s.driver_id) : "#999" }}
            />
          ))}
          {pits.map((p, i) =>
            p.pit_in_elapsed != null ? <span key={i} className="absolute inset-y-0 w-[2px] bg-hl" style={{ left: `${(p.pit_in_elapsed / total) * 100}%` }} title={`Pit stop lap ${p.lap_number}${p.stop_duration ? ` · ${p.stop_duration}` : ""}`} /> : null,
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
          {drivers.map((id) => (
            <span key={id} className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tint(id) }} />
              <Link to={`/driver/${id}`} className="hover:underline hover:underline-offset-4">
                {names?.drivers[id]?.full_name || "Unknown"}
              </Link>
              <span className="num text-ink-3">{fmtDuration(timeBy(id))}</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-2 text-ink-2">
            <span className="h-2.5 w-[3px] bg-hl" /> {pits.length} {pits.length === 1 ? "stop" : "stops"}
          </span>
        </div>
      </div>
    </div>
  );
}
