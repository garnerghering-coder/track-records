import { describe, it, expect } from "vitest";
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
  dasCircuitBand,
  dcsBand,
  dimensionBandVariance,
  dpsBand,
  dwsBand,
  eventScore,
  eventWetness,
  isWetWeather,
  lapDurations,
  lapPerformance,
  median,
  MIN_EVENTS,
  normalizeClassName,
  normalizedPosition,
  representativeLaps,
  sampleStdDev,
  sessionKind,
  sessionScore,
  sessionWetness,
  toFiniteNumber,
  type FieldRow,
} from "../../supabase/functions/_shared/fingerprint-math";

describe("numeric helpers", () => {
  it("toFiniteNumber parses DB numerics and rejects junk", () => {
    expect(toFiniteNumber("5.729")).toBe(5.729);
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber("0")).toBe(0);
    expect(toFiniteNumber("")).toBeNull();
    expect(toFiniteNumber("abc")).toBeNull();
    expect(toFiniteNumber(NaN)).toBeNull();
    expect(toFiniteNumber(Infinity)).toBeNull();
    expect(toFiniteNumber(null)).toBeNull();
    expect(toFiniteNumber(undefined)).toBeNull();
  });

  it("median averages the middle pair for even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("sampleStdDev uses n-1", () => {
    expect(sampleStdDev([1, 2, 3, 4])).toBeCloseTo(1.290994, 6);
    expect(sampleStdDev([5])).toBe(0);
  });
});

describe("circuit indices", () => {
  it("matches hand-computed values for Daytona (5.729 km, 12 turns, 4.17 km straights, 9.1 m, 4 heavy)", () => {
    const m = computeCircuitIndices(5.729, 12, 4.17, 9.1, 4);
    // TD = 2.0946/km → TDn = 0.1383; SR = 0.7279; TCS = (0.5896 + 1)/2 = 79.5
    expect(m.tcs100).toBe(79.5);
    // EI = 5 × 9.1 / 5.729 = 7.94
    expect(m.ei).toBe(7.9);
    // CSI = 4/12
    expect(m.csi).toBe(33.3);
    // TDI = (20.5 + 7.9 + 49.95) / 3.5 = 22.39
    expect(m.tdi).toBe(22.4);
  });

  it("EI no longer saturates for hilly IMSA circuits", () => {
    const roadAtlanta = computeCircuitIndices(4.09, 12, 1.75, 42, 3).ei!;
    const laguna = computeCircuitIndices(3.6, 11, 1.08, 46, 5).ei!;
    const ctmp = computeCircuitIndices(4.01, 10, 1.13, 57, 3).ei!;
    const spa = computeCircuitIndices(7.004, 19, 2.6, 102, 3).ei!;
    for (const v of [roadAtlanta, laguna, ctmp, spa]) expect(v).toBeLessThan(100);
    // ordering by metres of elevation range per km is preserved
    expect(roadAtlanta).toBeLessThan(laguna);
    expect(laguna).toBeLessThan(ctmp);
    expect(spa).toBeCloseTo(72.8, 1);
  });

  it("accepts numeric strings and treats 0 as a real value", () => {
    const m = computeCircuitIndices("4.0", "10", "0", "0", "0");
    expect(m.ei).toBe(0);
    expect(m.csi).toBe(0);
    expect(m.tcs100).not.toBeNull();
    expect(m.tdi).not.toBeNull();
  });

  it("returns null for missing or impossible inputs instead of NaN/Infinity", () => {
    expect(computeCircuitIndices(null, 12, 4, 10, 4)).toEqual({ tcs100: null, ei: null, csi: 33.3, tdi: null });
    expect(computeCircuitIndices(0, 12, 4, 10, 4).tcs100).toBeNull();
    expect(computeCircuitIndices(5, 0, 4, 10, 4).csi).toBeNull();
    // straights longer than the lap
    expect(computeCircuitIndices(3, 10, 4, 10, 4).tcs100).toBeNull();
    // more heavy-braking corners than corners
    expect(computeCircuitIndices(3, 4, 1, 10, 5).csi).toBeNull();
    // EI only needs the length
    expect(computeCircuitIndices(5, null, null, 25, null).ei).toBe(25);
    for (const v of Object.values(computeCircuitIndices("x", "y", "z", "w", "v"))) expect(v).toBeNull();
  });

  it("all indices stay within 0–100 at the extremes", () => {
    const extremes = [
      computeCircuitIndices(1, 100, 0, 1000, 100),
      computeCircuitIndices(10, 1, 10, 0, 0),
    ];
    for (const m of extremes) for (const v of Object.values(m)) {
      expect(v).not.toBeNull();
      expect(v!).toBeGreaterThanOrEqual(0);
      expect(v!).toBeLessThanOrEqual(100);
    }
    expect(extremes[0].tdi).toBe(100);
  });

  it("DAS circuit bands keep their physical cut points (2.5 and 5.5 m/km)", () => {
    expect(dasCircuitBand("ei", 12.5)).toBe("Low");
    expect(dasCircuitBand("ei", 12.6)).toBe("Mid");
    expect(dasCircuitBand("ei", 27.5)).toBe("Mid");
    expect(dasCircuitBand("ei", 27.6)).toBe("High");
    expect(dasCircuitBand("tcs", 41)).toBe("Low");
    expect(dasCircuitBand("tcs", 60)).toBe("Mid");
    expect(dasCircuitBand("tcs", 60.1)).toBe("High");
    expect(dasCircuitBand("csi", 33)).toBe("Low");
    expect(dasCircuitBand("csi", 66.7)).toBe("High");
  });
});

describe("normalised position", () => {
  it("maps first → 1 and last → 0", () => {
    expect(normalizedPosition(1, 10)).toBe(1);
    expect(normalizedPosition(10, 10)).toBe(0);
    expect(normalizedPosition(5, 9)).toBe(0.5);
  });

  it("has no score for a field of one (old code returned a perfect 1.0)", () => {
    expect(normalizedPosition(1, 1)).toBeNull();
    expect(normalizedPosition(1, 0)).toBeNull();
  });

  it("clamps positions outside the field and rejects garbage", () => {
    expect(normalizedPosition(12, 10)).toBe(0);
    expect(normalizedPosition(0, 10)).toBeNull();
    expect(normalizedPosition("3", "5")).toBe(0.5);
    expect(normalizedPosition(null, 5)).toBeNull();
  });
});

describe("class-relative field index", () => {
  // A multi-class endurance race stored with one row PER DRIVER (3 rows per car).
  const rows: FieldRow[] = [];
  const add = (car: string, pos: number, cls: string, pic: number | string | undefined, drivers = 3) => {
    for (let d = 0; d < drivers; d++) rows.push({ session_id: "s1", car_number: car, position: pos, extra_data: { Class: cls, PIC: pic } });
  };
  add("7", 1, "GTP", 1);
  add("6", 2, "GTP", 2);
  add("60", 3, "GTP", 3);
  add("57", 4, "GTD", 1);
  add("1", 5, "GTD", "2");
  add("23", 6, "GTD", undefined); // PIC missing → derived (3)
  const idx = buildFieldIndex(rows);

  it("counts distinct cars, not driver rows", () => {
    expect(idx.overall.get("s1")).toBe(6);
    expect(idx.byClass.get("s1")!.get("GTP")).toBe(3);
    expect(idx.byClass.get("s1")!.get("GTD")).toBe(3);
  });

  it("scores within class using PIC (numeric or string)", () => {
    expect(classRelativeNps(rows.find((r) => r.car_number === "57")!, idx)).toMatchObject({ nps: 1, basis: "class", fieldSize: 3 });
    expect(classRelativeNps(rows.find((r) => r.car_number === "1")!, idx)!.nps).toBe(0.5);
    // the GTD class winner is P4 overall but must not be penalised for that
    expect(classRelativeNps(rows.find((r) => r.car_number === "60")!, idx)!.nps).toBe(0);
  });

  it("derives the class position when PIC is missing", () => {
    expect(classRelativeNps(rows.find((r) => r.car_number === "23")!, idx)).toMatchObject({ nps: 0, position: 3 });
  });

  it("falls back to overall position for rows without a class", () => {
    const r: FieldRow[] = [
      { session_id: "s2", car_number: "1", position: 1 },
      { session_id: "s2", car_number: "2", position: 2 },
      { session_id: "s2", car_number: "3", position: 3 },
    ];
    expect(classRelativeNps(r[1], buildFieldIndex(r))).toMatchObject({ nps: 0.5, basis: "overall" });
  });

  it("returns null for a sole entrant in its class", () => {
    const r: FieldRow[] = [
      { session_id: "s3", car_number: "1", position: 1, extra_data: { Class: "LMP3", PIC: 1 } },
      { session_id: "s3", car_number: "2", position: 2, extra_data: { Class: "GTD", PIC: 1 } },
      { session_id: "s3", car_number: "3", position: 3, extra_data: { Class: "GTD", PIC: 2 } },
    ];
    expect(classRelativeNps(r[0], buildFieldIndex(r))).toBeNull();
  });

  it("normalises class names", () => {
    expect(normalizeClassName("GTD PRO")).toBe("GTDPRO");
    expect(normalizeClassName("gtd-pro")).toBe("GTDPRO");
    expect(normalizeClassName("  ")).toBeNull();
  });
});

describe("race outcome classification", () => {
  it("scores finishers by position", () => {
    expect(classifyRaceOutcome("finished", null)).toEqual({ kind: "score" });
    expect(classifyRaceOutcome(null, null)).toEqual({ kind: "score" });
  });

  it("excludes DNFs that are not the driver's fault or have no reason", () => {
    expect(classifyRaceOutcome("dnf", "Mechanical Failure").kind).toBe("exclude");
    expect(classifyRaceOutcome("dnf", "Technical Failure (Non-Contact)").kind).toBe("exclude");
    expect(classifyRaceOutcome("dnf", "Not At Fault – Contact").kind).toBe("exclude");
    expect(classifyRaceOutcome("dnf", "").kind).toBe("exclude");
    expect(classifyRaceOutcome("dnf", "Other").kind).toBe("exclude");
    expect(classifyRaceOutcome("DNS", null).kind).toBe("exclude");
  });

  it("separates self-inflicted (no penalty) from penalised retirements", () => {
    // Old code matched "at fault" + "penal" in "(No Penalty)" and gave 0.10 instead of 0.25.
    expect(classifyRaceOutcome("dnf", "At Fault – Self-Inflicted (No Penalty)")).toEqual({ kind: "fixed", nps: 0.25 });
    expect(classifyRaceOutcome("dnf", "At Fault – Penalized")).toEqual({ kind: "fixed", nps: 0.1 });
    expect(classifyRaceOutcome("retired", "Spun into the gravel")).toEqual({ kind: "fixed", nps: 0.25 });
  });

  it("handles disqualifications", () => {
    expect(classifyRaceOutcome("dsq", "Technical")).toEqual({ kind: "score" });
    expect(classifyRaceOutcome("disqualified", "Driving Conduct")).toEqual({ kind: "fixed", nps: 0.1 });
  });
});

describe("lap pace", () => {
  it("builds durations from cumulative elapsed time and skips gaps", () => {
    const d = lapDurations([
      { lap: 1, elapsed: 100 },
      { lap: 2, elapsed: 200 },
      { lap: 3, elapsed: 301 },
      { lap: 5, elapsed: 503 }, // lap 4 missing → lap 5 has no duration
      { lap: 6, elapsed: 603 },
    ]);
    expect([...d.entries()]).toEqual([
      [2, 100],
      [3, 101],
      [6, 100],
    ]);
  });

  it("drops implausible and pit/caution laps", () => {
    expect(lapDurations([{ lap: 1, elapsed: 0 }, { lap: 2, elapsed: 5 }]).size).toBe(0);
    expect(representativeLaps([100, 101, 99, 100, 180, 140])).toEqual([100, 101, 99, 100]);
  });

  it("scores pace relative to the class reference", () => {
    const driver = [99, 99.5, 100, 100.5, 101];
    const perf = lapPerformance(driver, [100, 100, 100, 102])!;
    expect(perf.paceRatio).toBeCloseTo(1, 6);
    expect(perf.paceScore).toBeCloseTo(0.5, 6);
    // cv ≈ 0.79% → consistency 1
    expect(perf.consistencyScore).toBe(1);
    expect(perf.score).toBeCloseTo(0.65, 6);
  });

  it("requires enough laps and enough cars", () => {
    expect(lapPerformance([100, 100, 100, 100], [100, 100, 100])).toBeNull();
    expect(lapPerformance([100, 100, 100, 100, 100], [100, 100])).toBeNull();
    expect(carReferenceLap([100, 100, 100])).toBeNull();
    expect(carReferenceLap([100, 101, 99, 100, 300])).toBeNull(); // only 4 representative laps
    expect(carReferenceLap([100, 101, 99, 100, 102, 300])).toBe(100);
  });
});

describe("session and event scores", () => {
  it("maps session types", () => {
    expect(sessionKind("endurance_race")).toBe("race");
    expect(sessionKind("sprint_race")).toBe("race");
    expect(sessionKind("qualifying")).toBe("qualifying");
    expect(sessionKind("practice")).toBe("practice");
    expect(sessionKind(null)).toBe("practice");
  });

  it("without a teammate comparison the session score is the NPS (no shrinkage)", () => {
    expect(sessionScore({ kind: "race", nps: 0.8, crs: null })).toEqual({ score: 0.8, weight: 5 });
    expect(sessionScore({ kind: "qualifying", nps: 0.8, crs: null }).weight).toBe(3);
    expect(sessionScore({ kind: "practice", nps: 0.8, crs: null }).weight).toBe(1);
  });

  it("blends CRS and lap pace with documented weights", () => {
    const s = sessionScore({ kind: "race", nps: 0.8, crs: 0.2 });
    expect(s.score).toBeCloseTo((5 * 0.8 + 3 * 0.2) / 8, 10);
    expect(s.weight).toBe(8);
    const spec = sessionScore({ kind: "race", nps: 0.8, crs: 0.2, spec: true });
    expect(spec.score).toBeCloseTo((5 * 0.8 + 4.5 * 0.2) / 9.5, 10);
    expect(sessionScore({ kind: "race", nps: 0.8, crs: null, lapScore: 0.4 }).score).toBeCloseTo(0.6, 10);
  });

  it("event score is the weighted mean and ignores non-finite input", () => {
    expect(eventScore([{ score: 1, weight: 5 }, { score: 0, weight: 3 }, { score: 0.5, weight: 1 }])).toBeCloseTo(5.5 / 9, 10);
    expect(eventScore([{ score: NaN, weight: 5 }])).toBeNull();
    expect(eventScore([])).toBeNull();
  });
});

describe("driver metrics", () => {
  it("DPS needs the minimum number of events", () => {
    expect(computeDPS([0.9, 0.9, 0.9, 0.9])).toBeNull();
    expect(computeDPS([0.9, 0.8, 0.7, 0.6, 0.5])).toBe(70);
    expect(computeDPS([1.2, 1.2, 1.2, 1.2, 1.2])).toBe(100);
  });

  it("aDPS weights each event by its own CDM and ignores events without one", () => {
    const ev = [0.8, 0.8, 0.8, 0.8, 0.8].map((score) => ({ score, cdm: 0.9 }));
    expect(computeADPS(ev)).toBe(72);
    expect(computeADPS([...ev.slice(0, 4), { score: 0.8, cdm: null }])).toBeNull();
    expect(computeADPS([...ev, { score: 0.1, cdm: null }])).toBe(72);
  });

  it("DCS uses the sample standard deviation and needs 8 events", () => {
    expect(computeDCS([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])).toBeNull();
    expect(computeDCS(Array(8).fill(0.5))).toBe(100);
    const xs = [0.2, 0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8];
    expect(computeDCS(xs)).toBeCloseTo((1 - sampleStdDev(xs) / 0.4) * 100, 1);
    expect(computeDCS([0, 1, 0, 1, 0, 1, 0, 1])).toBe(0);
  });

  it("DAS ignores thin bands and removes sampling noise", () => {
    // Only one event per band → no usable dimension → insufficient data (old code returned a score).
    const thin = [10, 50, 90, 10, 50].map((tcs, i) => ({ score: [0.9, 0.1, 0.5, 0.2, 0.7][i], tcs100: tcs, ei: null, csi: null }));
    expect(computeDAS(thin).das).toBeNull();

    // Same mean in every band → noise-corrected variance 0 → fully adaptable.
    const flat = [
      { score: 0.4, tcs100: 30, ei: 5, csi: 20 },
      { score: 0.6, tcs100: 30, ei: 5, csi: 20 },
      { score: 0.4, tcs100: 70, ei: 40, csi: 80 },
      { score: 0.6, tcs100: 70, ei: 40, csi: 80 },
      { score: 0.5, tcs100: 50, ei: 20, csi: 50 },
    ];
    expect(computeDAS(flat)).toEqual({ das: 100, dimensions: 3 });

    // Strong low/high split → low adaptability.
    const split = [
      { score: 0.9, tcs100: 30, ei: 5, csi: 20 },
      { score: 0.9, tcs100: 30, ei: 5, csi: 20 },
      { score: 0.1, tcs100: 70, ei: 40, csi: 80 },
      { score: 0.1, tcs100: 70, ei: 40, csi: 80 },
      { score: 0.5, tcs100: 50, ei: 20, csi: 50 },
    ];
    expect(computeDAS(split).das).toBe(0);
  });

  it("dimensionBandVariance subtracts the expected noise of band means", () => {
    // Two bands, identical within-band spread, equal means → 0
    expect(dimensionBandVariance([[0.2, 0.8], [0.2, 0.8]])).toBe(0);
    // Means 0.2 vs 0.8 with no within-band spread → population variance of means = 0.09
    expect(dimensionBandVariance([[0.2, 0.2], [0.8, 0.8]])).toBeCloseTo(0.09, 10);
    expect(dimensionBandVariance([[0.2], [0.8, 0.8]])).toBeNull();
  });

  it("DWS compares wet vs dry with minimum samples and clamps", () => {
    expect(computeDWS([0.6], [0.5, 0.5, 0.5, 0.5])).toBeNull();
    expect(computeDWS([0.6, 0.6], [0.5, 0.5, 0.5])).toBeNull();
    expect(computeDWS([0.6, 0.6], [0.5, 0.5, 0.5, 0.5])).toBe(70);
    expect(computeDWS([1, 1], [0, 0, 0, 0])).toBe(100);
    expect(computeDWS([0, 0], [1, 1, 1, 1])).toBe(0);
  });

  it("minimum sample sizes are what the UI advertises", () => {
    expect(MIN_EVENTS).toMatchObject({ dps: 5, dcs: 8, das: 5, dasPerBand: 2, dwsWet: 2, dwsDry: 4 });
  });
});

describe("bands follow the displayed (rounded) value", () => {
  it("DCS", () => {
    expect(dcsBand(79.6)).toBe("Rock Solid"); // shown as 80
    expect(dcsBand(79.4)).toBe("Consistent");
    expect(dcsBand(59.5)).toBe("Consistent");
    expect(dcsBand(39.4)).toBe("Unpredictable");
  });
  it("DAS", () => {
    expect(dasBand(80)).toBe("All-Rounder");
    expect(dasBand(59.4)).toBe("Specialist");
    expect(dasBand(0)).toBe("Type-Dependent");
  });
  it("DWS", () => {
    expect(dwsBand(50)).toBe("Weather Neutral");
    expect(dwsBand(44.5)).toBe("Weather Neutral");
    expect(dwsBand(74.6)).toBe("Wet Weather Specialist");
    expect(dwsBand(24.4)).toBe("Dry Weather Dependent");
  });
  it("DPS", () => {
    expect(dpsBand(64.5)).toBe("Competitive");
    expect(dpsBand(34.4)).toBe("Developing");
  });
});

describe("weather", () => {
  it("classifies a session from rain total and summary", () => {
    expect(isWetWeather({ rain_mm: 2.8, condition_summary: "Variable: Overcast → Moderate rain" })).toBe(true);
    expect(isWetWeather({ rain_mm: 0.1, condition_summary: "Drizzle" })).toBe(false);
    expect(isWetWeather({ rain_mm: "1.1", condition_summary: "Drizzle" })).toBe(true);
    expect(isWetWeather({ rain_mm: null, condition_summary: "Showers" })).toBe(true);
    expect(isWetWeather({ rain_mm: 0, condition_summary: "Clear sky" })).toBe(false);
    expect(isWetWeather({ rain_mm: null, condition_summary: null })).toBeNull();
    expect(isWetWeather(null)).toBeNull();
    // "Rainey" / "Drained" style substrings must not count
    expect(isWetWeather({ rain_mm: 0, condition_summary: "Overcast, drained track" })).toBe(false);
  });

  it("rolls hourly sub-session weather up into the race", () => {
    expect(sessionWetness(null, [true, false, false, false])).toBe(true); // 25 %
    expect(sessionWetness(null, [true, false, false, false, false])).toBe(false); // 20 %
    expect(sessionWetness(true, [])).toBe(true);
    expect(sessionWetness(null, [])).toBeNull();
    expect(sessionWetness(false, [null, null])).toBe(false);
  });

  it("an event is wet when wet sessions carry most of its weight", () => {
    // wet practice (weight 1) + dry race (weight 5) → dry (old code: any wet session → wet event)
    expect(eventWetness([{ weight: 1, wet: true }, { weight: 5, wet: false }])).toBe(false);
    expect(eventWetness([{ weight: 1, wet: false }, { weight: 5, wet: true }])).toBe(true);
    // weather unknown for most of the weight → unknown (old code: dry)
    expect(eventWetness([{ weight: 1, wet: false }, { weight: 5, wet: null }])).toBeNull();
  });
});
