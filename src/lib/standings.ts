/**
 * Championship standings computed from stored per-result points.
 *
 * Pure functions (no Supabase, no React) so they can be unit tested.
 * Rules, checked against IMSA's official points data for the 2025 and 2026
 * WeatherTech Championship and Michelin Pilot Challenge (see
 * supabase/functions/_shared/imsa-points.ts for the points scale itself):
 *
 * - Only parent sessions count. Hourly snapshots of an endurance race carry
 *   their parent's `parent_session_id` and never score.
 * - A car's points for a session are counted once, however many driver rows
 *   the car has in that session.
 * - Teams (cars) are keyed by car number + class, so a car that changes class
 *   keeps separate records and two cars sharing a number in different classes
 *   never merge.
 * - Drivers earn their car's race points, and their car's qualifying points
 *   for the event (qualifying points go to every driver of the car, plus the
 *   driver who qualified it even if they did not race).
 * - A driver entered in two cars of the same class in the same session scores
 *   only for their regular car (the car they appear with most often in that
 *   class that season). In different classes they score in each class.
 * - Ties: countback on class positions across scoring sessions (more wins,
 *   then more seconds, ... qualifying included; the position is the one the
 *   points imply, so post-session penalties count), then whoever achieved
 *   the deciding result first. Entries with identical records share a position
 *   (as co-drivers do in IMSA's tables); positions are dense (1, 1, 2, ...).
 *
 * Other series (`standingsRulesFor`): points are always the stored points
 * (stage, sprint, fastest-lap, pole and bonus points included as imported),
 * summed. Ties go to a generic countback on finishing positions in the main
 * races (more wins, then more seconds, ...; sprints and qualifying excluded),
 * then the earliest deciding result. Drivers who started a race appear even
 * with no points. The teams' table is per car number (IMSA teams, NASCAR
 * owners, INDYCAR entrants) or per team summing all its cars (F1 constructors).
 */

export type StandingsSessionKind = "race" | "qualifying";

export interface StandingsSession {
  id: string;
  kind: StandingsSessionKind;
  eventId: string;
  /** Chronological order across the season (lower = earlier). */
  order: number;
  /** Main races count towards wins/podiums (sprint races and qualifying do not). */
  countsForWins?: boolean;
}

export interface StandingsRow {
  sessionId: string;
  carNumber: string | null;
  driverId: string | null;
  teamId?: string | null;
  points: number | null;
  /** Class name; null/"" for single-class series. */
  className: string | null;
  /** Position in class (or overall in a single-class session). */
  classPosition: number | null;
  status?: string | null;
}

export interface SessionResult {
  sessionId: string;
  order: number;
  points: number;
  classPosition: number | null;
  kind?: StandingsSessionKind;
  /** a main race (not sprint/qualifying) the entry started (generic countback) */
  main?: boolean;
}

/* ── Series rules ───────────────────────────────────────────────── */

export interface StandingsRules {
  /** "imsa": IMSA countback (positions implied by the IMSA points scale, qualifying included); "countback": wins, then seconds, ... in main races */
  tiebreak: "imsa" | "countback";
  /** "car": the teams' table is per car number (and class); "team": per team, all its cars together */
  teamKey: "car" | "team";
  /** What the series calls its teams' championship. */
  teamLabel: string;
  /** List drivers / entries who started a race but scored no points. */
  includeZero: boolean;
}

export const IMSA_RULES: StandingsRules = { tiebreak: "imsa", teamKey: "car", teamLabel: "Teams", includeZero: false };
export const GENERIC_RULES: StandingsRules = { tiebreak: "countback", teamKey: "car", teamLabel: "Teams", includeZero: true };

/** IMSA-sanctioned championships (WeatherTech, Michelin Pilot Challenge, VP Racing, MX-5 Cup, ...). */
export const isImsaSeries = (series: { name?: string | null; short_name?: string | null } | null | undefined) =>
  /\bIMSA\b|WeatherTech|Michelin Pilot|VP Racing SportsCar|Prototype Challenge|Mazda MX-5|MX-5 CUP|Porsche Carrera Cup North America|Lamborghini Super Trofeo North America/i.test(
    `${series?.name || ""} ${series?.short_name || ""}`,
  );

/** The standings rules for a series, from its name. */
export function standingsRulesFor(series: { name?: string | null; short_name?: string | null } | null | undefined): StandingsRules {
  const n = `${series?.name || ""} ${series?.short_name || ""}`;
  if (isImsaSeries(series)) return IMSA_RULES;
  if (/formula (1|one)\b|\bF1\b/i.test(n)) return { ...GENERIC_RULES, teamKey: "team", teamLabel: "Constructors" };
  if (/nascar/i.test(n)) return { ...GENERIC_RULES, teamLabel: "Owners" };
  if (/indy ?car/i.test(n)) return { ...GENERIC_RULES, teamLabel: "Entrants" };
  return GENERIC_RULES;
}

/* IMSA race scale (see supabase/functions/_shared/imsa-points.ts). */
const RACE_SCALE = [350, 320, 300, 280, 260, 250, 240, 230, 220, 210, 200, 190, 180, 170, 160, 150, 140, 130, 120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10];

/**
 * Position used for countback: the place implied by the points awarded
 * (which already reflect penalties applied after the results were posted),
 * falling back to the stored class position when the points are not on the
 * IMSA scale or are ambiguous (10 race points / 1 qualifying point = 30th or lower).
 */
export function countbackPosition(r: SessionResult): number | null {
  const scale = r.kind === "qualifying" ? RACE_SCALE.map((p) => Math.round(p / 10)) : RACE_SCALE;
  const i = scale.indexOf(r.points);
  if (i >= 0 && i < scale.length - 1) return i + 1;
  if (i === scale.length - 1) return Math.max(scale.length, r.classPosition ?? scale.length);
  return r.classPosition;
}

export interface TeamStanding {
  key: string;
  /** Most used car number (per-car tables have exactly one). */
  carNumber: string;
  carNumbers: string[];
  className: string;
  teamId: string | null;
  driverIds: string[];
  totalPoints: number;
  position: number;
  wins: number;
  podiums: number;
  results: SessionResult[];
}

export interface DriverStanding {
  key: string;
  driverId: string;
  className: string;
  /** Cars the driver scored with, most used first. */
  carNumbers: string[];
  teamId: string | null;
  totalPoints: number;
  position: number;
  wins: number;
  podiums: number;
  results: SessionResult[];
}

/* ── Small helpers used by pages when building rows ─────────────────── */

/** Map a v2_sessions.session_type to a points-scoring kind. Practice never scores. */
export function standingsKindForSessionType(sessionType: string | null | undefined): StandingsSessionKind | null {
  if (sessionType === "race" || sessionType === "endurance_race" || sessionType === "sprint_race") return "race";
  if (sessionType === "qualifying") return "qualifying";
  return null;
}

/** Class name from a result row's extra_data (Class / class). */
export function classFromExtra(extra: unknown): string | null {
  const ex = extra && typeof extra === "object" ? (extra as Record<string, unknown>) : null;
  const c = ex?.Class ?? ex?.class;
  return c == null || c === "" ? null : String(c);
}

/** Class position from extra_data.PIC (number or numeric string), else the overall position. */
export function classPositionFromRow(extra: unknown, position: number | null | undefined): number | null {
  const ex = extra && typeof extra === "object" ? (extra as Record<string, unknown>) : null;
  const pic = ex?.PIC != null && ex.PIC !== "" ? Number(ex.PIC) : NaN;
  if (classFromExtra(extra) && Number.isFinite(pic) && pic > 0) return pic;
  return typeof position === "number" && Number.isFinite(position) ? position : null;
}

const NO_RESULT_STATUSES = new Set(["dns", "dsq"]);

/* ── Core computation ──────────────────────────────────────────────── */

interface CarSession {
  sessionId: string;
  carKey: string;
  carNumber: string;
  className: string;
  points: number;
  classPosition: number | null;
  status: string | null;
  teamId: string | null;
  driverIds: string[];
}

export const carKeyOf = (carNumber: string, className: string | null | undefined) => `${className || ""}|${carNumber}`;

/** One record per (session, car), with that car's drivers in the session. */
function collapseRows(sessions: Map<string, StandingsSession>, rows: StandingsRow[]): CarSession[] {
  const map = new Map<string, CarSession>();
  for (const r of rows) {
    if (!r.carNumber || !sessions.has(r.sessionId)) continue;
    const className = r.className || "";
    const carKey = carKeyOf(r.carNumber, className);
    const k = `${r.sessionId}#${carKey}`;
    let cs = map.get(k);
    if (!cs) {
      cs = {
        sessionId: r.sessionId,
        carKey,
        carNumber: r.carNumber,
        className,
        points: 0,
        classPosition: r.classPosition ?? null,
        status: r.status ?? null,
        teamId: r.teamId ?? null,
        driverIds: [],
      };
      map.set(k, cs);
    }
    const pts = r.points != null && Number.isFinite(Number(r.points)) ? Number(r.points) : 0;
    // Driver rows of one car repeat the car's points: take it once, not the sum.
    if (pts > cs.points) cs.points = pts;
    if (cs.classPosition == null && r.classPosition != null) cs.classPosition = r.classPosition;
    if (!cs.teamId && r.teamId) cs.teamId = r.teamId;
    if (r.driverId && !cs.driverIds.includes(r.driverId)) cs.driverIds.push(r.driverId);
  }
  return [...map.values()];
}

function isPodiumEligible(cs: CarSession, session: StandingsSession | undefined): boolean {
  return !!session && session.kind === "race" && session.countsForWins !== false && !NO_RESULT_STATUSES.has(cs.status || "");
}

/**
 * Countback comparison: negative when `a` ranks ahead of `b`.
 * Points first, then best class positions (lexicographic over sorted
 * positions of scoring sessions), then the earliest achievement.
 */
export function compareStandings(
  a: { totalPoints: number; results: SessionResult[] },
  b: { totalPoints: number; results: SessionResult[] },
  rules: Pick<StandingsRules, "tiebreak"> = IMSA_RULES,
): number {
  if (Math.abs(b.totalPoints - a.totalPoints) > 1e-9) return b.totalPoints - a.totalPoints;
  const position = (r: SessionResult) =>
    rules.tiebreak === "imsa" ? (r.points > 0 ? countbackPosition(r) : null) : r.main && r.classPosition != null && r.classPosition > 0 ? r.classPosition : null;
  const scoring = (x: { results: SessionResult[] }) =>
    x.results
      .map((r) => ({ order: r.order, pos: position(r) }))
      .filter((r): r is { order: number; pos: number } => r.pos != null)
      .sort((p, q) => p.pos - q.pos || p.order - q.order);
  const ra = scoring(a);
  const rb = scoring(b);
  const n = Math.min(ra.length, rb.length);
  for (let i = 0; i < n; i++) {
    const d = ra[i].pos - rb[i].pos;
    if (d !== 0) return d;
  }
  if (ra.length !== rb.length) return rb.length - ra.length;
  for (let i = 0; i < n; i++) {
    const d = ra[i].order - rb[i].order;
    if (d !== 0) return d;
  }
  return 0;
}

/** Sort with `compareStandings` and assign dense positions (identical records share one). */
export function rankStandings<T extends { totalPoints: number; results: SessionResult[]; position: number }>(
  list: T[],
  tiebreakKey: (t: T) => string,
  rules: Pick<StandingsRules, "tiebreak"> = IMSA_RULES,
): T[] {
  const sorted = [...list].sort((a, b) => compareStandings(a, b, rules) || tiebreakKey(a).localeCompare(tiebreakKey(b)));
  let pos = 0;
  sorted.forEach((e, i) => {
    if (i === 0 || compareStandings(sorted[i - 1], e, rules) !== 0) pos++;
    e.position = pos;
  });
  return sorted;
}

const sessionResult = (cs: CarSession, s: StandingsSession): SessionResult => ({
  sessionId: cs.sessionId,
  order: s.order,
  points: cs.points,
  classPosition: cs.classPosition,
  kind: s.kind,
  main: isPodiumEligible(cs, s),
});

/** Keep an entry in the table: it scored, or (when the rules list them) it started a race. */
const listed = (e: { totalPoints: number; results: SessionResult[] }, rules: StandingsRules) => e.totalPoints > 0 || (rules.includeZero && e.results.some((r) => r.kind === "race" && r.main));

/**
 * Teams' standings for every class: per car number (IMSA teams, NASCAR owners,
 * INDYCAR entrants) or per team with all its cars (F1 constructors).
 * Entries with 0 points are omitted unless the rules list them.
 */
export function computeTeamStandings(sessionList: StandingsSession[], rows: StandingsRow[], rules: StandingsRules = IMSA_RULES): TeamStanding[] {
  const sessions = new Map(sessionList.map((s) => [s.id, s]));
  const carSessions = collapseRows(sessions, rows);
  // Per-team tables: a car belongs to the team it ran for most (a car number may change hands).
  const teamOfCar = new Map<string, string | null>();
  if (rules.teamKey === "team") {
    const use = new Map<string, Map<string, number>>();
    for (const cs of carSessions) {
      if (!cs.teamId) continue;
      if (!use.has(cs.carKey)) use.set(cs.carKey, new Map());
      use.get(cs.carKey)!.set(cs.teamId, (use.get(cs.carKey)!.get(cs.teamId) || 0) + 1);
    }
    for (const [car, m] of use) teamOfCar.set(car, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
  const teams = new Map<string, TeamStanding & { carUse: Map<string, number> }>();
  for (const cs of carSessions) {
    const s = sessions.get(cs.sessionId)!;
    const teamId = rules.teamKey === "team" ? cs.teamId || teamOfCar.get(cs.carKey) || null : null;
    const key = rules.teamKey === "team" && teamId ? `${cs.className}|team:${teamId}` : cs.carKey;
    let t = teams.get(key);
    if (!t) {
      t = { key, carNumber: cs.carNumber, carNumbers: [], className: cs.className, teamId: cs.teamId, driverIds: [], totalPoints: 0, position: 0, wins: 0, podiums: 0, results: [], carUse: new Map() };
      teams.set(key, t);
    }
    if (!t.teamId && cs.teamId) t.teamId = cs.teamId;
    t.carUse.set(cs.carNumber, (t.carUse.get(cs.carNumber) || 0) + 1);
    for (const d of cs.driverIds) if (!t.driverIds.includes(d)) t.driverIds.push(d);
    t.totalPoints += cs.points;
    t.results.push(sessionResult(cs, s));
    if (isPodiumEligible(cs, s) && cs.classPosition != null) {
      if (cs.classPosition === 1) t.wins++;
      if (cs.classPosition <= 3) t.podiums++;
    }
  }
  const byClass = new Map<string, TeamStanding[]>();
  for (const { carUse, ...t } of teams.values()) {
    if (!listed(t, rules)) continue;
    t.carNumbers = [...carUse.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    t.carNumber = t.carNumbers[0];
    if (!byClass.has(t.className)) byClass.set(t.className, []);
    byClass.get(t.className)!.push(t);
  }
  return [...byClass.values()].flatMap((list) => rankStandings(list, (t) => t.carNumber, rules));
}

/** Drivers' standings for every class. Entries with 0 points are omitted. */
export function computeDriverStandings(sessionList: StandingsSession[], rows: StandingsRow[], rules: StandingsRules = IMSA_RULES): DriverStanding[] {
  const sessions = new Map(sessionList.map((s) => [s.id, s]));
  const carSessions = collapseRows(sessions, rows);

  // Drivers of each car per event (from race sessions), for qualifying credit.
  const eventCarDrivers = new Map<string, Set<string>>();
  for (const cs of carSessions) {
    const s = sessions.get(cs.sessionId)!;
    if (s.kind !== "race") continue;
    const k = `${s.eventId}#${cs.carKey}`;
    if (!eventCarDrivers.has(k)) eventCarDrivers.set(k, new Set());
    for (const d of cs.driverIds) eventCarDrivers.get(k)!.add(d);
  }

  // Credits: (session, driver) -> car sessions the driver could score with.
  const credits = new Map<string, CarSession[]>();
  const usage = new Map<string, Map<string, number>>(); // driver|class -> carKey -> sessions
  for (const cs of carSessions) {
    const s = sessions.get(cs.sessionId)!;
    const drivers = new Set(cs.driverIds);
    if (s.kind === "qualifying") for (const d of eventCarDrivers.get(`${s.eventId}#${cs.carKey}`) || []) drivers.add(d);
    for (const d of drivers) {
      const k = `${cs.sessionId}#${d}#${cs.className}`;
      if (!credits.has(k)) credits.set(k, []);
      credits.get(k)!.push(cs);
      const u = `${d}#${cs.className}`;
      if (!usage.has(u)) usage.set(u, new Map());
      usage.get(u)!.set(cs.carKey, (usage.get(u)!.get(cs.carKey) || 0) + 1);
    }
  }

  const standings = new Map<string, DriverStanding & { carUse: Map<string, number> }>();
  for (const [k, options] of credits) {
    const [sessionId, driverId, className] = k.split("#");
    const use = usage.get(`${driverId}#${className}`)!;
    // Cross-entered in two cars of one class: score only for the regular car.
    const cs = [...options].sort((a, b) => (use.get(b.carKey) || 0) - (use.get(a.carKey) || 0) || a.points - b.points)[0];
    const s = sessions.get(sessionId)!;
    const key = `${className}|${driverId}`;
    let d = standings.get(key);
    if (!d) {
      d = { key, driverId, className, carNumbers: [], teamId: null, totalPoints: 0, position: 0, wins: 0, podiums: 0, results: [], carUse: new Map() };
      standings.set(key, d);
    }
    d.totalPoints += cs.points;
    d.results.push(sessionResult(cs, s));
    d.carUse.set(cs.carNumber, (d.carUse.get(cs.carNumber) || 0) + 1);
    if (!d.teamId && cs.teamId) d.teamId = cs.teamId;
    if (isPodiumEligible(cs, s) && cs.classPosition != null) {
      if (cs.classPosition === 1) d.wins++;
      if (cs.classPosition <= 3) d.podiums++;
    }
  }

  const byClass = new Map<string, DriverStanding[]>();
  for (const { carUse, ...d } of standings.values()) {
    if (!listed(d, rules)) continue;
    d.carNumbers = [...carUse.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    if (!byClass.has(d.className)) byClass.set(d.className, []);
    byClass.get(d.className)!.push(d);
  }
  return [...byClass.values()].flatMap((list) => rankStandings(list, (x) => x.driverId, rules));
}
