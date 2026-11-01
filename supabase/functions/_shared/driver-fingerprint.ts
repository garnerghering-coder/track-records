/**
 * Pure driver-fingerprint calculation over plain table rows.
 *
 * No I/O, no Deno/Node/browser APIs: callers load the rows (from Postgres, or from the
 * data/*.ndjson export) and get back the rows to store in v2_driver_fingerprints.
 *
 *   import { recomputeDriverFingerprints } from "./driver-fingerprint.ts";
 *   const rows = recomputeDriverFingerprints({ race_results, qualifying_results, practice_results,
 *     sessions, events, seasons, season_classes, circuit_layouts, session_weather, stints,
 *     lap_times: (sessionId) => readLapFile(sessionId) });
 *
 * Score definitions, weights and thresholds are documented in ./fingerprint-math.ts.
 */
import {
  buildFieldIndex,
  carReferenceLap,
  classifyRaceOutcome,
  classRelativeNps,
  computeADPS,
  computeCircuitIndices,
  computeDAS,
  computeDCS,
  computeDPS,
  computeDWS,
  dasBand,
  type DasEvent,
  dcsBand,
  dpsBand,
  dwsBand,
  eventScore,
  eventWetness,
  type FieldIndex,
  isWetWeather,
  lapDurations,
  lapPerformance,
  mean,
  MIN_EVENTS,
  normalizeClassName,
  type RaceOutcome,
  type SessionKind,
  sessionKind,
  sessionScore,
  sessionWetness,
  toFiniteNumber,
} from "./fingerprint-math.ts";

export const FINGERPRINT_VERSION = 2;

// ── Input row shapes (subsets of the v2_* tables) ───────────────────────────

export interface ResultRow {
  id: string;
  session_id: string;
  driver_id: string | null;
  car_number: string | null;
  position: number | null;
  status?: string | null;
  dnf_reason?: string | null;
  extra_data?: Record<string, unknown> | null;
}
export interface SessionRow {
  id: string;
  event_id: string;
  session_type: string | null;
  parent_session_id: string | null;
}
export interface EventRow {
  id: string;
  season_id: string | null;
  layout_id: string | null;
  circuit_id: string | null;
}
export interface SeasonRow {
  id: string;
  cdm?: unknown;
  is_spec_series?: boolean | null;
}
export interface SeasonClassRow {
  season_id: string;
  class_name: string;
  cdm?: unknown;
}
export interface LayoutRow {
  id: string;
  circuit_id: string | null;
  sort_order?: number | null;
  length_km?: unknown;
  turns?: unknown;
  total_straight_length_km?: unknown;
  total_elevation_change_m?: unknown;
  heavy_braking_corners?: unknown;
}
export interface WeatherRow {
  session_id: string;
  rain_mm?: unknown;
  condition_summary?: string | null;
}
export interface StintRow {
  session_id: string;
  driver_id: string | null;
  car_number: string | null;
  start_lap?: number | null;
  end_lap?: number | null;
  start_elapsed?: unknown;
  end_elapsed?: unknown;
}
export interface LapRow {
  session_id?: string;
  car_number: string | null;
  lap_number: number | null;
  elapsed: unknown;
}

export interface FingerprintTables {
  race_results: ResultRow[];
  qualifying_results: ResultRow[];
  practice_results: ResultRow[];
  sessions: SessionRow[];
  events: EventRow[];
  seasons: SeasonRow[];
  season_classes: SeasonClassRow[];
  circuit_layouts: LayoutRow[];
  session_weather: WeatherRow[];
  stints: StintRow[];
  /**
   * Lap times: either all rows, or a lookup returning one session's rows (the export partitions
   * v2_lap_times per session). Optional: without it lap pace is simply not blended in.
   */
  lap_times?: LapRow[] | ((sessionId: string) => LapRow[] | null | undefined);
}

/** Row to store in v2_driver_fingerprints (id/created_at/updated_at are left to the store). */
export interface DriverFingerprintRow {
  driver_id: string;
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
  events_included: number;
  wet_sessions: number;
  dry_sessions: number;
  calculation_details: Record<string, unknown>;
  last_calculated_at: string;
}

// ── Index (built once, shared by every driver) ──────────────────────────────

type ResultTable = "race" | "qualifying" | "practice";

interface CarLaps {
  durations: Map<number, number>;
  elapsed: Map<number, number>;
}

export interface FingerprintIndex {
  ownRows: Map<string, ResultRow[]>; // driver → rows in any table
  ownStints: Map<string, StintRow[]>; // driver → stints
  sessionById: Map<string, SessionRow>;
  sessionsByEvent: Map<string, SessionRow[]>;
  subSessionsOf: Map<string, string[]>;
  resultsBySession: Map<string, ResultRow[]>; // top-level session → rows of its matching table
  fieldIndex: FieldIndex;
  eventById: Map<string, EventRow>;
  seasonById: Map<string, SeasonRow>;
  classCdm: Map<string, number>; // `${season}|${CLASS}` → cdm
  layoutById: Map<string, LayoutRow>;
  firstLayoutByCircuit: Map<string, LayoutRow>;
  wetBySession: Map<string, boolean | null>;
  lapsForSession: (sessionId: string) => Map<string, CarLaps>;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

const KIND_TABLE: Record<SessionKind, ResultTable> = { race: "race", qualifying: "qualifying", practice: "practice" };

export function buildFingerprintIndex(t: FingerprintTables): FingerprintIndex {
  const tables: Record<ResultTable, ResultRow[]> = {
    race: t.race_results || [],
    qualifying: t.qualifying_results || [],
    practice: t.practice_results || [],
  };

  const ownRows = new Map<string, ResultRow[]>();
  const bySessionTable = new Map<string, ResultRow[]>();
  for (const [table, rows] of Object.entries(tables) as [ResultTable, ResultRow[]][]) {
    for (const r of rows) {
      if (r.driver_id) push(ownRows, r.driver_id, r);
      push(bySessionTable, `${r.session_id}|${table}`, r);
    }
  }
  const ownStints = new Map<string, StintRow[]>();
  for (const s of t.stints || []) if (s.driver_id) push(ownStints, s.driver_id, s);

  const sessionById = new Map<string, SessionRow>();
  const sessionsByEvent = new Map<string, SessionRow[]>();
  const subSessionsOf = new Map<string, string[]>();
  for (const s of t.sessions || []) {
    sessionById.set(s.id, s);
    if (s.event_id) push(sessionsByEvent, s.event_id, s);
    if (s.parent_session_id) push(subSessionsOf, s.parent_session_id, s.id);
  }

  // Results of each top-level session, from the table matching its type (falling back to any table).
  const resultsBySession = new Map<string, ResultRow[]>();
  for (const s of sessionById.values()) {
    if (s.parent_session_id) continue;
    let rows = bySessionTable.get(`${s.id}|${KIND_TABLE[sessionKind(s.session_type)]}`) || [];
    if (rows.length === 0) {
      for (const table of ["race", "qualifying", "practice"] as ResultTable[]) {
        const alt = bySessionTable.get(`${s.id}|${table}`);
        if (alt && alt.length > 0) {
          rows = alt;
          break;
        }
      }
    }
    resultsBySession.set(s.id, rows);
  }
  const fieldIndex = buildFieldIndex([...resultsBySession.values()].flat());

  const classCdm = new Map<string, number>();
  for (const c of t.season_classes || []) {
    const cdm = toFiniteNumber(c.cdm);
    const cls = normalizeClassName(c.class_name);
    if (cdm != null && cdm > 0 && cls) classCdm.set(`${c.season_id}|${cls}`, cdm);
  }

  const layoutById = new Map<string, LayoutRow>();
  const firstLayoutByCircuit = new Map<string, LayoutRow>();
  const layouts = [...(t.circuit_layouts || [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.id).localeCompare(String(b.id)),
  );
  for (const l of layouts) {
    layoutById.set(l.id, l);
    if (l.circuit_id && !firstLayoutByCircuit.has(l.circuit_id)) firstLayoutByCircuit.set(l.circuit_id, l);
  }

  const wetBySession = new Map<string, boolean | null>();
  for (const w of t.session_weather || []) wetBySession.set(w.session_id, isWetWeather(w));

  // Lap times, grouped per session lazily and cached.
  const lapCache = new Map<string, Map<string, CarLaps>>();
  let lapsBySession: Map<string, LapRow[]> | null = null;
  const lapRowsFor = (sid: string): LapRow[] => {
    const src = t.lap_times;
    if (!src) return [];
    if (typeof src === "function") return src(sid) || [];
    if (!lapsBySession) {
      lapsBySession = new Map();
      for (const l of src) if (l.session_id) push(lapsBySession, l.session_id, l);
    }
    return lapsBySession.get(sid) || [];
  };
  const lapsForSession = (sid: string) => {
    let cached = lapCache.get(sid);
    if (!cached) {
      const byCar = new Map<string, { lap: number; elapsed: number }[]>();
      for (const l of lapRowsFor(sid)) {
        const lap = toFiniteNumber(l.lap_number);
        const el = toFiniteNumber(l.elapsed);
        if (!l.car_number || lap == null || el == null) continue;
        push(byCar, l.car_number, { lap, elapsed: el });
      }
      cached = new Map();
      for (const [car, pts] of byCar) {
        cached.set(car, { durations: lapDurations(pts), elapsed: new Map(pts.map((p) => [p.lap, p.elapsed])) });
      }
      lapCache.set(sid, cached);
    }
    return cached;
  };

  return {
    ownRows,
    ownStints,
    sessionById,
    sessionsByEvent,
    subSessionsOf,
    resultsBySession,
    fieldIndex,
    eventById: new Map((t.events || []).map((e) => [e.id, e])),
    seasonById: new Map((t.seasons || []).map((s) => [s.id, s])),
    classCdm,
    layoutById,
    firstLayoutByCircuit,
    wetBySession,
    lapsForSession,
  };
}

// ── One driver ──────────────────────────────────────────────────────────────

interface ScoredSession {
  sessionId: string;
  eventId: string;
  kind: SessionKind;
  score: number;
  weight: number;
  className: string | null;
  lapScore: number | null;
  credited: boolean;
}

export interface DriverFingerprintResult extends Omit<DriverFingerprintRow, "last_calculated_at"> {}

const byPosition = (a: ResultRow, b: ResultRow) =>
  (toFiniteNumber(a.position) ?? Infinity) - (toFiniteNumber(b.position) ?? Infinity) || String(a.id).localeCompare(String(b.id));

export function computeDriverFingerprint(driverId: string, idx: FingerprintIndex): DriverFingerprintResult {
  const ownRows = idx.ownRows.get(driverId) || [];
  const ownStints = idx.ownStints.get(driverId) || [];
  const topLevelId = (sid: string) => idx.sessionById.get(sid)?.parent_session_id || sid;

  // Events the driver took part in, and the cars they used there (incl. hourly snapshots and stints).
  const carsByEvent = new Map<string, Set<string>>();
  const eventIds = new Set<string>();
  const note = (sid: string, car: string | null) => {
    const ev = idx.sessionById.get(sid)?.event_id;
    if (!ev) return;
    eventIds.add(ev);
    if (!car) return;
    if (!carsByEvent.has(ev)) carsByEvent.set(ev, new Set());
    carsByEvent.get(ev)!.add(car);
  };
  for (const r of ownRows) note(r.session_id, r.car_number);
  for (const s of ownStints) note(s.session_id, s.car_number);

  const scored: ScoredSession[] = [];
  const excluded: Record<string, number> = {};
  const exclude = (why: string) => (excluded[why] = (excluded[why] || 0) + 1);
  let lapPaceSessions = 0;

  // Hourly sub-sessions are snapshots of their parent race: only top-level sessions are scored.
  const scoredSessions = [...eventIds]
    .flatMap((ev) => idx.sessionsByEvent.get(ev) || [])
    .filter((s) => !s.parent_session_id)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const s of scoredSessions) {
    const kind = sessionKind(s.session_type);
    const rows = idx.resultsBySession.get(s.id) || [];

    // The driver's own row; for races, fall back to the row of the car they drove (co-driver credit).
    let row: ResultRow | undefined = rows.filter((r) => r.driver_id === driverId).sort(byPosition)[0];
    let credited = false;
    if (!row && kind === "race") {
      const cars = carsByEvent.get(s.event_id);
      if (cars && cars.size > 0) {
        const carRows = rows.filter((r) => r.car_number != null && cars.has(r.car_number));
        const distinct = new Set(carRows.map((r) => r.car_number));
        if (distinct.size === 1) {
          row = [...carRows].sort(byPosition)[0];
          credited = true;
        } else if (distinct.size > 1) exclude("ambiguous-car");
      }
    }
    if (!row) continue;
    const r0 = row;

    const outcome: RaceOutcome = kind === "race" ? classifyRaceOutcome(r0.status, r0.dnf_reason) : { kind: "score" };
    if (outcome.kind === "exclude") {
      exclude(outcome.reason);
      continue;
    }

    let nps: number;
    if (outcome.kind === "fixed") nps = outcome.nps;
    else {
      const res = classRelativeNps(r0, idx.fieldIndex);
      if (!res) {
        exclude("no-comparable-field");
        continue;
      }
      nps = res.nps;
    }

    // Car-relative score: only when teammates in the same car had genuinely different results.
    // Co-drivers sharing one car in one race share one result, which says nothing about either.
    let crs: number | null = null;
    if (outcome.kind === "score" && r0.car_number) {
      const mates = rows.filter(
        (t) => t.car_number === r0.car_number && t.driver_id && t.driver_id !== driverId && t.position != null,
      );
      if (mates.some((t) => toFiniteNumber(t.position) !== toFiniteNumber(r0.position))) {
        const mateNps = mates.map((t) => classRelativeNps(t, idx.fieldIndex)?.nps).filter((v): v is number => v != null);
        if (mateNps.length > 0) crs = nps - mean(mateNps)!;
      }
    }

    // Lap pace vs the driver's class, from the laps inside the driver's own stints in this car.
    let lapScore: number | null = null;
    if (kind === "race" && outcome.kind === "score" && r0.car_number) {
      const stints = ownStints.filter((st) => topLevelId(st.session_id) === s.id && st.car_number === r0.car_number);
      if (stints.length > 0) {
        const laps = idx.lapsForSession(s.id);
        const cls = normalizeClassName(r0.extra_data?.["Class"]);
        const classCars = [
          ...new Set(
            rows.filter((r) => r.car_number && normalizeClassName(r.extra_data?.["Class"]) === cls).map((r) => r.car_number as string),
          ),
        ];
        const refs = classCars
          .map((c) => carReferenceLap([...(laps.get(c)?.durations.values() || [])]))
          .filter((v): v is number => v != null);
        const own = laps.get(r0.car_number);
        const inStint = (lap: number) =>
          stints.some((st) => {
            const sl = toFiniteNumber(st.start_lap);
            const el = toFiniteNumber(st.end_lap);
            if (sl != null && el != null) return lap >= sl && lap <= el;
            // Without lap numbers a lap belongs to the stint when it ENDS inside the stint window.
            const se = toFiniteNumber(st.start_elapsed);
            const ee = toFiniteNumber(st.end_elapsed);
            const at = own?.elapsed.get(lap);
            return at != null && se != null && ee != null && at >= se && at <= ee;
          });
        const driverLaps: number[] = [];
        for (const [lap, dur] of own?.durations || []) if (inStint(lap)) driverLaps.push(dur);
        const perf = lapPerformance(driverLaps, refs);
        if (perf) {
          lapScore = perf.score;
          lapPaceSessions++;
        }
      }
    }

    const ev = idx.eventById.get(s.event_id);
    const season = ev?.season_id ? idx.seasonById.get(ev.season_id) : undefined;
    const ss = sessionScore({ kind, nps, crs, spec: !!season?.is_spec_series, lapScore });
    scored.push({
      sessionId: s.id,
      eventId: s.event_id,
      kind,
      score: ss.score,
      weight: ss.weight,
      className: normalizeClassName(r0.extra_data?.["Class"]),
      lapScore,
      credited,
    });
  }

  // Event scores (SWDS)
  const byEvent = new Map<string, ScoredSession[]>();
  for (const s of scored) push(byEvent, s.eventId, s);
  const events: { eventId: string; score: number; sessions: ScoredSession[] }[] = [];
  for (const [eventId, list] of [...byEvent].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sc = eventScore(list.map((x) => ({ score: x.score, weight: x.weight })));
    if (sc != null) events.push({ eventId, score: sc, sessions: list });
  }
  const scores = events.map((e) => e.score);

  const dps = computeDPS(scores);
  const adps = computeADPS(
    events.map((e) => {
      const seasonId = idx.eventById.get(e.eventId)?.season_id;
      if (!seasonId) return { score: e.score, cdm: null };
      const cls = (e.sessions.find((x) => x.kind === "race" && x.className) || e.sessions.find((x) => x.className))?.className;
      const seasonCdm = toFiniteNumber(idx.seasonById.get(seasonId)?.cdm);
      const cdm = (cls ? idx.classCdm.get(`${seasonId}|${cls}`) : undefined) ?? seasonCdm;
      return { score: e.score, cdm: cdm ?? null };
    }),
  );
  const dcs = computeDCS(scores);

  const dasEvents: DasEvent[] = [];
  for (const e of events) {
    const ev = idx.eventById.get(e.eventId);
    const layout = ev?.layout_id ? idx.layoutById.get(ev.layout_id) : ev?.circuit_id ? idx.firstLayoutByCircuit.get(ev.circuit_id) : undefined;
    if (!layout) continue;
    const ci = computeCircuitIndices(
      layout.length_km,
      layout.turns,
      layout.total_straight_length_km,
      layout.total_elevation_change_m,
      layout.heavy_braking_corners,
    );
    dasEvents.push({ score: e.score, tcs100: ci.tcs100, ei: ci.ei, csi: ci.csi });
  }
  const { das, dimensions: dasDimensions } = computeDAS(dasEvents);

  const wet: number[] = [];
  const dry: number[] = [];
  let unknownWeather = 0;
  for (const e of events) {
    const w = eventWetness(
      e.sessions.map((x) => ({
        weight: x.weight,
        wet: sessionWetness(
          idx.wetBySession.get(x.sessionId) ?? null,
          (idx.subSessionsOf.get(x.sessionId) || []).map((sid) => idx.wetBySession.get(sid) ?? null),
        ),
      })),
    );
    if (w === true) wet.push(e.score);
    else if (w === false) dry.push(e.score);
    else unknownWeather++;
  }
  const dws = computeDWS(wet, dry);

  return {
    driver_id: driverId,
    dps,
    dps_band: dps != null ? dpsBand(dps) : null,
    adps,
    adps_band: adps != null ? dpsBand(adps) : null,
    dcs,
    dcs_band: dcs != null ? dcsBand(dcs) : null,
    das,
    das_band: das != null ? dasBand(das) : null,
    dws,
    dws_band: dws != null ? dwsBand(dws) : null,
    events_included: events.length,
    wet_sessions: wet.length,
    dry_sessions: dry.length,
    calculation_details: {
      version: FINGERPRINT_VERSION,
      events_scored: events.length,
      sessions_scored: {
        race: scored.filter((s) => s.kind === "race").length,
        qualifying: scored.filter((s) => s.kind === "qualifying").length,
        practice: scored.filter((s) => s.kind === "practice").length,
      },
      co_driver_credited_races: scored.filter((s) => s.credited).length,
      lap_pace_sessions: lapPaceSessions,
      excluded,
      das_dimensions: dasDimensions,
      weather_unknown_events: unknownWeather,
      min_events: MIN_EVENTS,
    },
  };
}

/** Every driver id with at least one result row or stint, sorted. */
export function driverIdsWithResults(t: FingerprintTables): string[] {
  const ids = new Set<string>();
  for (const rows of [t.race_results, t.qualifying_results, t.practice_results, t.stints]) {
    for (const r of rows || []) if (r.driver_id) ids.add(r.driver_id);
  }
  return [...ids].sort();
}

/**
 * Pure entry point: recompute fingerprints for `driverIds` (default: every driver with results).
 * Returns one v2_driver_fingerprints row per driver, sorted by driver_id.
 */
export function recomputeDriverFingerprints(
  tables: FingerprintTables,
  opts: { driverIds?: string[]; now?: string } = {},
): DriverFingerprintRow[] {
  const idx = buildFingerprintIndex(tables);
  const now = opts.now ?? new Date().toISOString();
  const ids = [...new Set(opts.driverIds ?? driverIdsWithResults(tables))].sort();
  return ids.map((id) => ({ ...computeDriverFingerprint(id, idx), last_calculated_at: now }));
}
