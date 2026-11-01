/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The record book: every car entry in every top-level race on the record,
 * normalised once and shared by the driver, team, car, compare and directory
 * pages. Endurance "Hour N" snapshots (parent_session_id set) never count.
 *
 * Pure and shared by the browser and the build (relative `.ts` imports only,
 * so it also runs under `node --experimental-strip-types`):
 *
 * - `loadRecordTables(db)` reads the tables through any supabase-js style client.
 * - `buildRecordBook(tables)` turns them into entries grouped by driver/team/car.
 * - `sliceRecordBook(book, kind, id)` → a compact JSON record for one entity;
 *   `expandRecordSlice(json)` turns it back into a (partial) RecordBook.
 * - `buildRecordIndex(book)` → the compact directory used by /drivers, /teams,
 *   /cars and the Compare picker.
 *
 * scripts/build-derived.mjs writes those files to public/data/derived/records/
 * so a record page downloads a few KB instead of the full results tables.
 *
 * Works for any series: class wins when a race has classes (extra_data.Class
 * with a class position in extra_data.PIC), outright wins otherwise. Sprint
 * races (session_type "sprint_race") are kept as entries but never count as
 * starts, wins or podiums.
 */
import { classLabel, getClassColor } from "./classes.ts";
import { classRank } from "./insights.ts";

/* ── Types ─────────────────────────────────────────────────────── */

export interface Entry {
  key: string; // sessionId|carNumber
  sessionId: string;
  sessionName: string;
  /** event has more than one race session (label "Race 1" etc.) */
  multiRace: boolean;
  endurance: boolean;
  /** sprint race (F1-style): listed, but not counted as a start, win or podium */
  sprint: boolean;
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
  /** Position in class, or overall when the race has no classes. */
  pic: number | null;
  classSize: number;
  position: number | null;
  fieldSize: number;
  status: string; // finished | dnf | dns | dsq ...
  laps: number | null;
  gap: string | null;
  driverIds: string[]; // drivers who took the start
  livery?: string;
  pole: boolean; // (class) pole in this event's qualifying
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

export interface SeriesLite {
  id: string;
  name: string;
  short: string;
}

/** A driver's final championship place in one season (per class). */
export interface ChampPlace {
  className: string;
  position: number;
  totalPoints: number;
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
  /** driver id → (class) poles (they set the time), one per event at most */
  driverPoles: Map<string, number>;
  /** driver id → number of events where they appear in any session (incl. practice/qualifying) */
  driverEvents: Map<string, number>;
  series: SeriesLite[];
  /** driver id → seasonId → championship places (only present in precomputed driver records) */
  championships?: Map<string, Record<string, ChampPlace[]>>;
  /** driver id → team-mates in the team's other cars (solo-driver races), when computed */
  teammates?: Map<string, TeamMate[]>;
}

/** A team-mate in another car of the same team, in races where both drove solo. */
export interface TeamMate {
  id: string;
  races: number;
  /** races where the driver finished ahead of the team-mate */
  ahead: number;
  /** races where the team-mate finished ahead */
  behind: number;
}

const sessionIndex = new WeakMap<RecordBook, Map<string, Entry[]>>();
function entriesBySession(book: RecordBook) {
  let m = sessionIndex.get(book);
  if (!m) {
    m = new Map();
    for (const e of book.entries) {
      if (!m.has(e.sessionId)) m.set(e.sessionId, []);
      m.get(e.sessionId)!.push(e);
    }
    sessionIndex.set(book, m);
  }
  return m;
}

/** Who finished ahead: "a", "b" or null (neither finished / not comparable). */
export function aheadOf(a: Entry, b: Entry): "a" | "b" | null {
  const fa = a.status === "finished";
  const fb = b.status === "finished";
  if (fa && !fb) return "a";
  if (fb && !fa) return "b";
  if (!fa || !fb) return null;
  const same = a.className === b.className;
  const pa = same ? a.pic : a.position;
  const pb = same ? b.pic : b.position;
  return pa != null && pb != null && pa !== pb ? (pa < pb ? "a" : "b") : null;
}

/**
 * Team-mates in the team's other cars: races where the driver drove a car alone
 * and the team ran another solo-driven car (F1, NASCAR, INDYCAR, one-driver cups).
 */
export function teamMatesOf(book: RecordBook, driverId: string): TeamMate[] {
  const bySession = entriesBySession(book);
  const m = new Map<string, TeamMate>();
  for (const e of book.byDriver.get(driverId) || []) {
    if (!isStart(e) || e.driverIds.length !== 1 || !e.teamId) continue;
    for (const o of bySession.get(e.sessionId) || []) {
      if (o.key === e.key || o.teamId !== e.teamId || o.driverIds.length !== 1 || !isStart(o)) continue;
      const id = o.driverIds[0];
      if (id === driverId) continue;
      if (!m.has(id)) m.set(id, { id, races: 0, ahead: 0, behind: 0 });
      const tm = m.get(id)!;
      tm.races++;
      const w = aheadOf(e, o);
      if (w === "a") tm.ahead++;
      if (w === "b") tm.behind++;
    }
  }
  return [...m.values()].sort((a, b) => b.races - a.races);
}

/* ── Raw tables ────────────────────────────────────────────────── */

export interface RecordEvent {
  id: string;
  name: string;
  short_name?: string | null;
  start_date: string | null;
  end_date: string | null;
  season_id: string;
  year: number | null;
  series: { id: string; name: string; short_name: string | null } | null;
  circuit: { id: string; name: string } | null;
}

export interface RecordTables {
  events: RecordEvent[];
  sessions: any[];
  results: any[];
  qualifying: any[];
  practice: any[];
  liveries: any[];
  classes: any[];
  drivers: any[];
  teams: any[];
  cars: any[];
  fingerprints: any[];
}

/** Anything with supabase-js's `from(table)` query builder. */
export interface QueryClient {
  from: (table: any) => any;
}

export async function loadRecordTables(db: QueryClient): Promise<RecordTables> {
  const q = async (p: PromiseLike<{ data: any[] | null }>) => (await p).data || [];
  const [events, sessions, results, qualifying, practice, liveries, classes, drivers, teams, cars, fingerprints] = await Promise.all([
    q(
      db
        .from("v2_events")
        .select("id, name, short_name, start_date, end_date, season_id, status, v2_seasons(year, v2_series(id, name, short_name)), v2_circuits(id, name)")
        .eq("status", "published"),
    ),
    q(db.from("v2_sessions").select("id, event_id, name, session_type, date, status, parent_session_id, sort_order")),
    q(db.from("v2_race_results").select("session_id, driver_id, team_id, car_id, car_number, position, status, laps_completed, gap_to_leader, extra_data")),
    q(db.from("v2_qualifying_results").select("session_id, driver_id, car_number, extra_data, position")),
    q(db.from("v2_practice_results").select("session_id, driver_id")),
    q(db.from("v2_car_liveries").select("season_id, car_number, image_url")),
    q(db.from("v2_season_classes").select("season_id, class_name, color")),
    q(db.from("v2_drivers").select("id, full_name, nationality, date_of_birth")),
    q(db.from("v2_teams").select("id, full_name, short_name")),
    q(db.from("v2_cars").select("id, model_name, manufacturer")),
    q(
      db
        .from("v2_driver_fingerprints")
        .select("driver_id, dps, dps_band, adps, adps_band, dcs, dcs_band, das, das_band, dws, dws_band, events_included, wet_sessions, dry_sessions"),
    ),
  ]);
  return {
    events: events.map((e: any) => ({
      id: e.id,
      name: e.name,
      short_name: e.short_name,
      start_date: e.start_date,
      end_date: e.end_date,
      season_id: e.season_id,
      year: e.v2_seasons?.year ?? null,
      series: e.v2_seasons?.v2_series ?? null,
      circuit: e.v2_circuits ? { id: e.v2_circuits.id, name: e.v2_circuits.name } : null,
    })),
    sessions,
    results,
    qualifying,
    practice,
    liveries,
    classes,
    drivers,
    teams,
    cars,
    fingerprints,
  };
}

/* ── Builder ───────────────────────────────────────────────────── */

const day = (d?: string | null) => (d || "").slice(0, 10);
const isRaceType = (t: string) => /race/.test(t || "");
const cls = (extra: any): string | null => {
  const c = extra?.Class ?? extra?.class;
  return c == null || c === "" ? null : String(c);
};
/** Class position (PIC) when the row has a class, else the overall position. */
const placeOf = (extra: any, position: any): number | null => {
  const pic = Number(extra?.PIC);
  if (cls(extra) && Number.isFinite(pic) && pic > 0) return pic;
  const p = Number(position);
  return position != null && Number.isFinite(p) && p > 0 ? p : null;
};

export function buildRecordBook(t: RecordTables): RecordBook {
  const evById = new Map(t.events.map((e) => [e.id, e]));
  const sessions = t.sessions.filter((s) => evById.has(s.event_id));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const races = sessions.filter((s) => isRaceType(s.session_type) && !s.parent_session_id);
  const raceIds = new Set(races.map((s) => s.id));
  const racesPerEvent = new Map<string, number>();
  for (const s of races) racesPerEvent.set(s.event_id, (racesPerEvent.get(s.event_id) || 0) + 1);

  const liveries = new Map<string, string>();
  for (const l of t.liveries) liveries.set(`${l.season_id}|${l.car_number}`, l.image_url);
  const classColors = new Map<string, string>();
  for (const c of t.classes) if (c.color) classColors.set(`${c.season_id}|${c.class_name}`, c.color);

  // Poles: (class) P1 in the event's qualifying. When an event has several qualifying
  // sessions (F1 sprint shootout + qualifying), the sprint ones only count if there is no other.
  const qualiSessions = new Map<string, any[]>();
  for (const s of sessions) {
    if (s.session_type !== "qualifying" || s.parent_session_id) continue;
    if (!qualiSessions.has(s.event_id)) qualiSessions.set(s.event_id, []);
    qualiSessions.get(s.event_id)!.push(s);
  }
  const poleSessions = new Set<string>();
  for (const list of qualiSessions.values()) {
    const main = list.filter((s) => !/sprint|shootout/i.test(s.name || ""));
    for (const s of main.length ? main : list) poleSessions.add(s.id);
  }

  const poleCars = new Set<string>();
  const poleKeys = new Set<string>();
  const driverPoles = new Map<string, number>();
  const driverEventSets = new Map<string, Set<string>>();
  const touch = (driverId: string | null, sessionId: string) => {
    const s = sessionById.get(sessionId);
    if (!driverId || !s) return;
    if (!driverEventSets.has(driverId)) driverEventSets.set(driverId, new Set());
    driverEventSets.get(driverId)!.add(s.event_id);
  };
  for (const q of t.qualifying) {
    const s = sessionById.get(q.session_id);
    if (!s) continue;
    touch(q.driver_id, q.session_id);
    if (!poleSessions.has(s.id)) continue;
    if (placeOf(q.extra_data, q.position) === 1) {
      poleCars.add(`${s.event_id}|${cls(q.extra_data) ?? ""}|${q.car_number}`);
      const k = `${q.driver_id}|${s.event_id}|${cls(q.extra_data) ?? ""}`;
      if (q.driver_id && !poleKeys.has(k)) {
        poleKeys.add(k);
        driverPoles.set(q.driver_id, (driverPoles.get(q.driver_id) || 0) + 1);
      }
    }
  }
  for (const p of t.practice) touch(p.driver_id, p.session_id);

  // Group race rows into car entries.
  const byKey = new Map<string, any[]>();
  for (const r of t.results) {
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
    const c = cls(rows[0].extra_data);
    classSize.set(`${sid}|${c}`, (classSize.get(`${sid}|${c}`) || 0) + 1);
    fieldSize.set(sid, (fieldSize.get(sid) || 0) + 1);
  }

  const entries: Entry[] = [];
  for (const [k, rows] of byKey) {
    const r0 = rows[0];
    const s = sessionById.get(r0.session_id)!;
    const ev = evById.get(s.event_id)!;
    const c = cls(r0.extra_data);
    const started = rows.filter((r) => r.status !== "dns");
    entries.push({
      key: k,
      sessionId: s.id,
      sessionName: s.name,
      multiRace: (racesPerEvent.get(s.event_id) || 0) > 1,
      endurance: s.session_type === "endurance_race",
      sprint: s.session_type === "sprint_race",
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
      className: c,
      classColor: classColors.get(`${ev.season_id}|${c}`) || getClassColor(c),
      pic: placeOf(r0.extra_data, r0.position),
      classSize: classSize.get(`${s.id}|${c}`) || 0,
      position: r0.position ?? null,
      fieldSize: fieldSize.get(s.id) || 0,
      status: started.length ? started[0].status || "finished" : "dns",
      laps: r0.laps_completed ?? null,
      gap: r0.gap_to_leader ?? null,
      driverIds: [...new Set(started.map((r) => r.driver_id).filter(Boolean))] as string[],
      livery: liveries.get(`${ev.season_id}|${r0.car_number}`),
      pole: poleCars.has(`${ev.id}|${c ?? ""}|${r0.car_number}`),
    });
  }
  entries.sort(entryOrder);

  const byId = <T extends { id: string }>(rows: any[]) => Object.fromEntries((rows as T[]).map((x) => [x.id, x])) as Record<string, T>;
  const fingerprints: Record<string, Fingerprint> = {};
  for (const f of t.fingerprints) {
    const { driver_id, ...rest } = f;
    fingerprints[driver_id] = rest;
  }

  const seriesCount = new Map<string, number>();
  for (const e of entries) seriesCount.set(e.seriesId, (seriesCount.get(e.seriesId) || 0) + 1);
  const series = [...new Map(t.events.filter((e) => e.series).map((e) => [e.series!.id, { id: e.series!.id, name: e.series!.name, short: e.series!.short_name || e.series!.name }])).values()].sort(
    (a, b) => (seriesCount.get(b.id) || 0) - (seriesCount.get(a.id) || 0) || a.short.localeCompare(b.short),
  );

  return assemble(entries, {
    drivers: byId<DriverRow>(t.drivers),
    teams: byId<TeamRow>(t.teams),
    cars: byId<CarRow>(t.cars),
    fingerprints,
    driverPoles,
    driverEvents: new Map([...driverEventSets].map(([k, v]) => [k, v.size])),
    series,
  });
}

const entryOrder = (a: Entry, b: Entry) =>
  a.raceDate.localeCompare(b.raceDate) || a.sessionName.localeCompare(b.sessionName) || (a.position ?? 999) - (b.position ?? 999) || a.key.localeCompare(b.key);

function group(entries: Entry[], key: (e: Entry) => (string | null)[]) {
  const m = new Map<string, Entry[]>();
  for (const e of entries)
    for (const k of key(e)) {
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
  return m;
}

function assemble(entries: Entry[], rest: Omit<RecordBook, "entries" | "byDriver" | "byTeam" | "byCar">): RecordBook {
  return {
    entries,
    byDriver: group(entries, (e) => e.driverIds),
    byTeam: group(entries, (e) => [e.teamId]),
    byCar: group(entries, (e) => [e.carId]),
    ...rest,
  };
}

/* ── Tallies ───────────────────────────────────────────────────── */

/** A counted start: took the start of a (non-sprint) race. */
export const isStart = (e: Entry) => e.status !== "dns" && !e.sprint;
export const isFinish = (e: Entry) => e.status === "finished";
export const isWin = (e: Entry) => isStart(e) && isFinish(e) && e.pic === 1;
export const isPodium = (e: Entry) => isStart(e) && isFinish(e) && e.pic != null && e.pic <= 3;

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
  /** Some starts were in races with classes (wins are class wins). */
  classed: boolean;
  /** Some starts were in races without classes (wins are outright wins). */
  outright: boolean;
  first: Entry | null;
  last: Entry | null;
}

export function tally(list: Entry[], poles?: number): Tally {
  const s = list.filter(isStart);
  const fin = s.filter(isFinish);
  const pics = fin.map((e) => e.pic).filter((n): n is number => n != null);
  const best = pics.length ? Math.min(...pics) : null;
  const bestRows = best != null ? fin.filter((e) => e.pic === best) : [];
  // Label each best result by its class, or by its series when the race had no classes
  // (an INDYCAR win must not be labelled with an IMSA class from the same driver's record).
  const bestClasses = [
    ...new Set(bestRows.map((e) => (e.className ? classLabel(e.className) : e.seriesShort || e.seriesName || null)).filter(Boolean) as string[]),
  ].sort((a, b) => classRank(a) - classRank(b));
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
    classed: s.some((e) => !!e.className),
    outright: s.some((e) => !e.className),
    first: s[0] ?? null,
    last: s[s.length - 1] ?? null,
  };
}

/** "class win" when every start was in a classed race, "win" otherwise. */
export const winWord = (t: Pick<Tally, "classed" | "outright">) => (t.classed && !t.outright ? "class win" : "win");

/* ── Compact per-entity records (public/data/derived/records) ─── */

export type RecordKind = "drivers" | "teams" | "cars";

/** [sessionId, sessionName, flags(1 multiRace|2 endurance|4 sprint), eventIdx, raceDate, fieldSize] */
type RaceTuple = [string, string, number, number, string, number];
/** [eventId, name, short, date, year, seasonId, seriesId, circuitId, circuitName] */
type EventTuple = [string, string, string | null, string, number, string, string, string | null, string | null];
/** [raceIdx, carNumber, carIdx, teamIdx, className, pic, classSize, position, status, laps, gap, driverIdxs, pole] */
type EntryTuple = [number, string, number, number, string | null, number | null, number, number | null, string, number | null, string | null, number[], 0 | 1];

export interface RecordSlice {
  v: 1;
  kind: RecordKind;
  id: string;
  /** Entity ids referenced by index from the tuples. */
  ids: string[];
  events: EventTuple[];
  races: RaceTuple[];
  entries: EntryTuple[];
  series: SeriesLite[];
  /** "seasonId|class" → colour */
  colors: Record<string, string>;
  /** "seasonId|carNumber" → livery url */
  liveries: Record<string, string>;
  drivers: Record<string, Omit<DriverRow, "id">>;
  teams: Record<string, Omit<TeamRow, "id">>;
  cars: Record<string, Omit<CarRow, "id">>;
  fingerprints: Record<string, Fingerprint>;
  poles: Record<string, number>;
  events_seen: Record<string, number>;
  championships?: Record<string, Record<string, ChampPlace[]>>;
  /** driverId → [mateId, races, ahead, behind][] */
  teammates?: Record<string, [string, number, number, number][]>;
}

const omitId = <T extends { id: string }>(x: T): Omit<T, "id"> => {
  const { id: _id, ...rest } = x;
  return rest;
};

/** One entity's record, with every name it references. */
export function sliceRecordBook(book: RecordBook, kind: RecordKind, id: string, championships?: Record<string, ChampPlace[]>): RecordSlice {
  const list = (kind === "drivers" ? book.byDriver : kind === "teams" ? book.byTeam : book.byCar).get(id) || [];
  const ids: string[] = [];
  const idIdx = new Map<string, number>();
  const ref = (x: string | null) => {
    if (!x) return -1;
    let i = idIdx.get(x);
    if (i == null) {
      i = ids.length;
      ids.push(x);
      idIdx.set(x, i);
    }
    return i;
  };
  const events: EventTuple[] = [];
  const evIdx = new Map<string, number>();
  const races: RaceTuple[] = [];
  const raceIdx = new Map<string, number>();
  const colors: Record<string, string> = {};
  const liveries: Record<string, string> = {};
  const drivers: RecordSlice["drivers"] = {};
  const teams: RecordSlice["teams"] = {};
  const cars: RecordSlice["cars"] = {};
  const series = new Map<string, SeriesLite>();
  const entries: EntryTuple[] = list.map((e) => {
    let ei = evIdx.get(e.eventId);
    if (ei == null) {
      ei = events.length;
      evIdx.set(e.eventId, ei);
      events.push([e.eventId, e.eventName, e.eventShort, e.date, e.year, e.seasonId, e.seriesId, e.circuitId, e.circuitName]);
    }
    let ri = raceIdx.get(e.sessionId);
    if (ri == null) {
      ri = races.length;
      raceIdx.set(e.sessionId, ri);
      races.push([e.sessionId, e.sessionName, (e.multiRace ? 1 : 0) | (e.endurance ? 2 : 0) | (e.sprint ? 4 : 0), ei, e.raceDate, e.fieldSize]);
    }
    if (e.className) colors[`${e.seasonId}|${e.className}`] = e.classColor;
    if (e.livery) liveries[`${e.seasonId}|${e.carNumber}`] = e.livery;
    for (const d of e.driverIds) if (book.drivers[d]) drivers[d] = omitId(book.drivers[d]);
    if (e.teamId && book.teams[e.teamId]) teams[e.teamId] = omitId(book.teams[e.teamId]);
    if (e.carId && book.cars[e.carId]) cars[e.carId] = omitId(book.cars[e.carId]);
    const s = book.series.find((x) => x.id === e.seriesId);
    if (s) series.set(s.id, s);
    return [ri, e.carNumber, ref(e.carId), ref(e.teamId), e.className, e.pic, e.classSize, e.position, e.status, e.laps, e.gap, e.driverIds.map(ref), e.pole ? 1 : 0];
  });
  if (kind === "drivers" && book.drivers[id]) drivers[id] = omitId(book.drivers[id]);
  if (kind === "teams" && book.teams[id]) teams[id] = omitId(book.teams[id]);
  if (kind === "cars" && book.cars[id]) cars[id] = omitId(book.cars[id]);
  // Fingerprints only for the driver themselves (Compare loads both drivers' records).
  const fingerprints: Record<string, Fingerprint> = {};
  const poles: Record<string, number> = {};
  const seen: Record<string, number> = {};
  let teammates: RecordSlice["teammates"];
  if (kind === "drivers") {
    const tm = teamMatesOf(book, id);
    if (tm.length) {
      teammates = { [id]: tm.map((x) => [x.id, x.races, x.ahead, x.behind]) };
      for (const x of tm) if (book.drivers[x.id]) drivers[x.id] = omitId(book.drivers[x.id]);
    }
    if (book.fingerprints[id]) fingerprints[id] = book.fingerprints[id];
    poles[id] = book.driverPoles.get(id) || 0;
    seen[id] = book.driverEvents.get(id) || 0;
  }
  return {
    v: 1,
    kind,
    id,
    ids,
    events,
    races,
    entries,
    series: [...series.values()],
    colors,
    liveries,
    drivers,
    teams,
    cars,
    fingerprints,
    poles,
    events_seen: seen,
    ...(championships ? { championships: { [id]: championships } } : {}),
    ...(teammates ? { teammates } : {}),
  };
}

export function expandRecordSlice(s: RecordSlice): RecordBook {
  const events = s.events.map(([id, name, short, date, year, seasonId, seriesId, circuitId, circuitName]) => ({ id, name, short, date, year, seasonId, seriesId, circuitId, circuitName }));
  const seriesBy = new Map(s.series.map((x) => [x.id, x]));
  const id = (i: number) => (i < 0 ? null : s.ids[i]);
  const entries: Entry[] = s.entries.map(([ri, carNumber, carI, teamI, className, pic, classSize, position, status, laps, gap, drivers, pole]) => {
    const [sessionId, sessionName, flags, ei, raceDate, fieldSize] = s.races[ri];
    const ev = events[ei];
    const se = seriesBy.get(ev.seriesId);
    return {
      key: `${sessionId}|${carNumber}`,
      sessionId,
      sessionName,
      multiRace: !!(flags & 1),
      endurance: !!(flags & 2),
      sprint: !!(flags & 4),
      eventId: ev.id,
      eventName: ev.name,
      eventShort: ev.short,
      date: ev.date,
      raceDate,
      year: ev.year,
      seasonId: ev.seasonId,
      seriesId: ev.seriesId,
      seriesName: se?.name || "",
      seriesShort: se?.short || se?.name || "",
      circuitId: ev.circuitId,
      circuitName: ev.circuitName,
      carNumber,
      carId: id(carI),
      teamId: id(teamI),
      className,
      classColor: (className && s.colors[`${ev.seasonId}|${className}`]) || getClassColor(className),
      pic,
      classSize,
      position,
      fieldSize,
      status,
      laps,
      gap,
      driverIds: drivers.map((i) => s.ids[i]),
      livery: s.liveries[`${ev.seasonId}|${carNumber}`],
      pole: !!pole,
    };
  });
  const withId = <T>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, id: k }]));
  return assemble(entries, {
    drivers: withId(s.drivers) as Record<string, DriverRow>,
    teams: withId(s.teams) as Record<string, TeamRow>,
    cars: withId(s.cars) as Record<string, CarRow>,
    fingerprints: s.fingerprints,
    driverPoles: new Map(Object.entries(s.poles)),
    driverEvents: new Map(Object.entries(s.events_seen)),
    series: s.series,
    championships: s.championships ? new Map(Object.entries(s.championships)) : undefined,
    teammates: new Map(Object.entries(s.teammates || {}).map(([k, v]) => [k, v.map(([id, races, ahead, behind]) => ({ id, races, ahead, behind }))])),
  });
}

/** Merge several (partial) books, e.g. the two drivers on the Compare page. */
export function mergeRecordBooks(books: RecordBook[]): RecordBook {
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const b of books)
    for (const e of b.entries)
      if (!seen.has(e.key)) {
        seen.add(e.key);
        entries.push(e);
      }
  entries.sort(entryOrder);
  const series = new Map<string, SeriesLite>();
  for (const b of books) for (const s of b.series) series.set(s.id, s);
  const champs = new Map<string, Record<string, ChampPlace[]>>();
  for (const b of books) for (const [k, v] of b.championships || []) champs.set(k, v);
  const mates = new Map<string, TeamMate[]>();
  for (const b of books) for (const [k, v] of b.teammates || []) mates.set(k, v);
  return assemble(entries, {
    drivers: Object.assign({}, ...books.map((b) => b.drivers)),
    teams: Object.assign({}, ...books.map((b) => b.teams)),
    cars: Object.assign({}, ...books.map((b) => b.cars)),
    fingerprints: Object.assign({}, ...books.map((b) => b.fingerprints)),
    driverPoles: new Map(books.flatMap((b) => [...b.driverPoles])),
    driverEvents: new Map(books.flatMap((b) => [...b.driverEvents])),
    series: [...series.values()],
    championships: champs.size ? champs : undefined,
    teammates: mates,
  });
}

/* ── Directory index (public/data/derived/records/index.json) ──── */

/** [starts, wins, podiums] in one series */
export type SeriesTally = [number, number, number];

export interface IndexSummary {
  id: string;
  starts: number;
  wins: number;
  podiums: number;
  /** wins are class wins (every start in a classed race) */
  classed: boolean;
  classes: string[];
  classColors: Record<string, string>;
  /** series ids with starts */
  series: string[];
  bySeries: Record<string, SeriesTally>;
  years: [number, number] | null;
  /** most recent start */
  last: { date: string; teamId: string | null; team: string | null; carNumber: string; livery: string | null; color: string } | null;
}

export interface DriverIndexRow extends IndexSummary {
  name: string;
  nationality: string | null;
}
export interface TeamIndexRow extends IndexSummary {
  name: string;
}
export interface CarIndexRow extends IndexSummary {
  model_name: string;
  manufacturer: string | null;
  /** Class it raced most in */
  primary: string | null;
  teams: number;
  /** Most recent winning livery (else most recent livery) */
  hero: { livery: string | null; carNumber: string; color: string } | null;
}

export interface RecordIndex {
  series: (SeriesLite & { entries: number })[];
  /** Every class with starts, per series. */
  classes: { seriesId: string; name: string; color: string }[];
  drivers: DriverIndexRow[];
  teams: TeamIndexRow[];
  cars: CarIndexRow[];
  /** Suggested head-to-heads: the top two winners in each class / series. */
  rivalries: { a: string; b: string; why: string }[];
}

/*
 * Wire format (compact: the directory of thousands of drivers stays small).
 *   summary  = [id, starts, wins, podiums, classed 0|1, classIdx[], [seriesIdx, starts, wins, podiums][], firstYear, lastYear, last]
 *   last     = [date, teamIdx, carNumber, liveryIdx, classIdx] | 0     (idx -1 = none)
 *   driver   = [...summary, name, nationality]
 *   team     = [...summary, name]
 *   car      = [...summary, model, manufacturer, primaryClassIdx, teams, hero]
 *   hero     = [carNumber, liveryIdx, classIdx] | 0
 */
type LastWire = [string, number, string, number, number] | 0;
type SummaryWire = [string, number, number, number, 0 | 1, number[], [number, number, number, number][], number, number, LastWire];
type HeroWire = [string, number, number] | 0;

export interface RecordIndexWire {
  v: 2;
  series: (SeriesLite & { entries: number })[];
  /** [seriesIdx, className, colour] */
  classes: [number, string, string][];
  teamNames: string[];
  teamIds: string[];
  liveries: string[];
  drivers: [...SummaryWire, string, string | null][];
  teams: [...SummaryWire, string][];
  cars: [...SummaryWire, string, string | null, number, number, HeroWire][];
  rivalries: { a: string; b: string; why: string }[];
}

export function buildRecordIndex(book: RecordBook): RecordIndexWire {
  const seriesIdx = new Map(book.series.map((s, i) => [s.id, i]));
  const classes: [number, string, string][] = [];
  const classIdx = new Map<string, number>();
  const cIdx = (e: Entry) => {
    if (!e.className) return -1;
    const k = `${e.seriesId}|${e.className}`;
    let i = classIdx.get(k);
    if (i == null) {
      i = classes.length;
      classIdx.set(k, i);
      classes.push([seriesIdx.get(e.seriesId) ?? -1, e.className, e.classColor]);
    }
    return i;
  };
  const pool = () => {
    const list: string[] = [];
    const m = new Map<string, number>();
    return {
      list,
      at(x: string | null | undefined) {
        if (!x) return -1;
        let i = m.get(x);
        if (i == null) {
          i = list.length;
          m.set(x, i);
          list.push(x);
        }
        return i;
      },
    };
  };
  const teamPool = pool();
  const liveryPool = pool();
  const teamNames: string[] = [];
  const tIdx = (id: string | null) => {
    const i = teamPool.at(id);
    if (i >= 0 && teamNames[i] == null) teamNames[i] = book.teams[id!]?.full_name || "";
    return i;
  };

  const summary = (id: string, list: Entry[]): SummaryWire => {
    const t = tally(list);
    const s = list.filter(isStart);
    const by = new Map<number, [number, number, number, number]>();
    const cl = new Set<number>();
    for (const e of s) {
      const si = seriesIdx.get(e.seriesId) ?? -1;
      if (!by.has(si)) by.set(si, [si, 0, 0, 0]);
      const x = by.get(si)!;
      x[1]++;
      if (isWin(e)) x[2]++;
      if (isPodium(e)) x[3]++;
      const c = cIdx(e);
      if (c >= 0) cl.add(c);
    }
    const l = t.last;
    return [
      id,
      t.starts,
      t.wins,
      t.podiums,
      t.classed && !t.outright ? 1 : 0,
      [...cl].sort((a, b) => classRank(classes[a][1]) - classRank(classes[b][1])),
      [...by.values()],
      t.years[0] ?? 0,
      t.years[t.years.length - 1] ?? 0,
      l ? [l.raceDate, tIdx(l.teamId), l.carNumber, liveryPool.at(l.livery), cIdx(l)] : 0,
    ];
  };

  const drivers = Object.values(book.drivers).map((d) => [...summary(d.id, book.byDriver.get(d.id) || []), d.full_name, d.nationality ?? null] as RecordIndexWire["drivers"][number]);
  const teams = [...book.byTeam.entries()]
    .map(([id, list]) => [...summary(id, list), book.teams[id]?.full_name || "Unknown team"] as RecordIndexWire["teams"][number])
    .filter((r) => r[1] > 0);
  const cars = [...book.byCar.entries()]
    .filter(([id]) => book.cars[id])
    .map(([id, list]) => {
      const counts = new Map<string, { n: number; e: Entry }>();
      for (const e of list) if (e.className) counts.set(e.className, { n: (counts.get(e.className)?.n || 0) + 1, e });
      const primary = [...counts.values()].sort((a, b) => b.n - a.n)[0]?.e;
      const hero = [...list].reverse().find((e) => isWin(e) && e.livery) || [...list].reverse().find((e) => e.livery) || list[list.length - 1];
      return [
        ...summary(id, list),
        book.cars[id].model_name,
        book.cars[id].manufacturer ?? null,
        primary ? cIdx(primary) : -1,
        new Set(list.map((e) => e.teamId)).size,
        hero ? [hero.carNumber, liveryPool.at(hero.livery), cIdx(hero)] : 0,
      ] as RecordIndexWire["cars"][number];
    })
    .filter((r) => r[1] > 0);

  const seriesCount = new Map<string, number>();
  for (const e of book.entries) seriesCount.set(e.seriesId, (seriesCount.get(e.seriesId) || 0) + 1);

  // Rivalries: the top two winners of each class (or series, when it has no classes).
  const winners = new Map<string, { why: string; m: Map<string, number> }>();
  for (const e of book.entries) {
    if (!isWin(e)) continue;
    const k = e.className ? `c|${e.className}` : `s|${e.seriesId}`;
    if (!winners.has(k)) winners.set(k, { why: `${e.className || e.seriesShort} winners`, m: new Map() });
    const m = winners.get(k)!.m;
    for (const d of e.driverIds) m.set(d, (m.get(d) || 0) + 1);
  }
  const rivalries: RecordIndexWire["rivalries"] = [];
  for (const { why, m } of winners.values()) {
    const top = [...m.entries()].sort((x, y) => y[1] - x[1]);
    const x = top[0]?.[0];
    const y = top.find(([id]) => id !== x && !(book.byDriver.get(x) || []).some((e) => e.driverIds.includes(id)))?.[0];
    if (x && y) rivalries.push({ a: x, b: y, why });
  }

  return {
    v: 2,
    series: book.series.map((s) => ({ ...s, entries: seriesCount.get(s.id) || 0 })),
    classes,
    teamNames,
    teamIds: teamPool.list,
    liveries: liveryPool.list,
    drivers,
    teams,
    cars,
    rivalries: rivalries.slice(0, 9),
  };
}

export function decodeRecordIndex(w: RecordIndexWire): RecordIndex {
  const series = w.series;
  const cls = (i: number) => (i >= 0 ? w.classes[i] : null);
  const color = (i: number) => cls(i)?.[2] || getClassColor(null);
  const summary = (r: SummaryWire): IndexSummary => {
    const [id, starts, wins, podiums, classed, classIdx, by, y0, y1, l] = r;
    const classes = classIdx.map((i) => w.classes[i][1]);
    return {
      id,
      starts,
      wins,
      podiums,
      classed: !!classed,
      classes: [...new Set(classes)],
      classColors: Object.fromEntries(classIdx.map((i) => [w.classes[i][1], w.classes[i][2]])),
      series: by.map(([si]) => series[si]?.id).filter(Boolean),
      bySeries: Object.fromEntries(by.filter(([si]) => series[si]).map(([si, s, wn, p]) => [series[si].id, [s, wn, p] as SeriesTally])),
      years: y0 ? [y0, y1] : null,
      last: l
        ? {
            date: l[0],
            teamId: l[1] >= 0 ? w.teamIds[l[1]] : null,
            team: l[1] >= 0 ? w.teamNames[l[1]] || null : null,
            carNumber: l[2],
            livery: l[3] >= 0 ? w.liveries[l[3]] : null,
            color: color(l[4]),
          }
        : null,
    };
  };
  const S = 10; // summary length
  return {
    series,
    classes: w.classes.map(([si, name, c]) => ({ seriesId: series[si]?.id || "", name, color: c })),
    drivers: w.drivers.map((r) => ({ ...summary(r.slice(0, S) as SummaryWire), name: r[S] as string, nationality: (r[S + 1] as string | null) ?? null })),
    teams: w.teams.map((r) => ({ ...summary(r.slice(0, S) as SummaryWire), name: r[S] as string })),
    cars: w.cars.map((r) => {
      const hero = r[S + 4] as HeroWire;
      return {
        ...summary(r.slice(0, S) as SummaryWire),
        model_name: r[S] as string,
        manufacturer: (r[S + 1] as string | null) ?? null,
        primary: cls(r[S + 2] as number)?.[1] ?? null,
        teams: r[S + 3] as number,
        hero: hero ? { carNumber: hero[0], livery: hero[1] >= 0 ? w.liveries[hero[1]] : null, color: color(hero[2]) } : null,
      };
    }),
    rivalries: w.rivalries,
  };
}

/** Paths of the precomputed files, relative to the data root. */
export const recordFile = (kind: RecordKind, id: string) => `derived/records/${kind}/${encodeURIComponent(id)}.json`;
export const recordIndexFile = () => `derived/records/index.json`;
