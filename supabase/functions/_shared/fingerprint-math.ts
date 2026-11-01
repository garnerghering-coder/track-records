/**
 * Pure, deterministic maths for the driver and circuit "fingerprint" scores.
 *
 * This file is shared by:
 *  - the Deno edge function `recalculate-driver-fingerprint` (imported as "../_shared/fingerprint-math.ts")
 *  - the React app (`src/lib/track-calculations.ts`, `src/components/DriverFingerprint.tsx`)
 *  - the vitest suite (`src/test/fingerprint-math.test.ts`)
 *
 * Keep it dependency-free (no Deno or browser APIs, no imports) so all three can load it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CIRCUIT INDICES (all 0–100, one decimal)
 *  - TCS "Circuit Character": ((SR − TDn) + 1) / 2 × 100, where SR = straights_km / length_km and
 *    TDn = clamp((turns/km − 1.5) / 4.3, 0, 1). Low = tight & twisty, high = long straights.
 *  - EI "Elevation": 5 × elevation_change_m / length_km, clamped to 0–100 (100 ⇔ 20 m of
 *    elevation range per km of lap).
 *  - CSI "Corner Severity"/"Braking": heavy_braking_corners / turns × 100.
 *  - TDI "Circuit Demand": ((100 − TCS) + EI + 1.5 × CSI) / 3.5  (max exactly 100).
 *
 * DRIVER SCORES (all 0–100, one decimal; null = insufficient data)
 *  - NPS (normalised position) per session: 1 − (pos − 1)/(N − 1) where pos/N are the class
 *    position (PIC) and number of distinct cars in the driver's class in that session.
 *  - Session score: NPS (blended 50/50 with a lap-pace score when stint + lap data exist).
 *  - Event score (SWDS): session-type weighted mean of session scores within one event
 *    (race 5, qualifying 3, practice 1).
 *  - DPS = mean(event scores) × 100                                (≥ 5 events)
 *  - aDPS = mean(event score × class difficulty multiplier) × 100  (≥ 5 events with a CDM)
 *  - DCS "Consistency" = (1 − s / 0.4) × 100, s = sample std-dev of event scores (≥ 8 events)
 *  - DAS "Adaptability" = (1 − V / 0.05) × 100, V = mean over circuit dimensions (TCS, EI, CSI)
 *    of the noise-corrected variance between Low/Mid/High band means of event scores
 *    (≥ 5 events, ≥ 2 dimensions with ≥ 2 bands that each hold ≥ 2 events)
 *  - DWS "Weather" = 50 + 200 × (mean wet event score − mean dry event score) (≥ 2 wet, ≥ 4 dry)
 */

// ── Generic numeric helpers ──────────────────────────────────────────────────

/** Coerce a DB value (number, numeric string, null) to a finite number, else null. */
export function toFiniteNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Round to one decimal place (the precision scores are stored at). */
export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function mean(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** True median (averages the two middle values for even-length input). */
export function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Sample standard deviation (Bessel-corrected, n − 1). 0 for fewer than 2 values. */
export function sampleStdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr)!;
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

/** Sample variance (n − 1). 0 for fewer than 2 values. */
export function sampleVariance(arr: number[]): number {
  const s = sampleStdDev(arr);
  return s * s;
}

/** Population variance (n). 0 for fewer than 2 values. */
export function populationVariance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr)!;
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

/** Final 0–100 score: clamp, then round to one decimal. Non-finite input → null. */
export function toScore100(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return round1(clamp(v, 0, 100));
}

// ── Circuit indices ─────────────────────────────────────────────────────────

export interface CircuitIndices {
  /** Circuit Character (TCS): 0 = tight & twisty, 100 = straights dominate. */
  tcs100: number | null;
  /** Elevation Index: 100 ⇔ ≥ 20 m elevation range per km. */
  ei: number | null;
  /** Corner Severity Index: % of corners that are heavy-braking corners. */
  csi: number | null;
  /** Circuit Demand (TDI): combination of the three above. */
  tdi: number | null;
}

/** EI points per (metre of elevation range per km of lap). 100 ⇔ 20 m/km. */
export const EI_POINTS_PER_M_PER_KM = 5;

/**
 * Compute the circuit indices from raw layout data. Inputs may be numbers or numeric strings
 * (Postgres `numeric` columns arrive as strings). Each index is null when its inputs are
 * missing or physically impossible (e.g. straights longer than the lap, more heavy-braking
 * corners than corners) so the UI shows nothing rather than a wrong number.
 */
export function computeCircuitIndices(
  lengthKmRaw: unknown,
  turnsRaw: unknown,
  straightKmRaw: unknown,
  elevationMRaw: unknown,
  heavyBrakingRaw: unknown,
): CircuitIndices {
  const out: CircuitIndices = { tcs100: null, ei: null, csi: null, tdi: null };
  const lengthKm = toFiniteNumber(lengthKmRaw);
  const turns = toFiniteNumber(turnsRaw);
  const straightKm = toFiniteNumber(straightKmRaw);
  const elevM = toFiniteNumber(elevationMRaw);
  const heavy = toFiniteNumber(heavyBrakingRaw);

  const hasLength = lengthKm != null && lengthKm > 0;
  const hasTurns = turns != null && turns > 0;

  if (hasLength && hasTurns && straightKm != null && straightKm >= 0 && straightKm <= lengthKm) {
    const turnDensity = turns / lengthKm; // turns per km
    const straightRatio = straightKm / lengthKm; // 0–1
    const tdNorm = clamp((turnDensity - 1.5) / 4.3, 0, 1);
    const tcs = straightRatio - tdNorm; // −1 … 1
    out.tcs100 = round1(clamp(((tcs + 1) / 2) * 100, 0, 100));
  }

  if (hasLength && elevM != null && elevM >= 0) {
    out.ei = round1(clamp((EI_POINTS_PER_M_PER_KM * elevM) / lengthKm, 0, 100));
  }

  if (hasTurns && heavy != null && heavy >= 0 && heavy <= turns) {
    out.csi = round1(clamp((heavy / turns) * 100, 0, 100));
  }

  if (out.tcs100 != null && out.ei != null && out.csi != null) {
    out.tdi = round1(clamp((100 - out.tcs100 + out.ei + out.csi * 1.5) / 3.5, 0, 100));
  }
  return out;
}

// Display categories. Chosen from the value rounded to an integer, because that is what the UI
// shows (so "15" is always "Flat", never "Undulating").

export function tcsCategory(value: number): string {
  const v = Math.round(value);
  if (v >= 74) return "Power Circuit";
  if (v >= 61) return "Speed Circuit";
  if (v >= 52) return "High-Speed Technical";
  if (v >= 42) return "Balanced";
  if (v >= 28) return "Technical";
  return "Tight & Twisty";
}

export function eiCategory(value: number): string {
  const v = Math.round(value);
  if (v <= 15) return "Flat";
  if (v <= 40) return "Undulating";
  if (v <= 65) return "Hilly";
  if (v <= 85) return "Highland";
  return "Mountainous";
}

export function csiCategory(value: number): string {
  const v = Math.round(value);
  if (v <= 15) return "Flowing";
  if (v <= 30) return "Rhythmic";
  if (v <= 50) return "High Braking Density";
  return "Extreme Braking Density";
}

export function tdiCategory(value: number): string {
  const v = Math.round(value);
  if (v <= 25) return "Efficient";
  if (v <= 45) return "Active";
  if (v <= 70) return "Punishing";
  return "Relentless";
}

/** Circuit fingerprint (indices + display categories), as shown on circuit/event/session pages. */
export interface TrackFingerprint {
  tcs100: number | null;
  tcsCategory: string | null;
  ei: number | null;
  eiCategory: string | null;
  csi: number | null;
  csiCategory: string | null;
  tdi: number | null;
  tdiCategory: string | null;
}

/** v2_circuit_layouts row (any subset of these columns; numerics may be strings). */
export interface LayoutLike {
  length_km?: unknown;
  turns?: unknown;
  total_straight_length_km?: unknown;
  total_elevation_change_m?: unknown;
  heavy_braking_corners?: unknown;
}

/** Pure entry point: circuit fingerprint for one v2_circuit_layouts row. */
export function computeTrackFingerprint(layout: LayoutLike | null | undefined): TrackFingerprint {
  const idx = computeCircuitIndices(
    layout?.length_km,
    layout?.turns,
    layout?.total_straight_length_km,
    layout?.total_elevation_change_m,
    layout?.heavy_braking_corners,
  );
  return {
    tcs100: idx.tcs100,
    tcsCategory: idx.tcs100 != null ? tcsCategory(idx.tcs100) : null,
    ei: idx.ei,
    eiCategory: idx.ei != null ? eiCategory(idx.ei) : null,
    csi: idx.csi,
    csiCategory: idx.csi != null ? csiCategory(idx.csi) : null,
    tdi: idx.tdi,
    tdiCategory: idx.tdi != null ? tdiCategory(idx.tdi) : null,
  };
}

/**
 * Coarse Low/Mid/High circuit bands used only by the Adaptability (DAS) score.
 * EI cut points are 2.5 and 5.5 m of elevation range per km of lap.
 */
export type CircuitBand = "Low" | "Mid" | "High";
export function dasCircuitBand(dim: "tcs" | "ei" | "csi", v: number): CircuitBand {
  if (dim === "tcs") return v <= 41 ? "Low" : v <= 60 ? "Mid" : "High";
  if (dim === "ei") {
    const mPerKm = v / EI_POINTS_PER_M_PER_KM;
    return mPerKm <= 2.5 ? "Low" : mPerKm <= 5.5 ? "Mid" : "High";
  }
  return v <= 33 ? "Low" : v <= 66 ? "Mid" : "High";
}

// ── Driver score bands ──────────────────────────────────────────────────────
// Bands are evaluated on the value rounded to an integer, because that is the number the
// UI shows. Otherwise 79.6 would display as "80" next to the label for "< 80".

export function dpsBand(v: number): string {
  const r = Math.round(v);
  if (r >= 80) return "Elite";
  if (r >= 65) return "Competitive";
  if (r >= 50) return "Midfield";
  if (r >= 35) return "Below Average";
  return "Developing";
}
export function dcsBand(v: number): string {
  const r = Math.round(v);
  if (r >= 80) return "Rock Solid";
  if (r >= 60) return "Consistent";
  if (r >= 40) return "Variable";
  return "Unpredictable";
}
export function dasBand(v: number): string {
  const r = Math.round(v);
  if (r >= 80) return "All-Rounder";
  if (r >= 60) return "Versatile";
  if (r >= 40) return "Specialist";
  return "Type-Dependent";
}
export function dwsBand(v: number): string {
  const r = Math.round(v);
  if (r >= 75) return "Wet Weather Specialist";
  if (r >= 55) return "Wet-Favoured";
  if (r >= 45) return "Weather Neutral";
  if (r >= 25) return "Dry-Favoured";
  return "Dry Weather Dependent";
}

// ── Sample-size requirements ────────────────────────────────────────────────

export const MIN_EVENTS = {
  /** Performance (DPS / aDPS). */
  dps: 5,
  /** Consistency (DCS): needs a meaningful spread estimate. */
  dcs: 8,
  /** Adaptability (DAS): total events. */
  das: 5,
  /** Adaptability: events required inside a circuit band for that band to be used. */
  dasPerBand: 2,
  /** Weather (DWS). */
  dwsWet: 2,
  dwsDry: 4,
} as const;

// ── Session types & weights ─────────────────────────────────────────────────

export type SessionKind = "race" | "qualifying" | "practice";

/** Map a v2_sessions.session_type (race, endurance_race, sprint_race, qualifying, practice…) to a kind. */
export function sessionKind(sessionType: string | null | undefined): SessionKind {
  const t = (sessionType || "").toLowerCase();
  if (t.includes("race")) return "race";
  if (t.includes("qual")) return "qualifying";
  return "practice";
}

/** nps = weight of the positional score, crs = weight of the car-relative (teammate) score. */
export const SESSION_WEIGHTS: Record<SessionKind, { nps: number; crs: number }> = {
  race: { nps: 5, crs: 3 },
  qualifying: { nps: 3, crs: 4 },
  practice: { nps: 1, crs: 1 },
};

// ── Normalised position ─────────────────────────────────────────────────────

/**
 * Normalised position score: 1.0 = first, 0.0 = last of `fieldSize` cars.
 * Returns null when there is nothing to compare against (field < 2) or inputs are invalid.
 * Positions outside 1…fieldSize are clamped (data with a stale field count must not produce
 * scores outside 0–1).
 */
export function normalizedPosition(position: unknown, fieldSize: unknown): number | null {
  const p = toFiniteNumber(position);
  const n = toFiniteNumber(fieldSize);
  if (p == null || n == null || n < 2 || p < 1) return null;
  const pc = clamp(p, 1, n);
  return 1 - (pc - 1) / (n - 1);
}

/** Canonical class key: "GTD PRO", "gtd-pro", "GTDPRO" → "GTDPRO". */
export function normalizeClassName(cls: unknown): string | null {
  if (cls == null) return null;
  const s = String(cls).toUpperCase().replace(/[\s_\-–]+/g, "");
  return s === "" ? null : s;
}

export interface FieldRow {
  session_id: string;
  car_number: string | null;
  position: number | null;
  /** v2_*_results.extra_data (expects Class / PIC). */
  extra_data?: Record<string, unknown> | null;
  /** row id, used as a car key when car_number is missing. */
  id?: string;
}

/**
 * Field-size index over ALL result rows of a set of sessions.
 *
 * Endurance race tables hold one row per DRIVER (3–4 rows per car), so field sizes must
 * count distinct cars, never rows.
 */
export interface FieldIndex {
  /** session → distinct classified cars. */
  overall: Map<string, number>;
  /** session → class → distinct classified cars. */
  byClass: Map<string, Map<string, number>>;
  /** session → class → sorted overall positions of each car (to derive a missing PIC). */
  classPositions: Map<string, Map<string, number[]>>;
}

export function buildFieldIndex(rows: FieldRow[]): FieldIndex {
  let anon = 0;
  const carKey = (r: FieldRow): string =>
    r.car_number != null && r.car_number !== "" ? `car:${r.car_number}` : `row:${r.id ?? `#${anon++}`}`;
  const overallCars = new Map<string, Map<string, number>>(); // session → car → position
  const classCars = new Map<string, Map<string, Map<string, number>>>();
  for (const r of rows) {
    const pos = toFiniteNumber(r.position);
    if (pos == null) continue;
    const key = carKey(r);
    if (!overallCars.has(r.session_id)) overallCars.set(r.session_id, new Map());
    const oc = overallCars.get(r.session_id)!;
    if (!oc.has(key) || pos < oc.get(key)!) oc.set(key, pos);
    const cls = normalizeClassName(r.extra_data?.["Class"]);
    if (cls) {
      if (!classCars.has(r.session_id)) classCars.set(r.session_id, new Map());
      const bySession = classCars.get(r.session_id)!;
      if (!bySession.has(cls)) bySession.set(cls, new Map());
      const cc = bySession.get(cls)!;
      if (!cc.has(key) || pos < cc.get(key)!) cc.set(key, pos);
    }
  }
  const idx: FieldIndex = { overall: new Map(), byClass: new Map(), classPositions: new Map() };
  for (const [sid, cars] of overallCars) idx.overall.set(sid, cars.size);
  for (const [sid, classes] of classCars) {
    const sizes = new Map<string, number>();
    const positions = new Map<string, number[]>();
    for (const [cls, cars] of classes) {
      sizes.set(cls, cars.size);
      positions.set(cls, [...cars.values()].sort((a, b) => a - b));
    }
    idx.byClass.set(sid, sizes);
    idx.classPositions.set(sid, positions);
  }
  return idx;
}

export interface NpsResult {
  nps: number;
  basis: "class" | "overall";
  position: number;
  fieldSize: number;
}

/**
 * Class-relative normalised position for one result row.
 * Uses extra_data.PIC within extra_data.Class when available (deriving the class position from
 * overall positions when PIC is missing); falls back to the overall position only when the row
 * has no class. In a single-class session both give the same answer.
 */
export function classRelativeNps(row: FieldRow, idx: FieldIndex): NpsResult | null {
  const pos = toFiniteNumber(row.position);
  if (pos == null) return null;
  const cls = normalizeClassName(row.extra_data?.["Class"]);
  if (cls) {
    const classSize = idx.byClass.get(row.session_id)?.get(cls);
    if (classSize != null) {
      let pic = toFiniteNumber(row.extra_data?.["PIC"]);
      if (pic == null || pic < 1) {
        const positions = idx.classPositions.get(row.session_id)?.get(cls) || [];
        pic = positions.filter((p) => p < pos).length + 1;
      }
      const nps = normalizedPosition(pic, classSize);
      return nps == null ? null : { nps, basis: "class", position: pic, fieldSize: classSize };
    }
  }
  const n = idx.overall.get(row.session_id);
  const nps = normalizedPosition(pos, n);
  return nps == null ? null : { nps, basis: "overall", position: pos, fieldSize: n! };
}

// ── Race outcome classification ─────────────────────────────────────────────

export type RaceOutcome =
  | { kind: "score" } // score by (class) position
  | { kind: "fixed"; nps: number } // driver-attributable retirement / conduct DSQ
  | { kind: "exclude"; reason: string };

/** Fixed normalised scores for driver-caused retirements. */
export const DNF_SELF_INFLICTED_NPS = 0.25;
export const DNF_PENALISED_NPS = 0.1;

/**
 * Decide how a race result counts.
 *  - finished / classified: scored by position
 *  - DNF with a driver-attributable reason: fixed low score (self-inflicted 0.25, penalised 0.10)
 *  - DNF that is not the driver's fault, or has no/unknown reason: excluded (neutral)
 *  - DSQ for a technical infringement: scored by position if classified (driver not at fault)
 *  - DSQ for conduct (or unknown reason): 0.10
 *  - DNS: excluded
 * Reason strings follow resolve-dnf-reasons ("At Fault – Self-Inflicted (No Penalty)", …).
 */
export function classifyRaceOutcome(statusRaw: string | null | undefined, reasonRaw: string | null | undefined): RaceOutcome {
  const status = (statusRaw || "finished").toLowerCase().trim();
  const reason = (reasonRaw || "").toLowerCase();

  if (status === "dns" || status.includes("did not start")) return { kind: "exclude", reason: "dns" };

  const isDsq = status === "dsq" || status.startsWith("disq") || status === "excluded";
  if (isDsq) {
    if (/technical|underweight|illegal|fuel|scrutineer|ride height|weight/.test(reason)) return { kind: "score" };
    return { kind: "fixed", nps: DNF_PENALISED_NPS };
  }

  const isDnf = status === "dnf" || status === "retired" || status === "nc" || status.includes("not classified") || status === "ret";
  if (!isDnf) return { kind: "score" };

  // Order matters: "not at fault" contains "at fault"; "(no penalty)" contains "penal".
  if (reason.includes("not at fault")) return { kind: "exclude", reason: "dnf-not-at-fault" };
  if (/mechanical|engine|gearbox|hydraulic|suspension|electrical|brake failure|puncture|power ?unit|transmission|fuel pressure/.test(reason))
    return { kind: "exclude", reason: "dnf-mechanical" };
  if (/technical|floor damage|overheating|debris|cooling|bodywork/.test(reason)) return { kind: "exclude", reason: "dnf-technical" };
  if (/self[- ]inflicted|no penalty|loss of control|spin|spun|crash|accident/.test(reason)) return { kind: "fixed", nps: DNF_SELF_INFLICTED_NPS };
  if (/penali[sz]ed|\bpenalty\b|driving conduct/.test(reason)) return { kind: "fixed", nps: DNF_PENALISED_NPS };
  if (reason.includes("at fault")) return { kind: "fixed", nps: DNF_SELF_INFLICTED_NPS };
  if (reason.includes("contact")) return { kind: "exclude", reason: "dnf-contact" };
  return { kind: "exclude", reason: reason ? "dnf-other" : "dnf-unknown" };
}

// ── Lap pace ────────────────────────────────────────────────────────────────

export interface LapPoint {
  lap: number;
  /** cumulative race time (seconds) at the end of this lap */
  elapsed: number;
}

/** Plausible lap duration bounds (seconds). */
export const LAP_MIN_S = 20;
export const LAP_MAX_S = 600;

/**
 * Lap durations from cumulative elapsed times: lap n's duration = elapsed[n] − elapsed[n−1],
 * only when lap n−1 is present (missing laps would otherwise merge two laps into one).
 * Returns a map lap_number → seconds.
 */
export function lapDurations(points: LapPoint[]): Map<number, number> {
  const sorted = points
    .map((p) => ({ lap: toFiniteNumber(p.lap), elapsed: toFiniteNumber(p.elapsed) }))
    .filter((p): p is { lap: number; elapsed: number } => p.lap != null && p.elapsed != null)
    .sort((a, b) => a.lap - b.lap);
  const out = new Map<number, number>();
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].lap !== sorted[i - 1].lap + 1) continue;
    const d = sorted[i].elapsed - sorted[i - 1].elapsed;
    if (d >= LAP_MIN_S && d <= LAP_MAX_S) out.set(sorted[i].lap, d);
  }
  return out;
}

/**
 * Representative green-flag laps: drop pit in/out laps and caution laps by keeping laps within
 * [0.85, 1.07] × the median of the set.
 */
export function representativeLaps(durations: number[]): number[] {
  const m = median(durations);
  if (m == null) return [];
  return durations.filter((d) => d >= m * 0.85 && d <= m * 1.07);
}

export const MIN_LAPS_FOR_PACE = 5;
export const MIN_CARS_FOR_PACE = 3;

export interface LapPerformance {
  /** driver's median representative lap / class reference lap (< 1 = faster). */
  paceRatio: number;
  /** 0–1: ratio 0.95 → 1, 1.05 → 0. */
  paceScore: number;
  /** coefficient of variation of the driver's representative laps. */
  cv: number;
  /** 0–1: CV ≤ 1% → 1, ≥ 5% → 0. */
  consistencyScore: number;
  /** 0.7 × pace + 0.3 × consistency. */
  score: number;
}

/**
 * Lap performance for one driver in one race session, compared with their class.
 * @param driverLaps the driver's own lap durations (only laps inside the driver's stints)
 * @param classCarMedians median representative lap of each car in the driver's class
 */
export function lapPerformance(driverLaps: number[], classCarMedians: number[]): LapPerformance | null {
  const laps = representativeLaps(driverLaps);
  if (laps.length < MIN_LAPS_FOR_PACE) return null;
  const valid = classCarMedians.filter((m) => Number.isFinite(m) && m > 0);
  if (valid.length < MIN_CARS_FOR_PACE) return null;
  const ref = median(valid)!;
  const driverMedian = median(laps)!;
  const paceRatio = driverMedian / ref;
  const paceScore = clamp((1.05 - paceRatio) / 0.1, 0, 1);
  const cv = sampleStdDev(laps) / driverMedian;
  const consistencyScore = clamp((0.05 - cv) / 0.04, 0, 1);
  const score = paceScore * 0.7 + consistencyScore * 0.3;
  if (!Number.isFinite(score)) return null;
  return { paceRatio, paceScore, cv, consistencyScore, score };
}

/** Median representative lap of one car (for the class reference), or null if too few laps. */
export function carReferenceLap(durations: number[]): number | null {
  const laps = representativeLaps(durations);
  return laps.length >= MIN_LAPS_FOR_PACE ? median(laps) : null;
}

/** Share of a session score taken from lap pace when lap data exists. */
export const LAP_PACE_BLEND = 0.5;

// ── Session & event scores ──────────────────────────────────────────────────

export interface SessionScoreInput {
  kind: SessionKind;
  nps: number;
  /** nps − mean(teammate nps) when teammates had genuinely separate results, else null. */
  crs: number | null;
  /** Spec series: car-relative comparison weighted 1.5×. */
  spec?: boolean;
  /** 0–1 lap performance score, blended in when present. */
  lapScore?: number | null;
}

export interface SessionScore {
  score: number;
  /** Weight of this session inside its event. */
  weight: number;
}

export function sessionScore(input: SessionScoreInput): SessionScore {
  const w = SESSION_WEIGHTS[input.kind];
  let score = input.nps;
  let weight = w.nps;
  if (input.crs != null && Number.isFinite(input.crs)) {
    const crsW = input.spec ? w.crs * 1.5 : w.crs;
    score = (w.nps * input.nps + crsW * input.crs) / (w.nps + crsW);
    weight = w.nps + w.crs;
  }
  if (input.lapScore != null && Number.isFinite(input.lapScore)) {
    score = score * (1 - LAP_PACE_BLEND) + input.lapScore * LAP_PACE_BLEND;
  }
  return { score: clamp(score, -1, 1), weight };
}

/** Weighted mean of session scores within an event (SWDS). Null if nothing to average. */
export function eventScore(sessions: SessionScore[]): number | null {
  let tw = 0;
  let sum = 0;
  for (const s of sessions) {
    if (!Number.isFinite(s.score) || !(s.weight > 0)) continue;
    tw += s.weight;
    sum += s.score * s.weight;
  }
  return tw > 0 ? sum / tw : null;
}

// ── Driver metrics ──────────────────────────────────────────────────────────

/** DPS: mean event score × 100. */
export function computeDPS(eventScores: number[]): number | null {
  if (eventScores.length < MIN_EVENTS.dps) return null;
  return toScore100(mean(eventScores)! * 100);
}

/** aDPS: mean(event score × class difficulty multiplier) × 100, over events with a known CDM. */
export function computeADPS(events: { score: number; cdm: number | null }[]): number | null {
  const vals = events
    .filter((e) => e.cdm != null && Number.isFinite(e.cdm) && e.cdm > 0)
    .map((e) => e.score * (e.cdm as number));
  if (vals.length < MIN_EVENTS.dps) return null;
  return toScore100(mean(vals)! * 100);
}

/** Event-score standard deviation that maps to a consistency of 0. */
export const DCS_SIGMA_AT_ZERO = 0.4;

/** DCS: (1 − sample σ / 0.4) × 100. */
export function computeDCS(eventScores: number[]): number | null {
  if (eventScores.length < MIN_EVENTS.dcs) return null;
  return toScore100((1 - sampleStdDev(eventScores) / DCS_SIGMA_AT_ZERO) * 100);
}

/** Between-band variance that maps to an adaptability of 0. */
export const DAS_VARIANCE_AT_ZERO = 0.05;

export interface DasEvent {
  score: number;
  tcs100: number | null;
  ei: number | null;
  csi: number | null;
}

/**
 * Noise-corrected spread of band means for one circuit dimension.
 *
 * With k band means m_b of n_b events each, the population variance of the band means is
 * inflated by sampling noise: E[V] = V_true + (k − 1)/k² × Σ σ²/n_b. We estimate σ² with the
 * pooled within-band sample variance and subtract that term (floored at 0). Bands with fewer
 * than MIN_EVENTS.dasPerBand events are ignored. Returns null if < 2 usable bands.
 */
export function dimensionBandVariance(groups: number[][]): number | null {
  const usable = groups.filter((g) => g.length >= MIN_EVENTS.dasPerBand);
  if (usable.length < 2) return null;
  const k = usable.length;
  const means = usable.map((g) => mean(g)!);
  const between = populationVariance(means);
  let ssWithin = 0;
  let dfWithin = 0;
  for (const g of usable) {
    ssWithin += sampleVariance(g) * (g.length - 1);
    dfWithin += g.length - 1;
  }
  const pooled = dfWithin > 0 ? ssWithin / dfWithin : 0;
  const noise = ((k - 1) / (k * k)) * usable.reduce((s, g) => s + pooled / g.length, 0);
  return Math.max(0, between - noise);
}

export function computeDAS(events: DasEvent[]): { das: number | null; dimensions: number } {
  if (events.length < MIN_EVENTS.das) return { das: null, dimensions: 0 };
  const variances: number[] = [];
  for (const dim of ["tcs", "ei", "csi"] as const) {
    const groups: Record<CircuitBand, number[]> = { Low: [], Mid: [], High: [] };
    for (const e of events) {
      const v = dim === "tcs" ? e.tcs100 : dim === "ei" ? e.ei : e.csi;
      if (v == null || !Number.isFinite(v)) continue;
      groups[dasCircuitBand(dim, v)].push(e.score);
    }
    const v = dimensionBandVariance(Object.values(groups));
    if (v != null) variances.push(v);
  }
  if (variances.length < 2) return { das: null, dimensions: variances.length };
  return { das: toScore100((1 - mean(variances)! / DAS_VARIANCE_AT_ZERO) * 100), dimensions: variances.length };
}

/** DWS: 50 + 200 × (mean wet − mean dry). 50 = neutral. */
export function computeDWS(wetScores: number[], dryScores: number[]): number | null {
  if (wetScores.length < MIN_EVENTS.dwsWet || dryScores.length < MIN_EVENTS.dwsDry) return null;
  return toScore100(50 + (mean(wetScores)! - mean(dryScores)!) * 200);
}

// ── Weather ─────────────────────────────────────────────────────────────────

/** Total session rain (mm) at or above which a session counts as wet. */
export const WET_RAIN_MM = 0.5;

/**
 * A session is wet when the weather feed recorded ≥ 0.5 mm of rain over the session, or its
 * summary names real rain ("rain", "shower", "storm", "wet", "damp"). Drizzle alone with
 * < 0.5 mm is treated as dry. Returns null when there is no weather record.
 */
export function isWetWeather(w: { rain_mm?: unknown; condition_summary?: string | null } | null | undefined): boolean | null {
  if (!w) return null;
  const mm = toFiniteNumber(w.rain_mm);
  const summary = (w.condition_summary || "").toLowerCase();
  if (mm != null && mm >= WET_RAIN_MM) return true;
  if (/\b(rain|showers?|storms?|thunderstorms?|wet|damp)\b/.test(summary)) return true;
  if (mm == null && !summary) return null;
  return false;
}

/** Share of an endurance race's hourly snapshots that must be wet for the race to count as wet. */
export const WET_SUBSESSION_SHARE = 0.25;

/**
 * Wetness of a session that may have hourly sub-sessions (endurance races).
 * Wet if its own record is wet, or ≥ 25 % of the sub-sessions with weather are wet.
 * Null when neither the session nor any sub-session has weather data.
 */
export function sessionWetness(own: boolean | null, subSessions: (boolean | null)[]): boolean | null {
  const known = subSessions.filter((s): s is boolean => s != null);
  if (own === true) return true;
  if (known.length > 0 && known.filter(Boolean).length / known.length >= WET_SUBSESSION_SHARE) return true;
  if (own === false || known.length > 0) return false;
  return null;
}

/**
 * An event counts as wet when wet sessions carry at least half of the event's scoring weight,
 * dry when dry sessions do, and unknown when sessions without weather data carry more than half.
 */
export function eventWetness(sessions: { weight: number; wet: boolean | null }[]): boolean | null {
  let total = 0;
  let wet = 0;
  let known = 0;
  for (const s of sessions) {
    total += s.weight;
    if (s.wet != null) {
      known += s.weight;
      if (s.wet) wet += s.weight;
    }
  }
  if (total <= 0 || known / total < 0.5) return null;
  return wet / known >= 0.5;
}
