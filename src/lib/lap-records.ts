/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Circuit lap records: the fastest race lap per layout and per class (or per
 * series when a race has no classes), so an oval and a road course at the same
 * venue, or INDYCAR and NASCAR on the same oval, never share a record.
 *
 * Pure and shared by the browser and the build (relative `.ts` imports only);
 * scripts/build-derived.mjs writes public/data/derived/laprecords/<circuitId>.json.
 */
import { classRank, parseTime } from "./insights.ts";

export interface LapRecord {
  /** Class name, or the series' short name for races without classes. */
  className: string;
  /** true when `className` names a series (single-class racing). */
  bySeries?: boolean;
  layoutId: string | null;
  seconds: number;
  time: string;
  carNumber: string;
  driverIds: string[];
  teamId: string | null;
  carId: string | null;
  eventId: string;
  sessionName: string;
  year: number | null;
}

export interface LapRecordEvent {
  id: string;
  year: number | null;
  layout_id?: string | null;
  series?: { short_name?: string | null; name?: string | null } | null;
}

const RACE_TYPES = ["race", "endurance_race", "sprint_race"];

/** The layout a race ran on: the session's own layout, else the event's. */
export const raceLayoutId = (session: { layout_id?: string | null } | undefined, event: { layout_id?: string | null } | undefined) =>
  session?.layout_id || event?.layout_id || null;

export function computeLapRecords(events: LapRecordEvent[], sessions: any[], rows: any[], defaultLayoutId: string | null = null): LapRecord[] {
  const evById = new Map(events.map((e) => [e.id, e]));
  const sById = new Map(sessions.filter((s) => evById.has(s.event_id) && !s.parent_session_id && RACE_TYPES.includes(s.session_type)).map((s) => [s.id, s]));
  const crews = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!sById.has(r.session_id) || !r.driver_id) continue;
    const k = `${r.session_id}|${r.car_number}`;
    (crews.get(k) ?? crews.set(k, new Set()).get(k)!).add(r.driver_id);
  }
  const best = new Map<string, LapRecord>();
  for (const r of rows) {
    const s = sById.get(r.session_id);
    if (!s) continue;
    const t = parseTime(r.fastest_lap_time);
    if (t == null || t <= 0) continue;
    const ev = evById.get(s.event_id)!;
    const cls = r.extra_data?.Class as string | undefined;
    const label = cls || ev.series?.short_name || ev.series?.name || "Overall";
    const layoutId = raceLayoutId(s, ev) || defaultLayoutId;
    const key = `${layoutId}|${label}`;
    const cur = best.get(key);
    if (!cur || t < cur.seconds)
      best.set(key, {
        className: label,
        bySeries: !cls,
        layoutId,
        seconds: t,
        time: String(r.fastest_lap_time),
        carNumber: String(r.car_number),
        driverIds: [...(crews.get(`${r.session_id}|${r.car_number}`) || [])],
        teamId: r.team_id ?? null,
        carId: r.car_id ?? null,
        eventId: s.event_id,
        sessionName: s.name,
        year: ev.year ?? null,
      });
  }
  return [...best.values()].sort((a, b) => Number(!!a.bySeries) - Number(!!b.bySeries) || classRank(a.className) - classRank(b.className) || a.seconds - b.seconds);
}

export const lapRecordsFile = (circuitId: string) => `derived/laprecords/${encodeURIComponent(circuitId)}.json`;
