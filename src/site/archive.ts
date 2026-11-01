/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared loaders and helpers for the archive pages: championships, circuits,
 * results, calendar and search. Everything is cached through `useLoad` so
 * pages that share data (e.g. /series and /series/:id) load it once.
 */
import { supabase } from "@/integrations/supabase/client";
import { classRank, parseTime, type ClassifiedCar, type EventDigest, type RaceDigest } from "@/lib/insights";
import { computeDriverStandings, computeTeamStandings, type DriverStanding, type TeamStanding } from "@/lib/standings";
import { fetchSeasonStandingsInput } from "@/lib/standings-data";
import { computeTrackMetrics, type TrackMetrics } from "@/lib/track-calculations";
import { getClassColor } from "@/lib/classes";
import { cleanName, lastName, useLoad } from "@/site/data";

/* ── Text ─────────────────────────────────────────────────────── */

export const stripYear = (name: string) => name.replace(/^\d{4}\s+/, "");

export function joinNames(list: string[]) {
  if (list.length <= 1) return list[0] || "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** Accent- and case-insensitive key for matching. */
export const fold = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export const readingMinutes = (body: string) => Math.max(1, Math.round(body.split(/\s+/).length / 230));

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parseDay(d?: string | null) {
  if (!d) return null;
  return new Date(d.slice(0, 10) + "T12:00:00");
}

/* ── Digests ──────────────────────────────────────────────────── */

/** The headline race of an event (the last one run). */
export const headline = (d?: EventDigest | null): RaceDigest | undefined => (d?.races.length ? d.races[d.races.length - 1] : undefined);

export const overallWinner = (race?: RaceDigest): ClassifiedCar | undefined => (race ? [...race.winners].sort((a, b) => a.position - b.position)[0] : undefined);

/** The closest-finish or winning-margin insight of a race, if any. */
export function closestFinish(race?: RaceDigest) {
  if (!race) return undefined;
  return race.insights.find((i) => i.kind === "closest_finish") || race.insights.find((i) => i.kind === "margin");
}

export function crewLastNames(ids: string[], names?: { drivers: Record<string, { full_name: string }> }, max = 4) {
  return ids
    .slice(0, max)
    .map((id) => lastName(names?.drivers[id]?.full_name))
    .filter(Boolean)
    .join(" / ");
}

/* ── Season classes (colours + order) ─────────────────────────── */

export interface SeasonClass {
  name: string;
  color: string;
  sort: number;
}

export async function fetchSeasonClasses(): Promise<Record<string, SeasonClass[]>> {
  const { data } = await supabase.from("v2_season_classes").select("season_id, class_name, color, sort_order");
  const out: Record<string, SeasonClass[]> = {};
  for (const r of (data || []) as any[]) {
    (out[r.season_id] ??= []).push({ name: r.class_name, color: r.color || getClassColor(r.class_name), sort: r.sort_order ?? 0 });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.sort - b.sort || classRank(a.name) - classRank(b.name));
  return out;
}
export const useSeasonClasses = () => useLoad("season-classes", fetchSeasonClasses).data;

export function classColor(seasonClasses: SeasonClass[] | undefined, name: string | null | undefined) {
  return seasonClasses?.find((c) => c.name === name)?.color || getClassColor(name);
}

/* ── Championship (drivers + teams with cumulative points per round) ── */

export interface ChampEntry {
  key: string;
  position: number;
  totalPoints: number;
  wins: number;
  podiums: number;
  /** One per round, cumulative. */
  cumulative: number[];
  /** Points scored in each round. */
  perRound: number[];
  /** drivers: one id; teams: the car's drivers. */
  driverIds: string[];
  teamId: string | null;
  carNumbers: string[];
  name: string;
  nationality: string | null;
}

export interface Championship {
  /** Event ids of the scored rounds, in order. */
  rounds: string[];
  classes: string[];
  drivers: Record<string, ChampEntry[]>;
  teams: Record<string, ChampEntry[]>;
  teamNames: Record<string, string>;
  driverMeta: Record<string, { name: string; nationality: string | null }>;
}

export async function fetchChampionship(seasonId: string): Promise<Championship> {
  const input = await fetchSeasonStandingsInput(seasonId);
  const rounds = [...new Set(input.sessions.map((s) => s.eventId))];
  const sessionEvent = new Map(input.sessions.map((s) => [s.id, s.eventId]));
  const teamNames = Object.fromEntries(input.teams);
  const driverMeta = Object.fromEntries([...input.drivers.values()].map((d) => [d.id, { name: d.name, nationality: d.nationality }]));

  const per = (results: DriverStanding["results"]) => {
    const perRound = rounds.map((ev) => results.filter((r) => sessionEvent.get(r.sessionId) === ev).reduce((n, r) => n + r.points, 0));
    let acc = 0;
    return { perRound, cumulative: perRound.map((p) => (acc += p)) };
  };

  const drivers: Record<string, ChampEntry[]> = {};
  for (const s of computeDriverStandings(input.sessions, input.rows)) {
    const meta = input.drivers.get(s.driverId);
    (drivers[s.className] ??= []).push({
      key: s.key,
      position: s.position,
      totalPoints: s.totalPoints,
      wins: s.wins,
      podiums: s.podiums,
      ...per(s.results),
      driverIds: [s.driverId],
      teamId: s.teamId,
      carNumbers: s.carNumbers,
      name: meta?.name || "Unknown",
      nationality: meta?.nationality ?? null,
    });
  }
  const teams: Record<string, ChampEntry[]> = {};
  for (const t of computeTeamStandings(input.sessions, input.rows) as TeamStanding[]) {
    (teams[t.className] ??= []).push({
      key: t.key,
      position: t.position,
      totalPoints: t.totalPoints,
      wins: t.wins,
      podiums: t.podiums,
      ...per(t.results),
      driverIds: t.driverIds,
      teamId: t.teamId,
      carNumbers: [t.carNumber],
      name: (t.teamId && input.teams.get(t.teamId)) || `#${t.carNumber}`,
      nationality: null,
    });
  }
  for (const k of Object.keys(drivers)) drivers[k].sort((a, b) => a.position - b.position);
  for (const k of Object.keys(teams)) teams[k].sort((a, b) => a.position - b.position);
  const classes = [...new Set([...Object.keys(drivers), ...Object.keys(teams)])].sort((a, b) => classRank(a) - classRank(b) || a.localeCompare(b));
  return { rounds, classes, drivers, teams, teamNames, driverMeta };
}
export const useChampionship = (seasonId: string | null | undefined) => useLoad(seasonId ? `champ:${seasonId}` : null, () => fetchChampionship(seasonId!));

/** Group entries that share a position (co-drivers on identical records). */
export function groupByPosition(list: ChampEntry[]) {
  const out: { position: number; entries: ChampEntry[] }[] = [];
  for (const e of list) {
    const last = out[out.length - 1];
    if (last && last.position === e.position) last.entries.push(e);
    else out.push({ position: e.position, entries: [e] });
  }
  return out;
}

/* ── Circuits ─────────────────────────────────────────────────── */

export interface CircuitRow {
  id: string;
  name: string;
  country: string | null;
  location: string | null;
}

export async function fetchCircuits(): Promise<CircuitRow[]> {
  const { data } = await supabase.from("v2_circuits").select("id, name, country, location").order("name");
  return (data || []) as CircuitRow[];
}
export const useCircuits = () => useLoad("circuits", fetchCircuits).data;

export interface LayoutRow {
  id: string;
  circuit_id: string;
  name: string | null;
  length_km: number | string | null;
  turns: number | null;
  total_straight_length_km: number | string | null;
  total_elevation_change_m: number | string | null;
  heavy_braking_corners: number | null;
  layout_image_url: string | null;
  sort_order: number | null;
}

export const layoutsOf = (circuitId: string, layouts?: any[]): LayoutRow[] =>
  ((layouts || []) as LayoutRow[]).filter((l) => l.circuit_id === circuitId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

export const fingerprint = (l?: LayoutRow | null): TrackMetrics | null =>
  l ? computeTrackMetrics(l.length_km, l.turns, l.total_straight_length_km, l.total_elevation_change_m, l.heavy_braking_corners) : null;

export const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Words for a layout's character: a noun ("speed circuit") and traits ("hilly", "with heavy braking zones"). */
export function characterWords(l?: LayoutRow | null): { noun: string; traits: string[] } {
  const fp = fingerprint(l);
  const NOUN: Record<string, string> = {
    "Power Circuit": "power circuit",
    "Speed Circuit": "speed circuit",
    "High-Speed Technical": "high-speed technical circuit",
    Balanced: "balanced circuit",
    Technical: "technical circuit",
    "Tight & Twisty": "tight, twisty circuit",
  };
  const EI: Record<string, string> = { Flat: "flat", Undulating: "undulating", Hilly: "hilly", Highland: "steeply hilly", Mountainous: "mountainous" };
  const CSI: Record<string, string> = {
    Flowing: "flowing",
    Rhythmic: "rhythmic",
    "High Braking Density": "with heavy braking zones",
    "Extreme Braking Density": "with brutal braking zones",
  };
  const traits = [fp?.eiCategory && EI[fp.eiCategory], fp?.csiCategory && CSI[fp.csiCategory]].filter(Boolean) as string[];
  return { noun: (fp?.tcsCategory && NOUN[fp.tcsCategory]) || "lap", traits };
}

/* ── Lap records (fastest race lap per class at a circuit) ────── */

export interface LapRecord {
  className: string;
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

const RACE_TYPES = ["race", "endurance_race", "sprint_race"];

export async function fetchLapRecords(eventIds: string[], years: Record<string, number | null>): Promise<LapRecord[]> {
  if (!eventIds.length) return [];
  const { data: sessions } = await supabase
    .from("v2_sessions")
    .select("id, event_id, name, session_type, parent_session_id")
    .in("event_id", eventIds)
    .is("parent_session_id", null);
  const races = ((sessions || []) as any[]).filter((s) => RACE_TYPES.includes(s.session_type));
  if (!races.length) return [];
  const sById = new Map(races.map((s) => [s.id, s]));
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("v2_race_results")
      .select("session_id, car_number, driver_id, team_id, car_id, fastest_lap_time, extra_data")
      .in("session_id", [...sById.keys()])
      .order("id")
      .range(from, from + 999);
    rows.push(...((data || []) as any[]));
    if (!data || data.length < 1000) break;
  }
  const best = new Map<string, LapRecord>();
  const crews = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = `${r.session_id}|${r.car_number}`;
    if (r.driver_id) (crews.get(k) ?? crews.set(k, new Set()).get(k)!).add(r.driver_id);
  }
  for (const r of rows) {
    const t = parseTime(r.fastest_lap_time);
    if (t == null || t <= 0) continue;
    const cls = (r.extra_data?.Class as string) || "Overall";
    const cur = best.get(cls);
    if (!cur || t < cur.seconds) {
      const s = sById.get(r.session_id)!;
      best.set(cls, {
        className: cls,
        seconds: t,
        time: String(r.fastest_lap_time),
        carNumber: String(r.car_number),
        driverIds: [...(crews.get(`${r.session_id}|${r.car_number}`) || [])],
        teamId: r.team_id ?? null,
        carId: r.car_id ?? null,
        eventId: s.event_id,
        sessionName: s.name,
        year: years[s.event_id] ?? null,
      });
    }
  }
  return [...best.values()].sort((a, b) => classRank(a.className) - classRank(b.className) || a.seconds - b.seconds);
}

/* ── Series ───────────────────────────────────────────────────── */

export interface SeriesRow {
  id: string;
  name: string;
  short_name: string | null;
}
export async function fetchSeries(): Promise<SeriesRow[]> {
  const { data } = await supabase.from("v2_series").select("id, name, short_name").order("name");
  return (data || []) as SeriesRow[];
}
export const useSeries = () => useLoad("series", fetchSeries).data;

/* ── Search corpus ────────────────────────────────────────────── */

export async function fetchAliases(): Promise<{ alias: string; canonical: string; entity_type: string }[]> {
  const { data } = await supabase.from("search_aliases").select("alias, canonical, entity_type");
  return (data || []) as any[];
}
export const useAliases = () => useLoad("aliases", fetchAliases).data;

export async function fetchTeamsFull(): Promise<{ id: string; full_name: string; short_name: string | null; nationality: string | null }[]> {
  const { data } = await supabase.from("v2_teams").select("id, full_name, short_name, nationality");
  return (data || []) as any[];
}

/** Wins per driver id across all digests (overall + class wins of headline races). */
export function winsByDriver(digests?: Record<string, EventDigest> | null) {
  const m = new Map<string, number>();
  for (const d of Object.values(digests || {})) for (const r of d.races) for (const w of r.winners) for (const id of w.driverIds) m.set(id, (m.get(id) || 0) + 1);
  return m;
}

export { cleanName };
