/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Season championship tables, shared by the browser and the build.
 *
 * - `loadSeasonStandingsInput(db, seasonId)` loads one season's points-bearing
 *   results through any supabase-js style client (the site's `supabase`, or the
 *   Node store from scripts/lib/local-store.mjs).
 * - `buildChampionship(input)` turns them into driver and team standings with
 *   per-round and cumulative points (rules in ./standings.ts).
 *
 * scripts/build-derived.mjs writes `buildChampionship` for every season to
 * public/data/derived/standings/<seasonId>.json, so pages fetch a few KB
 * instead of the whole results tables. Relative `.ts` imports only: this
 * module also runs under `node --experimental-strip-types`.
 */
import { classRank } from "./insights.ts";
import {
  classFromExtra,
  classPositionFromRow,
  computeDriverStandings,
  computeTeamStandings,
  IMSA_RULES,
  standingsKindForSessionType,
  standingsRulesFor,
  type StandingsRules,
  type DriverStanding,
  type StandingsRow,
  type StandingsSession,
} from "./standings.ts";

export interface StandingsDriverMeta {
  id: string;
  name: string;
  nationality: string | null;
}

export interface SeasonStandingsInput {
  sessions: StandingsSession[];
  rows: StandingsRow[];
  drivers: Map<string, StandingsDriverMeta>;
  teams: Map<string, string>;
  /** Series rules (tie-break, teams' table); IMSA when absent. */
  rules?: StandingsRules;
}

/** Anything with supabase-js's `from(table)` query builder. */
export interface QueryClient {
  from: (table: any) => any;
}

const PAGE = 1000;

async function fetchAllPages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * - Only published events, only parent sessions (hourly endurance snapshots
 *   are excluded), only race and qualifying sessions.
 * - Paginates: a season easily exceeds PostgREST's 1000-row response cap
 *   (2025 WeatherTech has 1040 race rows), which used to drop results silently.
 */
export async function loadSeasonStandingsInput(db: QueryClient, seasonId: string): Promise<SeasonStandingsInput> {
  const { data: seasonRow } = await db.from("v2_seasons").select("id, v2_series(name, short_name)").eq("id", seasonId).maybeSingle();
  const rules = standingsRulesFor((seasonRow as any)?.v2_series);
  const empty: SeasonStandingsInput = { sessions: [], rows: [], drivers: new Map(), teams: new Map(), rules };

  const { data: events } = await db.from("v2_events").select("id, start_date, round_number").eq("season_id", seasonId).eq("status", "published");
  if (!events?.length) return empty;
  const eventOrder = new Map(
    [...(events as any[])]
      .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || "") || Number(a.round_number || 0) - Number(b.round_number || 0))
      .map((e, i) => [e.id, i] as const),
  );

  const sessionRows = (
    await Promise.all(
      chunk([...eventOrder.keys()], 100).map((ids) =>
        fetchAllPages<any>((from, to) =>
          db
            .from("v2_sessions")
            .select("id, event_id, name, session_type, parent_session_id, date, start_time, sort_order")
            .in("event_id", ids)
            .is("parent_session_id", null)
            .order("id")
            .range(from, to),
        ),
      ),
    )
  ).flat();

  const scoring = sessionRows
    .map((s) => ({ s, kind: standingsKindForSessionType(s.session_type) }))
    .filter((x) => x.kind && !x.s.parent_session_id)
    .sort(
      (a, b) =>
        (eventOrder.get(a.s.event_id) ?? 0) - (eventOrder.get(b.s.event_id) ?? 0) ||
        (a.s.date || "").localeCompare(b.s.date || "") ||
        (a.s.start_time || "").localeCompare(b.s.start_time || "") ||
        // qualifying before the race when no times are stored
        (a.kind === b.kind ? 0 : a.kind === "qualifying" ? -1 : 1) ||
        Number(a.s.sort_order || 0) - Number(b.s.sort_order || 0),
    );
  const sessions: StandingsSession[] = scoring.map(({ s, kind }, i) => ({
    id: s.id,
    kind: kind!,
    eventId: s.event_id,
    order: i,
    countsForWins: kind === "race" && !/sprint/i.test(s.name || "") && s.session_type !== "sprint_race",
  }));
  if (sessions.length === 0) return empty;

  const ids = sessions.map((s) => s.id);
  const fetchResults = (table: "v2_race_results" | "v2_qualifying_results") =>
    Promise.all(
      chunk(ids, 50).map((part) =>
        fetchAllPages<any>((from, to) =>
          db
            .from(table)
            .select(
              table === "v2_race_results"
                ? "id, session_id, car_number, driver_id, team_id, points, position, status, extra_data, v2_drivers(id, full_name, nationality), v2_teams(id, full_name)"
                : "id, session_id, car_number, driver_id, team_id, points, position, extra_data, v2_drivers(id, full_name, nationality), v2_teams(id, full_name)",
            )
            .in("session_id", part)
            .order("id")
            .range(from, to),
        ),
      ),
    ).then((r) => r.flat());
  const [race, qual] = await Promise.all([fetchResults("v2_race_results"), fetchResults("v2_qualifying_results")]);

  const drivers = new Map<string, StandingsDriverMeta>();
  const teams = new Map<string, string>();
  const rows: StandingsRow[] = [...race, ...qual].map((r: any) => {
    if (r.v2_drivers?.id) drivers.set(r.v2_drivers.id, { id: r.v2_drivers.id, name: r.v2_drivers.full_name, nationality: r.v2_drivers.nationality ?? null });
    if (r.v2_teams?.id) teams.set(r.v2_teams.id, r.v2_teams.full_name);
    return {
      sessionId: r.session_id,
      carNumber: r.car_number ?? null,
      driverId: r.driver_id ?? null,
      teamId: r.team_id ?? r.v2_teams?.id ?? null,
      points: r.points != null ? Number(r.points) : null,
      className: classFromExtra(r.extra_data),
      classPosition: classPositionFromRow(r.extra_data, r.position),
      status: r.status ?? null,
    };
  });
  return { sessions, rows, drivers, teams, rules };
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
  /** What the series calls the teams' table ("Teams", "Constructors", "Owners", "Entrants"). */
  teamLabel?: string;
  /** "car": one entry per car number; "team": one per team, all its cars. */
  teamKey?: "car" | "team";
  /** "imsa": IMSA countback; "countback": wins, then seconds, ... in main races. */
  tiebreak?: "imsa" | "countback";
  classes: string[];
  drivers: Record<string, ChampEntry[]>;
  teams: Record<string, ChampEntry[]>;
}

export function buildChampionship(input: SeasonStandingsInput): Championship {
  const rules = input.rules ?? IMSA_RULES;
  const rounds = [...new Set(input.sessions.map((s) => s.eventId))];
  const sessionEvent = new Map(input.sessions.map((s) => [s.id, s.eventId]));

  const per = (results: DriverStanding["results"]) => {
    const perRound = rounds.map((ev) => results.filter((r) => sessionEvent.get(r.sessionId) === ev).reduce((n, r) => n + r.points, 0));
    let acc = 0;
    return { perRound, cumulative: perRound.map((p) => (acc += p)) };
  };

  const drivers: Record<string, ChampEntry[]> = {};
  for (const s of computeDriverStandings(input.sessions, input.rows, rules)) {
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
  for (const t of computeTeamStandings(input.sessions, input.rows, rules)) {
    (teams[t.className] ??= []).push({
      key: t.key,
      position: t.position,
      totalPoints: t.totalPoints,
      wins: t.wins,
      podiums: t.podiums,
      ...per(t.results),
      driverIds: t.driverIds,
      teamId: t.teamId,
      carNumbers: t.carNumbers,
      name: (t.teamId && input.teams.get(t.teamId)) || `#${t.carNumber}`,
      nationality: null,
    });
  }
  for (const k of Object.keys(drivers)) drivers[k].sort((a, b) => a.position - b.position);
  for (const k of Object.keys(teams)) teams[k].sort((a, b) => a.position - b.position);
  const classes = [...new Set([...Object.keys(drivers), ...Object.keys(teams)])].sort((a, b) => classRank(a) - classRank(b) || a.localeCompare(b));
  return { rounds, teamLabel: rules.teamLabel, teamKey: rules.teamKey, tiebreak: rules.tiebreak, classes, drivers, teams };
}

/** Path of a season's precomputed championship, relative to the data root. */
export const championshipFile = (seasonId: string) => `derived/standings/${encodeURIComponent(seasonId)}.json`;
