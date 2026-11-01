import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  computeDriverFingerprint,
  buildFingerprintIndex,
  recomputeDriverFingerprints,
  type FingerprintTables,
  type ResultRow,
  type SessionRow,
  type LapRow,
} from "../../supabase/functions/_shared/driver-fingerprint";

/**
 * Synthetic championship: N events, each with one practice, one qualifying and one race.
 * Two classes (GTP, GTD) of 4 cars each. Car "1" (GTD) is driven by drivers A and B.
 */
function makeTables(opts: { events?: number; endurance?: boolean; wetRaces?: number } = {}): FingerprintTables {
  const nEvents = opts.events ?? 6;
  const sessions: SessionRow[] = [];
  const race: ResultRow[] = [];
  const qual: ResultRow[] = [];
  const prac: ResultRow[] = [];
  const weather: FingerprintTables["session_weather"] = [];
  const cars = [
    { car: "10", cls: "GTP", drivers: ["P1"] },
    { car: "11", cls: "GTP", drivers: ["P2"] },
    { car: "12", cls: "GTP", drivers: ["P3"] },
    { car: "13", cls: "GTP", drivers: ["P4"] },
    { car: "1", cls: "GTD", drivers: ["A", "B"] },
    { car: "2", cls: "GTD", drivers: ["C"] },
    { car: "3", cls: "GTD", drivers: ["D"] },
    { car: "4", cls: "GTD", drivers: ["E"] },
  ];
  let id = 0;
  for (let e = 0; e < nEvents; e++) {
    const ev = `ev${e}`;
    const raceType = opts.endurance ? "endurance_race" : "race";
    sessions.push(
      { id: `${ev}-p`, event_id: ev, session_type: "practice", parent_session_id: null },
      { id: `${ev}-q`, event_id: ev, session_type: "qualifying", parent_session_id: null },
      { id: `${ev}-r`, event_id: ev, session_type: raceType, parent_session_id: null },
    );
    // Overall order: all GTP cars first, then GTD; car 1 wins GTD (P5 overall).
    cars.forEach((c, i) => {
      const pic = c.cls === "GTP" ? i + 1 : i - 3;
      // race: one row per driver (endurance-style) for the shared car
      for (const d of c.drivers) race.push({ id: `r${id++}`, session_id: `${ev}-r`, driver_id: d, car_number: c.car, position: i + 1, status: "finished", extra_data: { Class: c.cls, PIC: pic } });
      // qualifying/practice: one row per car (driver A sets the time for car 1)
      qual.push({ id: `q${id++}`, session_id: `${ev}-q`, driver_id: c.drivers[0], car_number: c.car, position: i + 1, extra_data: { Class: c.cls, PIC: pic } });
      prac.push({ id: `p${id++}`, session_id: `${ev}-p`, driver_id: c.drivers[0], car_number: c.car, position: i + 1, extra_data: { Class: c.cls, PIC: pic } });
    });
    if (opts.endurance) {
      // Hourly snapshots: every car marked "dnf", car 1 last in class at hour 1.
      for (let h = 1; h <= 3; h++) {
        const sid = `${ev}-h${h}`;
        sessions.push({ id: sid, event_id: ev, session_type: "race", parent_session_id: `${ev}-r` });
        cars.forEach((c, i) => race.push({ id: `h${id++}`, session_id: sid, driver_id: c.drivers[h % c.drivers.length], car_number: c.car, position: 8 - i, status: "dnf", extra_data: { Class: c.cls, PIC: 4 } }));
      }
    }
    const wet = e < (opts.wetRaces ?? 0);
    weather.push({ session_id: `${ev}-r`, rain_mm: wet ? 5 : 0, condition_summary: wet ? "Heavy rain" : "Clear sky" });
    weather.push({ session_id: `${ev}-q`, rain_mm: 0, condition_summary: "Clear sky" });
    weather.push({ session_id: `${ev}-p`, rain_mm: 0, condition_summary: "Clear sky" });
  }
  return {
    race_results: race,
    qualifying_results: qual,
    practice_results: prac,
    sessions,
    events: Array.from({ length: nEvents }, (_, e) => ({ id: `ev${e}`, season_id: "s1", layout_id: `L${e % 3}`, circuit_id: null })),
    seasons: [{ id: "s1", cdm: null, is_spec_series: false }],
    season_classes: [
      { season_id: "s1", class_name: "GTP", cdm: 0.9 },
      { season_id: "s1", class_name: "GTD", cdm: 0.7 },
    ],
    circuit_layouts: [
      { id: "L0", circuit_id: "c0", length_km: 5.7, turns: 12, total_straight_length_km: 4.2, total_elevation_change_m: 9, heavy_braking_corners: 2 },
      { id: "L1", circuit_id: "c1", length_km: 3.6, turns: 11, total_straight_length_km: 1.1, total_elevation_change_m: 46, heavy_braking_corners: 5 },
      { id: "L2", circuit_id: "c2", length_km: 4.1, turns: 12, total_straight_length_km: 1.75, total_elevation_change_m: 42, heavy_braking_corners: 9 },
    ],
    session_weather: weather,
    stints: [],
  };
}

describe("computeDriverFingerprint", () => {
  it("scores the GTD class winner as a winner (class-relative), not as P5 of 8", () => {
    const [a] = recomputeDriverFingerprints(makeTables(), { driverIds: ["A"], now: "x" });
    expect(a.events_included).toBe(6);
    expect(a.dps).toBe(100);
    expect(a.dps_band).toBe("Elite");
    // aDPS uses the GTD class multiplier
    expect(a.adps).toBe(70);
    expect(a.dcs).toBeNull(); // < 8 events
  });

  it("gives co-driver B the shared race result without counting practice/qualifying set by A", () => {
    const fp = computeDriverFingerprint("B", buildFingerprintIndex(makeTables()));
    expect(fp.calculation_details.sessions_scored).toEqual({ race: 6, qualifying: 0, practice: 0 });
    expect(fp.dps).toBe(100);
  });

  it("credits a co-driver with no own race row via the car they drove", () => {
    const t = makeTables();
    t.race_results = t.race_results.filter((r) => r.driver_id !== "B");
    // B only appears in a practice row for car 1 at every event
    t.practice_results = t.practice_results.map((r) => (r.car_number === "1" ? { ...r, driver_id: "B" } : r));
    const fp = computeDriverFingerprint("B", buildFingerprintIndex(t));
    expect(fp.calculation_details.co_driver_credited_races).toBe(6);
    expect(fp.dps).toBe(100);
  });

  it("does not score hourly snapshots and counts distinct cars for field sizes", () => {
    const fp = computeDriverFingerprint("A", buildFingerprintIndex(makeTables({ endurance: true })));
    // Snapshots would put car 1 last in class (and they are all "dnf"); only the final result counts.
    expect(fp.dps).toBe(100);
    expect(fp.calculation_details.sessions_scored).toEqual({ race: 6, qualifying: 6, practice: 6 });
    expect(fp.calculation_details.excluded).toEqual({});
    // Last-placed GTD car D: 0 in every session
    expect(computeDriverFingerprint("E", buildFingerprintIndex(makeTables({ endurance: true }))).dps).toBe(0);
  });

  it("excludes DNFs without a reason and penalises self-inflicted ones", () => {
    const t = makeTables();
    t.race_results = t.race_results.map((r) => (r.driver_id === "C" && r.session_id === "ev0-r" ? { ...r, status: "dnf" } : r));
    t.race_results = t.race_results.map((r) =>
      r.driver_id === "C" && r.session_id === "ev1-r" ? { ...r, status: "dnf", dnf_reason: "At Fault – Self-Inflicted (No Penalty)" } : r,
    );
    const fp = computeDriverFingerprint("C", buildFingerprintIndex(t));
    expect(fp.calculation_details.excluded).toEqual({ "dnf-unknown": 1 });
    expect(fp.calculation_details.sessions_scored).toMatchObject({ race: 5 });
  });

  it("requires the minimum sample before publishing scores", () => {
    const [fp] = recomputeDriverFingerprints(makeTables({ events: 4 }), { driverIds: ["A"] });
    expect(fp.events_included).toBe(4);
    expect(fp.dps).toBeNull();
    expect(fp.das).toBeNull();
    expect(fp.dws).toBeNull();
  });

  it("computes consistency and weather with enough events", () => {
    const [fp] = recomputeDriverFingerprints(makeTables({ events: 9, wetRaces: 3 }), { driverIds: ["C"] });
    // C is 2nd of 4 in GTD everywhere → identical event scores → perfectly consistent and weather-neutral
    expect(fp.dcs).toBe(100);
    expect(fp.wet_sessions).toBe(3);
    expect(fp.dry_sessions).toBe(6);
    expect(fp.dws).toBe(50);
    expect(fp.dws_band).toBe("Weather Neutral");
    expect(fp.das).toBe(100);
  });

  it("blends lap pace from the driver's own stints, read through a lap-time lookup", () => {
    const t = makeTables();
    const laps: Record<string, LapRow[]> = {};
    for (let e = 0; e < 6; e++) {
      const sid = `ev${e}-r`;
      laps[sid] = [];
      for (const [car, lapTime] of [["1", 100], ["2", 101], ["3", 102], ["4", 103]] as const) {
        let el = 0;
        for (let lap = 1; lap <= 12; lap++) {
          el += lapTime + (lap % 2) * 0.2;
          laps[sid].push({ car_number: car, lap_number: lap, elapsed: el });
        }
      }
    }
    t.lap_times = (sid) => laps[sid];
    t.stints = Array.from({ length: 6 }, (_, e) => ({ session_id: `ev${e}-r`, driver_id: "A", car_number: "1", start_lap: 1, end_lap: 12 }));
    const fp = computeDriverFingerprint("A", buildFingerprintIndex(t));
    expect(fp.calculation_details.lap_pace_sessions).toBe(6);
    expect(fp.dps).not.toBeNull();
    expect(fp.dps!).toBeGreaterThan(70);
    expect(fp.dps!).toBeLessThanOrEqual(100);
  });

  it("returns an empty fingerprint for an unknown driver", () => {
    const fp = computeDriverFingerprint("nobody", buildFingerprintIndex(makeTables()));
    expect(fp).toMatchObject({ events_included: 0, dps: null, dcs: null, das: null, dws: null, adps: null });
  });
});

// Invariants on the real exported data (skipped when data/ is absent).
const DATA = path.resolve(__dirname, "../../data");
const hasData = fs.existsSync(path.join(DATA, "v2_race_results.ndjson"));
describe.skipIf(!hasData)("recomputeDriverFingerprints on data/", () => {
  it("produces finite, in-range, correctly banded scores for every driver", () => {
    const nd = (f: string) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const tbl = (n: string) => nd(path.join(DATA, `${n}.ndjson`));
    const dir = (n: string) => (fs.existsSync(path.join(DATA, n)) ? fs.readdirSync(path.join(DATA, n)).flatMap((f) => nd(path.join(DATA, n, f))) : []);
    const rows = recomputeDriverFingerprints({
      race_results: tbl("v2_race_results"),
      qualifying_results: tbl("v2_qualifying_results"),
      practice_results: tbl("v2_practice_results"),
      sessions: tbl("v2_sessions"),
      events: tbl("v2_events"),
      seasons: tbl("v2_seasons"),
      season_classes: tbl("v2_season_classes"),
      circuit_layouts: tbl("v2_circuit_layouts"),
      session_weather: tbl("v2_session_weather"),
      stints: dir("v2_stints"),
      lap_times: (sid) => {
        const f = path.join(DATA, "v2_lap_times", `${sid}.ndjson`);
        return fs.existsSync(f) ? nd(f) : [];
      },
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      for (const k of ["dps", "adps", "dcs", "das", "dws"] as const) {
        const v = r[k];
        if (v == null) {
          expect(r[`${k}_band`]).toBeNull();
          continue;
        }
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
        expect(r[`${k}_band`]).toBeTruthy();
      }
      if (r.dps != null) expect(r.events_included).toBeGreaterThanOrEqual(5);
      if (r.dcs != null) expect(r.events_included).toBeGreaterThanOrEqual(8);
      expect(r.wet_sessions + r.dry_sessions).toBeLessThanOrEqual(r.events_included);
    }
  });
});
