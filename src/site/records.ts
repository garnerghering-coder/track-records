/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The record book: every car entry in every (top-level) race on the record,
 * normalised once and shared by the driver, team, car, compare and directory
 * pages. Endurance "Hour N" snapshots (parent_session_id set) never count.
 *
 * The static data client loads whole tables anyway, so building the book in
 * the browser is cheap (~1.5k entries) and every record page is instant after
 * the first visit.
 */
import { supabase } from "@/integrations/supabase/client";
import { getClassColor } from "@/lib/classes";
import { classRank } from "@/lib/insights";
import { getCountryCode, COUNTRIES } from "@/lib/countries";
import { cleanName, fetchEvents, useLoad } from "@/site/data";

/* ── Types ─────────────────────────────────────────────────────── */

export interface Entry {
  key: string; // sessionId|carNumber
  sessionId: string;
  sessionName: string;
  /** event has more than one race session (label "Race 1" etc.) */
  multiRace: boolean;
  endurance: boolean;
  eventId: string;
  eventName: string;
  eventShort: string | null;
  date: string; // event start yyyy-mm-dd
  raceDate: string; // session date yyyy-mm-dd
  year: number;
  seasonId: string;
  seriesId: string;
  seriesName: string;
  seriesShort: string;
  circuitId: string | null;
  circuitName: string | null;
  carNumber: string;
  carId: string | null;
  teamId: string | null;
  className: string | null;
  classColor: string;
  pic: number | null;
  classSize: number;
  position: number | null;
  fieldSize: number;
  status: string; // finished | dnf | dns
  laps: number | null;
  gap: string | null;
  driverIds: string[]; // drivers who took the start
  livery?: string;
  pole: boolean; // class pole in this event's qualifying
}

export interface DriverRow {
  id: string;
  full_name: string;
  nationality: string | null;
  date_of_birth: string | null;
}
export interface TeamRow {
  id: string;
  full_name: string;
  short_name: string | null;
}
export interface CarRow {
  id: string;
  model_name: string;
  manufacturer: string | null;
}
export interface Fingerprint {
  dps: number | null;
  dps_band: string | null;
  adps: number | null;
  adps_band: string | null;
  dcs: number | null;
  dcs_band: string | null;
  das: number | null;
  das_band: string | null;
  dws: number | null;
  dws_band: string | null;
  events_included: number | null;
  wet_sessions?: number | null;
  dry_sessions?: number | null;
}

export interface RecordBook {
  entries: Entry[]; // oldest → newest
  byDriver: Map<string, Entry[]>;
  byTeam: Map<string, Entry[]>;
  byCar: Map<string, Entry[]>;
  drivers: Record<string, DriverRow>;
  teams: Record<string, TeamRow>;
  cars: Record<string, CarRow>;
  fingerprints: Record<string, Fingerprint>;
  /** driver id → class poles (they set the time) */
  driverPoles: Map<string, number>;
  /** driver id → event ids where they appear in any session (incl. practice/qualifying) */
  driverEvents: Map<string, Set<string>>;
  series: { id: string; name: string; short: string }[];
}

/* ── Loader ────────────────────────────────────────────────────── */

const day = (d?: string | null) => (d || "").slice(0, 10);

async function fetchRecordBook(): Promise<RecordBook> {
  const [events, sessionsQ, resultsQ, qualiQ, liveriesQ, classesQ, driversQ, teamsQ, carsQ, fpQ, practiceQ] = await Promise.all([
    fetchEvents(),
    supabase.from("v2_sessions").select("id, event_id, name, session_type, date, status, parent_session_id, sort_order"),
    supabase
      .from("v2_race_results")
      .select("session_id, driver_id, team_id, car_id, car_number, position, status, laps_completed, gap_to_leader, extra_data"),
    supabase.from("v2_qualifying_results").select("session_id, driver_id, car_number, extra_data, position"),
    supabase.from("v2_car_liveries").select("season_id, car_number, image_url"),
    supabase.from("v2_season_classes").select("season_id, class_name, color"),
    supabase.from("v2_drivers").select("id, full_name, nationality, date_of_birth"),
    supabase.from("v2_teams").select("id, full_name, short_name"),
    supabase.from("v2_cars").select("id, model_name, manufacturer"),
    supabase.from("v2_driver_fingerprints" as any).select("driver_id, dps, dps_band, adps, adps_band, dcs, dcs_band, das, das_band, dws, dws_band, events_included, wet_sessions, dry_sessions"),
    supabase.from("v2_practice_results").select("session_id, driver_id"),
  ]);

  const evById = new Map(events.map((e) => [e.id, e]));
  const sessions = ((sessionsQ.data || []) as any[]).filter((s) => evById.has(s.event_id));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const isRace = (t: string) => /race/.test(t || "");
  const races = sessions.filter((s) => isRace(s.session_type) && !s.parent_session_id);
  const raceIds = new Set(races.map((s) => s.id));
  const racesPerEvent = new Map<string, number>();
  for (const s of races) racesPerEvent.set(s.event_id, (racesPerEvent.get(s.event_id) || 0) + 1);

  const liveries = new Map<string, string>();
  for (const l of (liveriesQ.data || []) as any[]) liveries.set(`${l.season_id}|${l.car_number}`, l.image_url);
  const classColors = new Map<string, string>();
  for (const c of (classesQ.data || []) as any[]) if (c.color) classColors.set(`${c.season_id}|${c.class_name}`, c.color);

  // Class poles: qualifying PIC 1, per event + car number, credited to the qualifier.
  const poleCars = new Set<string>();
  const driverPoles = new Map<string, number>();
  const driverEvents = new Map<string, Set<string>>();
  const touch = (driverId: string | null, sessionId: string) => {
    const s = sessionById.get(sessionId);
    if (!driverId || !s) return;
    if (!driverEvents.has(driverId)) driverEvents.set(driverId, new Set());
    driverEvents.get(driverId)!.add(s.event_id);
  };
  for (const q of (qualiQ.data || []) as any[]) {
    const s = sessionById.get(q.session_id);
    if (!s) continue;
    touch(q.driver_id, q.session_id);
    if (Number(q.extra_data?.PIC) === 1) {
      poleCars.add(`${s.event_id}|${q.car_number}`);
      if (q.driver_id) driverPoles.set(q.driver_id, (driverPoles.get(q.driver_id) || 0) + 1);
    }
  }
  for (const p of (practiceQ.data || []) as any[]) touch(p.driver_id, p.session_id);

  // Group race rows into car entries.
  const byKey = new Map<string, any[]>();
  for (const r of (resultsQ.data || []) as any[]) {
    if (!raceIds.has(r.session_id)) continue;
    touch(r.driver_id, r.session_id);
    const k = `${r.session_id}|${r.car_number}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(r);
  }

  const classSize = new Map<string, number>();
  const fieldSize = new Map<string, number>();
  for (const [k, rows] of byKey) {
    const sid = k.split("|")[0];
    const cls = rows[0].extra_data?.Class ?? null;
    classSize.set(`${sid}|${cls}`, (classSize.get(`${sid}|${cls}`) || 0) + 1);
    fieldSize.set(sid, (fieldSize.get(sid) || 0) + 1);
  }

  const entries: Entry[] = [];
  for (const [k, rows] of byKey) {
    const r0 = rows[0];
    const s = sessionById.get(r0.session_id)!;
    const ev = evById.get(s.event_id)!;
    const cls: string | null = r0.extra_data?.Class ?? null;
    const started = rows.filter((r) => r.status !== "dns");
    const pic = Number(r0.extra_data?.PIC);
    entries.push({
      key: k,
      sessionId: s.id,
      sessionName: s.name,
      multiRace: (racesPerEvent.get(s.event_id) || 0) > 1,
      endurance: s.session_type === "endurance_race",
      eventId: ev.id,
      eventName: ev.name,
      eventShort: ev.short_name ?? null,
      date: day(ev.start_date),
      raceDate: day(s.date) || day(ev.end_date) || day(ev.start_date),
      year: ev.year ?? Number(day(ev.start_date).slice(0, 4)),
      seasonId: ev.season_id,
      seriesId: ev.series?.id || "",
      seriesName: ev.series?.name || "",
      seriesShort: ev.series?.short_name || ev.series?.name || "",
      circuitId: ev.circuit?.id ?? null,
      circuitName: ev.circuit?.name ?? null,
      carNumber: String(r0.car_number ?? ""),
      carId: r0.car_id ?? null,
      teamId: r0.team_id ?? null,
      className: cls,
      classColor: classColors.get(`${ev.season_id}|${cls}`) || getClassColor(cls),
      pic: Number.isFinite(pic) && pic > 0 ? pic : null,
      classSize: classSize.get(`${s.id}|${cls}`) || 0,
      position: r0.position ?? null,
      fieldSize: fieldSize.get(s.id) || 0,
      status: started.length ? started[0].status || "finished" : "dns",
      laps: r0.laps_completed ?? null,
      gap: r0.gap_to_leader ?? null,
      driverIds: started.map((r) => r.driver_id).filter(Boolean),
      livery: liveries.get(`${ev.season_id}|${r0.car_number}`),
      pole: poleCars.has(`${ev.id}|${r0.car_number}`),
    });
  }
  entries.sort((a, b) => a.raceDate.localeCompare(b.raceDate) || a.sessionName.localeCompare(b.sessionName) || (a.position ?? 999) - (b.position ?? 999));

  const group = (key: (e: Entry) => (string | null)[]) => {
    const m = new Map<string, Entry[]>();
    for (const e of entries)
      for (const k of key(e)) {
        if (!k) continue;
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(e);
      }
    return m;
  };

  const byId = <T extends { id: string }>(rows: any[] | null) => Object.fromEntries(((rows || []) as T[]).map((x) => [x.id, x])) as Record<string, T>;
  const fingerprints: Record<string, Fingerprint> = {};
  for (const f of (fpQ.data || []) as any[]) fingerprints[f.driver_id] = f;

  const seriesCount = new Map<string, number>();
  for (const e of entries) seriesCount.set(e.seriesId, (seriesCount.get(e.seriesId) || 0) + 1);
  const series = [...new Map(events.filter((e) => e.series).map((e) => [e.series!.id, { id: e.series!.id, name: e.series!.name, short: e.series!.short_name || e.series!.name }])).values()].sort(
    (a, b) => (seriesCount.get(b.id) || 0) - (seriesCount.get(a.id) || 0),
  );

  return {
    entries,
    byDriver: group((e) => e.driverIds),
    byTeam: group((e) => [e.teamId]),
    byCar: group((e) => [e.carId]),
    drivers: byId<DriverRow>(driversQ.data as any[]),
    teams: byId<TeamRow>(teamsQ.data as any[]),
    cars: byId<CarRow>(carsQ.data as any[]),
    fingerprints,
    driverPoles,
    driverEvents,
    series,
  };
}

export const loadRecordBook = () => fetchRecordBook();
export const useRecordBook = () => useLoad("record-book", fetchRecordBook).data;

/* ── Tallies ───────────────────────────────────────────────────── */

export const isStart = (e: Entry) => e.status !== "dns";
export const isFinish = (e: Entry) => e.status === "finished";
export const isWin = (e: Entry) => isFinish(e) && e.pic === 1;
export const isPodium = (e: Entry) => isFinish(e) && e.pic != null && e.pic <= 3;

export interface Tally {
  starts: number;
  finishes: number;
  dnfs: number;
  wins: number;
  podiums: number;
  poles: number;
  best: number | null;
  bestCount: number;
  bestClass: string | null;
  avgPic: number | null;
  seasons: number;
  years: number[];
  classes: string[];
  classColors: Record<string, string>;
  series: string[];
  events: number;
  first: Entry | null;
  last: Entry | null;
}

export function tally(list: Entry[], poles?: number): Tally {
  const s = list.filter(isStart);
  const fin = s.filter(isFinish);
  const pics = fin.map((e) => e.pic).filter((n): n is number => n != null);
  const best = pics.length ? Math.min(...pics) : null;
  const bestRows = best != null ? fin.filter((e) => e.pic === best) : [];
  const bestClasses = [...new Set(bestRows.map((e) => e.className).filter(Boolean) as string[])].sort((a, b) => classRank(a) - classRank(b));
  const bestClass = bestClasses.length ? bestClasses.join(" & ") : null;
  return {
    starts: s.length,
    finishes: fin.length,
    dnfs: s.filter((e) => e.status === "dnf").length,
    wins: s.filter(isWin).length,
    podiums: s.filter(isPodium).length,
    poles: poles ?? s.filter((e) => e.pole).length,
    best,
    bestCount: bestRows.length,
    bestClass,
    avgPic: pics.length ? pics.reduce((a, b) => a + b, 0) / pics.length : null,
    seasons: new Set(s.map((e) => e.seasonId)).size,
    years: [...new Set(s.map((e) => e.year))].sort(),
    classes: [...new Set(s.map((e) => e.className).filter(Boolean) as string[])].sort((a, b) => classRank(a) - classRank(b)),
    classColors: Object.fromEntries(s.filter((e) => e.className).map((e) => [e.className!, e.classColor])),
    series: [...new Set(s.map((e) => e.seriesShort))],
    events: new Set(s.map((e) => e.eventId)).size,
    first: s[0] ?? null,
    last: s[s.length - 1] ?? null,
  };
}

/** Group entries by season (newest first), each with its own tally. */
export function bySeason(list: Entry[]) {
  const m = new Map<string, Entry[]>();
  for (const e of list) {
    if (!m.has(e.seasonId)) m.set(e.seasonId, []);
    m.get(e.seasonId)!.push(e);
  }
  return [...m.entries()]
    .map(([seasonId, rows]) => ({ seasonId, year: rows[0].year, seriesId: rows[0].seriesId, seriesName: rows[0].seriesName, seriesShort: rows[0].seriesShort, rows }))
    .sort((a, b) => b.year - a.year || a.seriesShort.localeCompare(b.seriesShort));
}

/** Group a list of car entries by race session (newest first). */
export function byRace(list: Entry[]) {
  const m = new Map<string, Entry[]>();
  for (const e of list) {
    if (!m.has(e.sessionId)) m.set(e.sessionId, []);
    m.get(e.sessionId)!.push(e);
  }
  return [...m.values()]
    .map((rows) => rows.sort((a, b) => classRank(a.className) - classRank(b.className) || (a.pic ?? 99) - (b.pic ?? 99)))
    .sort((a, b) => b[0].raceDate.localeCompare(a[0].raceDate) || b[0].sessionName.localeCompare(a[0].sessionName));
}

/** Co-drivers who shared a car with `driverId`. */
export function teammatesOf(driverId: string, list: Entry[]) {
  const m = new Map<string, { id: string; races: Entry[] }>();
  for (const e of list)
    for (const d of e.driverIds) {
      if (d === driverId) continue;
      if (!m.has(d)) m.set(d, { id: d, races: [] });
      m.get(d)!.races.push(e);
    }
  return [...m.values()].sort((a, b) => b.races.length - a.races.length || b.races[b.races.length - 1].raceDate.localeCompare(a.races[a.races.length - 1].raceDate));
}

/** Count items by key, most frequent first (ties: most recent). */
export function countBy<T>(list: Entry[], key: (e: Entry) => T | null | undefined) {
  const m = new Map<T, { key: T; n: number; last: Entry; wins: number }>();
  for (const e of list) {
    const k = key(e);
    if (k == null || (k as any) === "") continue;
    const cur = m.get(k);
    if (cur) {
      cur.n++;
      cur.last = e;
      if (isWin(e)) cur.wins++;
    } else m.set(k, { key: k, n: 1, last: e, wins: isWin(e) ? 1 : 0 });
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.last.raceDate.localeCompare(a.last.raceDate));
}

/* ── Formatting ───────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (d: string) => {
  if (!d) return "";
  const [y, m, dd] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${dd}, ${y}`;
};
export const fmtDayShort = (d: string) => {
  if (!d) return "";
  const [, m, dd] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${dd}`;
};
export const stripYear = (name: string) => name.replace(/^\d{4}\s+/, "");
export const raceTitle = (e: Entry) => stripYear(e.eventName) + (e.multiRace ? ` · ${e.sessionName}` : "");
export const carLabel = (c?: CarRow | null) => (c ? [c.manufacturer, c.model_name].map((s) => (s || "").trim()).filter(Boolean).join(" ") : "");
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
export const resultLabel = (e: Entry) => (e.status === "dns" ? "DNS" : e.status === "dnf" ? "DNF" : e.pic != null ? `P${e.pic}` : e.position != null ? `P${e.position}` : "—");

export function age(dob?: string | null) {
  if (!dob) return null;
  const b = new Date(dob + "T00:00:00Z");
  const now = new Date();
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) a--;
  return Number.isFinite(a) && a > 10 && a < 100 ? a : null;
}

/** "Dallas, United States" → { code: "US", country: "United States", place: "Dallas" } */
export function origin(nationality?: string | null) {
  const code = getCountryCode(nationality);
  const country = code ? COUNTRIES.find((c) => c.code === code)?.name ?? null : null;
  const raw = (nationality || "").trim();
  const place = raw.includes(",") ? raw.split(",").slice(0, -1).join(",").trim() : null;
  return { code, country: country === "United States of America" ? "United States" : country, place: place || null };
}

/** Sort key for a person: last name, then first. */
export const personSortKey = (full: string) => {
  const parts = cleanName(full).split(/\s+/);
  return `${parts.slice(1).join(" ") || parts[0]} ${parts[0]}`.toLocaleLowerCase();
};

/* ── Driver shape ─────────────────────────────────────────────── */

export interface ShapeAxis {
  key: "dps" | "adps" | "dcs" | "das" | "dws";
  label: string;
  short: string;
  value: number | null;
  band: string | null;
  about: string;
  needs: string;
}

export function shapeAxes(fp?: Fingerprint | null): ShapeAxis[] {
  return [
    { key: "dps", label: "Pace", short: "Pace", value: fp?.dps ?? null, band: fp?.dps_band ?? null, about: "Where they finish within their class, averaged over events (race, qualifying and practice weighted).", needs: "5 events" },
    { key: "adps", label: "Class-adjusted pace", short: "Adj. pace", value: fp?.adps ?? null, band: fp?.adps_band ?? null, about: "Pace scaled by how hard the class is to win: a GTP podium weighs more than a GS one.", needs: "5 events in a rated class" },
    { key: "dcs", label: "Consistency", short: "Consistency", value: fp?.dcs ?? null, band: fp?.dcs_band ?? null, about: "How tightly their results cluster around their own level. High means dependable.", needs: "8 events" },
    { key: "das", label: "Adaptability", short: "Adaptability", value: fp?.das ?? null, band: fp?.das_band ?? null, about: "Whether they perform equally on fast and twisty, flat and hilly, light- and heavy-braking circuits.", needs: "5 events across varied circuits" },
    { key: "dws", label: "Weather", short: "Weather", value: fp?.dws ?? null, band: fp?.dws_band ?? null, about: "Wet results against dry ones. Above 50 means they gain in the rain.", needs: "2 wet and 4 dry events" },
  ];
}
