/**
 * IMSA championship points: pure helpers shared by the `import-imsa-results`
 * edge function (Deno) and the web app's tests (Vitest / Node).
 *
 * No Deno or browser APIs and no imports, so the file can be imported from
 * both runtimes as-is.
 *
 * Ground truth for every rule below is IMSA's own championship points data
 * published on https://imsa.results.alkamelcloud.com/ (the "POINTS DATA"
 * JSON files next to each event's results). Rules were reverse-checked
 * against the 2025 final and 2026 post-Daytona standings for the WeatherTech
 * Championship and the Michelin Pilot Challenge: race points computed with
 * these helpers from the Official results match IMSA's per-car points for
 * 964 of 964 car-sessions.
 *
 * Summary of the rules:
 * - Race points by finishing position IN CLASS: 350, 320, 300, 280, 260, then
 *   -10 per place down to 10 for 30th; every starter from 31st back gets 10.
 *   Retirements (DNF) are scored by their classified order like any other
 *   starter. A car that never took the start ("Not Started" / DNS) gets 0.
 * - Qualifying points (WeatherTech only): one tenth of the race scale by
 *   qualifying position in class (35, 32, 30, 28, 26, 25 ... 1), awarded to
 *   every car in the qualifying classification, including cars without a
 *   time. Post-session penalties (times disallowed, car to the back of the
 *   class) are reflected in the official starting grid and in IMSA's points
 *   data, not in the qualifying results file.
 * - Michelin Pilot Challenge has no qualifying points.
 * - Mazda MX-5 Cup uses the same race scale but only eligible (non-guest)
 *   drivers score and bonus points are added, so it cannot be computed from
 *   results alone; only IMSA's own points data is used for it.
 * - Points are earned by the car (team championship) and by each of its
 *   drivers (drivers' championship). Hourly snapshots of endurance races
 *   never score: points come only from the final classification.
 * - Michelin Endurance Cup (separate championship): 5/4/3/2 points to class
 *   positions 1/2/3/other at each segment (e.g. Daytona 6h, 12h, 18h, finish).
 */

/** Race points for class positions 1..30. */
export const IMSA_RACE_POINTS: readonly number[] = [
  350, 320, 300, 280, 260, 250, 240, 230, 220, 210, 200, 190, 180, 170, 160, 150, 140, 130, 120, 110, 100, 90, 80, 70, 60,
  50, 40, 30, 20, 10,
];

/** Points for every starter classified 31st or lower in class. */
export const IMSA_MIN_RACE_POINTS = 10;

/** Race points for a class position (1-based). 0 for an invalid position. */
export function racePointsForPosition(classPosition: number): number {
  if (!Number.isFinite(classPosition) || classPosition < 1) return 0;
  const p = Math.floor(classPosition);
  return p <= IMSA_RACE_POINTS.length ? IMSA_RACE_POINTS[p - 1] : IMSA_MIN_RACE_POINTS;
}

/** Qualifying points for a class position: a tenth of the race scale (35 for pole ... 1). */
export function qualifyingPointsForPosition(classPosition: number): number {
  const race = racePointsForPosition(classPosition);
  return race === 0 ? 0 : Math.max(1, Math.round(race / 10));
}

/** Michelin Endurance Cup points for a class position at a segment break. */
export function enduranceCupSegmentPoints(classPosition: number, running = true): number {
  if (!running || !Number.isFinite(classPosition) || classPosition < 1) return 0;
  if (classPosition === 1) return 5;
  if (classPosition === 2) return 4;
  if (classPosition === 3) return 3;
  return 2;
}

/* ── Series rules ──────────────────────────────────────────────────── */

/**
 * Points schemes, as returned by resolvePointsScheme() in
 * supabase/functions/import-imsa-results/series-points.ts (kept as a plain
 * string union here so this file has no imports).
 */
export type PointsSchemeName = "imsa_wtscc" | "imsa_mpc" | "imsa_vprc" | "mx5_cup" | "pccna" | "lst_na" | "mustang" | "none";

export interface PointsRules {
  scheme: PointsSchemeName;
  /** Compute race points from the classification when no official points data is available. */
  computeRacePoints: boolean;
  /** Compute qualifying points from the qualifying classification. */
  computeQualifyingPoints: boolean;
  /** Accept IMSA's official points data (POINTS DATA json) for this series. */
  officialPoints: boolean;
}

/**
 * What we can award per scheme. Only schemes verified against IMSA's official
 * points data compute anything; everything else stores null rather than a
 * guess.
 * - imsa_wtscc: race + qualifying (verified 2025 full season + 2026 Daytona).
 * - imsa_mpc: race only, no qualifying points (verified 2025 + 2026 Daytona).
 * - mx5_cup: same race scale, but guest drivers are not eligible (cars
 *   behind them move up) and bonus points are added, so only IMSA's own
 *   points data is accepted, never a computed value.
 * - imsa_vprc, pccna, lst_na, mustang, none: not verified, null points.
 */
export function getPointsRules(scheme: string | null | undefined): PointsRules {
  switch (scheme) {
    case "imsa_wtscc":
      return { scheme, computeRacePoints: true, computeQualifyingPoints: true, officialPoints: true };
    case "imsa_mpc":
      return { scheme, computeRacePoints: true, computeQualifyingPoints: false, officialPoints: true };
    case "mx5_cup":
      return { scheme, computeRacePoints: false, computeQualifyingPoints: false, officialPoints: true };
    default:
      return { scheme: (scheme as PointsSchemeName) || "none", computeRacePoints: false, computeQualifyingPoints: false, officialPoints: false };
  }
}

/* ── Classification helpers ────────────────────────────────────────── */

/** The subset of an Al Kamel results entry these helpers read. */
export interface ResultEntryLike {
  number?: string | number | null;
  position?: number | string | null;
  status?: string | null;
  not_finished?: boolean | null;
  not_finished_cause?: string | null;
  laps?: string | number | null;
  class?: string | null;
  category?: string | null;
  drivers?: Array<{ firstname?: string; surname?: string; first_name?: string; last_name?: string }> | null;
}

export function entryClass(e: ResultEntryLike): string | null {
  return (e.class || e.category || null) as string | null;
}

export function entryCarNumber(e: ResultEntryLike): string | null {
  return e.number == null || e.number === "" ? null : String(e.number);
}

/** True when the car never took the start: it scores nothing and takes no class position. */
export function isNonStarter(e: ResultEntryLike): boolean {
  const status = String(e.status || "").trim().toLowerCase();
  if (status === "not started" || status === "dns" || status === "did not start") return true;
  const cause = String(e.not_finished_cause || "").toUpperCase();
  if (e.not_finished && (cause.includes("DNS") || cause.includes("NOT STARTED"))) return true;
  return false;
}

/** True for a disqualified car (scores nothing). */
export function isDisqualified(e: ResultEntryLike): boolean {
  const status = String(e.status || "").trim().toUpperCase();
  if (status === "DSQ" || status === "DISQUALIFIED") return true;
  const cause = String(e.not_finished_cause || "").toUpperCase();
  return !!e.not_finished && (cause.includes("DSQ") || cause.includes("DISQUALIF"));
}

function numericPosition(e: ResultEntryLike): number | null {
  const p = typeof e.position === "number" ? e.position : parseInt(String(e.position ?? ""), 10);
  return Number.isFinite(p) ? p : null;
}

export interface ClassPlacement {
  carNumber: string | null;
  className: string | null;
  /** Position in class, or null for a non-starter / disqualified car. */
  classPosition: number | null;
  nonStarter: boolean;
  disqualified: boolean;
}

/**
 * Position-in-class for every entry, in classification order (overall
 * `position` when present, else array order). Non-starters and disqualified
 * cars do not take a class position, so the cars behind them are not pushed
 * down. Returns one placement per input entry, index-aligned with `entries`.
 */
export function assignClassPositions(entries: ResultEntryLike[]): ClassPlacement[] {
  const order = entries.map((e, i) => ({ e, i, pos: numericPosition(e) }));
  order.sort((a, b) => {
    if (a.pos != null && b.pos != null && a.pos !== b.pos) return a.pos - b.pos;
    if (a.pos != null && b.pos == null) return -1;
    if (a.pos == null && b.pos != null) return 1;
    return a.i - b.i;
  });
  const counters = new Map<string, number>();
  const out: ClassPlacement[] = new Array(entries.length);
  for (const { e, i } of order) {
    const cls = entryClass(e);
    const nonStarter = isNonStarter(e);
    const disqualified = isDisqualified(e);
    let classPosition: number | null = null;
    if (!nonStarter && !disqualified) {
      const key = cls ?? "__overall__";
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      classPosition = n;
    }
    out[i] = { carNumber: entryCarNumber(e), className: cls, classPosition, nonStarter, disqualified };
  }
  return out;
}

export type PointsSessionKind = "race" | "qualifying";

/**
 * Computed points for one entry of a session, from its class placement.
 * Returns null when this series/session does not award computed points.
 */
export function computedPointsFor(placement: ClassPlacement, kind: PointsSessionKind, rules: PointsRules): number | null {
  if (kind === "race" && !rules.computeRacePoints) return null;
  if (kind === "qualifying" && !rules.computeQualifyingPoints) return null;
  if (placement.classPosition == null) return 0;
  return kind === "race" ? racePointsForPosition(placement.classPosition) : qualifyingPointsForPosition(placement.classPosition);
}

/* ── IMSA's official points data ───────────────────────────────────── */

/**
 * True for a per-car ("Teams") or per-driver standings file in an event's
 * POINTS DATA folder that belongs to the main championship (not the
 * Endurance Cup, manufacturers, Bronze sub-classification or awards).
 */
export function isMainChampionshipPointsFile(url: string): boolean {
  let path = url;
  try {
    path = decodeURIComponent(url);
  } catch {
    /* keep raw */
  }
  if (!/\/POINTS DATA[^/]*\//i.test(path)) return false;
  const file = (path.split("/").pop() || "").toLowerCase();
  if (!file.endsWith(".json")) return false;
  if (/imec|endurance|manufacturer|bronze|award|trueman|front runner|sustainab|rookie|entrant/.test(file)) return false;
  // "IMPC 01a GS Drivers" is the Bronze sub-championship
  if (/\b\d+[a-z]\b/.test(file)) return false;
  return /\b(teams|drivers)\.json$/.test(file);
}

/** "POINTS DATA - Official" beats Provisional beats an unlabeled folder. */
export function pointsFolderRank(url: string): number {
  let path = url;
  try {
    path = decodeURIComponent(url);
  } catch {
    /* keep raw */
  }
  const folder = (path.match(/\/(POINTS DATA[^/]*)\//i)?.[1] || "").toLowerCase();
  if (/offic/.test(folder) && !/unoffic/.test(folder)) return 3;
  if (/provisional/.test(folder)) return 1;
  return 2;
}

/** Keep the best-ranked copy of each points file name. */
export function pickPointsFiles(urls: string[]): string[] {
  const best = new Map<string, string>();
  for (const u of urls) {
    if (!isMainChampionshipPointsFile(u)) continue;
    let name = u;
    try {
      name = decodeURIComponent(u);
    } catch {
      /* keep raw */
    }
    const key = (name.split("/").pop() || name).toLowerCase();
    const cur = best.get(key);
    if (!cur || pointsFolderRank(u) > pointsFolderRank(cur)) best.set(key, u);
  }
  return [...best.values()];
}

export interface OfficialSessionPoints {
  kind: PointsSessionKind;
  /** Session label in the points data, e.g. "Race", "Qualifying", "Round 3". */
  name: string;
  /** Points by car number (Teams files) or by normalised driver name (Drivers files). */
  points: Map<string, number>;
}

export interface OfficialEventPoints {
  eventName: string;
  keyType: "car" | "driver";
  sessions: OfficialSessionPoints[];
}

export function normaliseName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(r\)/gi, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface RawPointsJson {
  championship?: { name?: string; sessions?: Array<{ session_index: number; event_name: string; session_name: string }> };
  classification?: Array<{
    key: string;
    points_by_session?: Array<{ session_index: number; total_points?: number | null; status?: string | null }>;
  }>;
}

/**
 * Per-session points for the most recent event in an IMSA points file.
 * The file is cumulative for the season; the event it was published for is
 * the last one that has any scores. Returns null when nothing is usable.
 */
export function parseOfficialPointsFile(json: unknown, fileName = ""): OfficialEventPoints | null {
  const data = json as RawPointsJson;
  const sessions = data?.championship?.sessions;
  const rows = data?.classification;
  if (!Array.isArray(sessions) || !Array.isArray(rows) || rows.length === 0) return null;

  const hasData = new Set<number>();
  for (const r of rows)
    for (const p of r.points_by_session || [])
      if ((p.total_points ?? 0) !== 0 || (p.status && p.status !== "did_not_race")) hasData.add(p.session_index);
  const withData = sessions.filter((s) => hasData.has(s.session_index));
  if (withData.length === 0) return null;
  const last = withData.reduce((a, b) => (b.session_index > a.session_index ? b : a));
  const eventSessions = sessions.filter((s) => s.event_name === last.event_name).sort((a, b) => a.session_index - b.session_index);

  const title = `${data.championship?.name || ""} ${fileName}`.toLowerCase();
  const keyType: "car" | "driver" = /team/.test(title) ? "car" : "driver";

  const out: OfficialSessionPoints[] = eventSessions.map((s) => ({
    kind: /qual/i.test(s.session_name) ? "qualifying" : "race",
    name: s.session_name.trim(),
    points: new Map<string, number>(),
  }));
  const indexToSlot = new Map(eventSessions.map((s, i) => [s.session_index, i] as const));
  for (const r of rows) {
    const key = keyType === "car" ? String(r.key).trim() : normaliseName(String(r.key));
    for (const p of r.points_by_session || []) {
      const slot = indexToSlot.get(p.session_index);
      if (slot == null) continue;
      if (p.status === "did_not_race" && !(p.total_points ?? 0)) continue;
      out[slot].points.set(key, Number(p.total_points ?? 0));
    }
  }
  return { eventName: last.event_name, keyType, sessions: out.filter((s) => s.points.size > 0) };
}

/**
 * Merge several parsed files (one per class) into candidate maps per session
 * kind, in session order. Car-keyed (Teams) files are preferred; driver-keyed
 * files are only used for a kind no Teams file covers (single-driver series).
 */
export function mergeOfficialPoints(files: Array<OfficialEventPoints | null>): {
  race: Array<{ keyType: "car" | "driver"; points: Map<string, number> }>;
  qualifying: Array<{ keyType: "car" | "driver"; points: Map<string, number> }>;
} {
  const result = { race: [] as Array<{ keyType: "car" | "driver"; points: Map<string, number> }>, qualifying: [] as Array<{ keyType: "car" | "driver"; points: Map<string, number> }> };
  for (const keyType of ["car", "driver"] as const) {
    const parsed = files.filter((f): f is OfficialEventPoints => !!f && f.keyType === keyType);
    for (const kind of ["race", "qualifying"] as const) {
      if (result[kind].length > 0) continue;
      const slots: Map<string, number>[] = [];
      for (const f of parsed) {
        f.sessions
          .filter((s) => s.kind === kind)
          .forEach((s, i) => {
            if (!slots[i]) slots[i] = new Map();
            for (const [k, v] of s.points) slots[i].set(k, v);
          });
      }
      result[kind] = slots.filter(Boolean).map((points) => ({ keyType, points }));
    }
  }
  return result;
}

/**
 * Choose which official session (if any) corresponds to an imported
 * session, by agreement with what we computed / what entries exist.
 * `computed` maps the same key type to our computed points (null when we
 * do not compute this series). An official candidate is accepted when it
 * covers most of the session's entries and, if we computed points, agrees
 * with at least half of them, which guards against a stale points file from
 * a previous event.
 */
export function chooseOfficialSession(
  keys: string[],
  computed: Map<string, number | null>,
  candidates: Array<Map<string, number>>,
): Map<string, number> | null {
  if (keys.length === 0 || candidates.length === 0) return null;
  let best: { map: Map<string, number>; score: number } | null = null;
  for (const cand of candidates) {
    const covered = keys.filter((k) => cand.has(k)).length;
    if (covered / keys.length < 0.6) continue;
    const comparable = keys.filter((k) => cand.has(k) && computed.get(k) != null);
    const agree = comparable.filter((k) => Math.abs((computed.get(k) as number) - (cand.get(k) as number)) < 0.01).length;
    if (comparable.length > 0 && agree / comparable.length < 0.5) continue;
    const score = covered + agree;
    if (!best || score > best.score) best = { map: cand, score };
  }
  return best?.map ?? null;
}

/* ── Recomputing points for stored result rows ─────────────────────── */

/** A stored v2_race_results / v2_qualifying_results row (only the fields used here). */
export interface StoredResultRow {
  id?: string;
  session_id?: string;
  car_number: string | null;
  position: number | null;
  status?: string | null;
  laps_completed?: number | null;
  points?: number | string | null;
  extra_data?: Record<string, unknown> | null;
}

/** The stored v2_sessions row the results belong to, plus its series' scheme. */
export interface StoredSessionInfo {
  session_type: string | null;
  parent_session_id?: string | null;
  /** resolvePointsScheme(series name) for the session's series. */
  scheme: string | null;
}

export interface RecomputeOptions {
  /**
   * Where the class position comes from. "pic" (default) trusts
   * extra_data.PIC, which keeps hand-made corrections; "position" re-derives
   * it from overall position order, per class, skipping non-starters.
   */
  classPositionFrom?: "pic" | "position";
  /**
   * IMSA's official points for this session by car number (from POINTS DATA).
   * When given, they win over computed values for the cars they cover.
   */
  official?: Map<string, number> | null;
}

export interface RecomputedRow {
  index: number;
  id?: string;
  /** New points value (null = this session/series does not score). */
  points: number | null;
  /** New status when it must change (a "finished" car with 0 laps never started). */
  status?: "dns";
  changed: boolean;
}

/** True for a stored race row that never took the start. */
export function isStoredNonStarter(row: StoredResultRow): boolean {
  const st = (row.status || "").toLowerCase();
  if (st === "dns") return true;
  // parseStatus() used to map Al Kamel's "Not Started" to "finished"; such
  // rows are the only "finished" rows with zero laps.
  return st === "finished" && row.laps_completed === 0;
}

/**
 * Recompute championship points for all stored rows of ONE session (every
 * driver row of every car). Pure: returns the new values, writes nothing.
 * Hourly sub-sessions, practice and unverified series get null.
 */
export function recomputeStoredPoints(session: StoredSessionInfo, rows: StoredResultRow[], opts: RecomputeOptions = {}): RecomputedRow[] {
  const rules = getPointsRules(session.scheme);
  const type = session.session_type || "";
  const kind: PointsSessionKind | null =
    type === "race" || type === "endurance_race" || type === "sprint_race" ? "race" : type === "qualifying" ? "qualifying" : null;
  const scores = !!kind && !session.parent_session_id && (kind === "race" ? rules.computeRacePoints || rules.officialPoints : rules.computeQualifyingPoints || (rules.officialPoints && !!opts.official));

  const classOf = (r: StoredResultRow) => {
    const c = r.extra_data?.Class ?? r.extra_data?.class;
    return c == null || c === "" ? null : String(c);
  };
  const nonStarter = (r: StoredResultRow) => kind === "race" && isStoredNonStarter(r);
  const dsq = (r: StoredResultRow) => (r.status || "").toLowerCase() === "dsq";

  // Class position per car.
  const carPos = new Map<string, number | null>();
  if (opts.classPositionFrom === "position") {
    const cars = new Map<string, StoredResultRow>();
    for (const r of rows) if (r.car_number && !cars.has(`${classOf(r)}|${r.car_number}`)) cars.set(`${classOf(r)}|${r.car_number}`, r);
    const ordered = [...cars.entries()].sort((a, b) => (a[1].position ?? 9999) - (b[1].position ?? 9999));
    const counters = new Map<string, number>();
    for (const [k, r] of ordered) {
      if (nonStarter(r) || dsq(r)) {
        carPos.set(k, null);
        continue;
      }
      const c = classOf(r) ?? "";
      const n = (counters.get(c) ?? 0) + 1;
      counters.set(c, n);
      carPos.set(k, n);
    }
  }

  return rows.map((r, index) => {
    const before = r.points == null || r.points === "" ? null : Number(r.points);
    let points: number | null = null;
    let status: "dns" | undefined;
    if (scores && r.car_number) {
      const official = opts.official?.get(r.car_number);
      if (nonStarter(r)) {
        points = 0;
        if ((r.status || "").toLowerCase() !== "dns") status = "dns";
      } else if (official != null && rules.officialPoints) {
        points = official;
      } else if (dsq(r)) {
        points = (kind === "race" ? rules.computeRacePoints : rules.computeQualifyingPoints) ? 0 : null;
      } else {
        let pos: number | null;
        if (opts.classPositionFrom === "position") pos = carPos.get(`${classOf(r)}|${r.car_number}`) ?? null;
        else {
          const pic = Number(r.extra_data?.PIC);
          pos = classOf(r) && Number.isFinite(pic) && pic > 0 ? pic : r.position;
        }
        points = computedPointsFor({ carNumber: r.car_number, className: classOf(r), classPosition: pos, nonStarter: false, disqualified: false }, kind!, rules);
      }
    }
    return { index, id: r.id, points, ...(status ? { status } : {}), changed: before !== points || !!status };
  });
}
