import { describe, expect, it } from "vitest";
import {
  assignClassPositions,
  chooseOfficialSession,
  computedPointsFor,
  enduranceCupSegmentPoints,
  getPointsRules,
  isMainChampionshipPointsFile,
  isNonStarter,
  mergeOfficialPoints,
  parseOfficialPointsFile,
  pickPointsFiles,
  qualifyingPointsForPosition,
  racePointsForPosition,
  recomputeStoredPoints,
  type ResultEntryLike,
} from "../../supabase/functions/_shared/imsa-points";
import { resolvePointsScheme } from "../../supabase/functions/import-imsa-results/series-points";
import officialRaces from "./fixtures/imsa-official-race-points.json";
import gtpTeams2026 from "./fixtures/imsa-points-data-2026-daytona-gtp-teams.json";

describe("IMSA points scale", () => {
  it("awards 350/320/300/280/260 then -10 per place, 10 from 30th back", () => {
    expect([1, 2, 3, 4, 5, 6, 10, 20, 29, 30].map(racePointsForPosition)).toEqual([350, 320, 300, 280, 260, 250, 210, 110, 20, 10]);
    expect(racePointsForPosition(31)).toBe(10);
    expect(racePointsForPosition(45)).toBe(10);
    expect(racePointsForPosition(0)).toBe(0);
    expect(racePointsForPosition(NaN)).toBe(0);
  });

  it("qualifying points are a tenth of the race scale (35 for pole)", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 11, 30, 31].map(qualifyingPointsForPosition)).toEqual([35, 32, 30, 28, 26, 25, 24, 20, 1, 1]);
  });

  it("Endurance Cup segment points are 5/4/3/2", () => {
    expect([1, 2, 3, 4, 12].map((p) => enduranceCupSegmentPoints(p))).toEqual([5, 4, 3, 2, 2]);
    expect(enduranceCupSegmentPoints(1, false)).toBe(0);
  });
});

describe("points schemes", () => {
  const cases: Array<[string, { race: boolean; qual: boolean; official: boolean }]> = [
    ["IMSA WeatherTech SportsCar Championship", { race: true, qual: true, official: true }],
    ["IMSA Michelin Pilot Challenge", { race: true, qual: false, official: true }],
    ["Whelen Mazda MX-5 Cup", { race: false, qual: false, official: true }],
    // Previously matched as WeatherTech because the name contains "IMSA"
    ["IMSA VP Racing SportsCar Challenge", { race: false, qual: false, official: false }],
    ["Porsche Carrera Cup North America", { race: false, qual: false, official: false }],
    ["Lamborghini Super Trofeo North America", { race: false, qual: false, official: false }],
    ["Some Historic Festival", { race: false, qual: false, official: false }],
  ];
  it.each(cases)("%s", (name, expected) => {
    const r = getPointsRules(resolvePointsScheme(name));
    expect({ race: r.computeRacePoints, qual: r.computeQualifyingPoints, official: r.officialPoints }).toEqual(expected);
  });
});

describe("class positions", () => {
  const e = (number: string, cls: string, position: number, status = "Classified", not_finished = false): ResultEntryLike => ({ number, class: cls, position, status, not_finished });

  it("counts per class in position order, regardless of array order", () => {
    const entries = [e("3", "GTD", 3), e("1", "GTP", 1), e("2", "GTD", 2), e("4", "GTP", 4)];
    expect(assignClassPositions(entries).map((p) => p.classPosition)).toEqual([2, 1, 1, 2]);
  });

  it("retirements keep their classified position and score", () => {
    const [p] = assignClassPositions([e("9", "LMP2", 1, "Classified", true)]);
    expect(p.classPosition).toBe(1);
    expect(computedPointsFor(p, "race", getPointsRules("imsa_wtscc"))).toBe(350);
  });

  it("non-starters take no position and score 0", () => {
    const entries = [e("1", "LMP2", 1), e("79", "LMP2", 2, "Not Started"), e("2", "LMP2", 3)];
    const placements = assignClassPositions(entries);
    expect(isNonStarter(entries[1])).toBe(true);
    expect(placements.map((p) => p.classPosition)).toEqual([1, null, 2]);
    expect(placements.map((p) => computedPointsFor(p, "race", getPointsRules("imsa_wtscc")))).toEqual([350, 0, 320]);
  });

  it("disqualified cars score 0 and do not push others down", () => {
    const entries = [e("1", "GTD", 1, "DSQ"), e("2", "GTD", 2)];
    expect(assignClassPositions(entries).map((p) => p.classPosition)).toEqual([null, 1]);
  });

  it("no qualifying points in the Pilot Challenge; nothing computed for MX-5", () => {
    const [p] = assignClassPositions([e("1", "GS", 1)]);
    expect(computedPointsFor(p, "qualifying", getPointsRules("imsa_mpc"))).toBeNull();
    expect(computedPointsFor(p, "race", getPointsRules("imsa_mpc"))).toBe(350);
    expect(computedPointsFor(p, "race", getPointsRules("mx5_cup"))).toBeNull();
    expect(computedPointsFor(p, "qualifying", getPointsRules("imsa_wtscc"))).toBe(35);
  });
});

describe("computed race points match IMSA's official points data", () => {
  type Race = { label: string; scheme: string; entries: ResultEntryLike[]; official: Record<string, number> };
  const races = officialRaces as unknown as Race[];

  it("covers every 2025 WeatherTech/Pilot Challenge round and 2026 Daytona", () => {
    expect(races.length).toBeGreaterThanOrEqual(22);
  });

  it.each(races.map((r) => [r.label, r] as const))("%s", (_label, race) => {
    const rules = getPointsRules(race.scheme);
    const placements = assignClassPositions(race.entries);
    const ours = new Map(placements.map((p) => [p.carNumber, computedPointsFor(p, "race", rules)]));
    // Every car IMSA scored is in the classification (classes not racing that weekend appear with 0)
    const scored = Object.entries(race.official).filter(([, pts]) => pts > 0).map(([car]) => car);
    expect(scored.filter((car) => !ours.has(car))).toEqual([]);
    const mismatches = Object.entries(race.official)
      .filter(([car]) => ours.has(car))
      .filter(([car, pts]) => ours.get(car) !== pts)
      .map(([car, pts]) => `#${car}: official ${pts}, computed ${ours.get(car)}`);
    expect(mismatches).toEqual([]);
  });
});

describe("official points data", () => {
  it("identifies main-championship per-car / per-driver files only", () => {
    const base = "Results/26_2026/02_Daytona International Speedway/01_IMSA WeatherTech SportsCar Championship/POINTS DATA/";
    expect(isMainChampionshipPointsFile(base + "IWSC 02 GTP Teams.json")).toBe(true);
    expect(isMainChampionshipPointsFile(base + "IWSC 01 GTP Drivers.json")).toBe(true);
    expect(isMainChampionshipPointsFile(base + "02 IMEC GTP Teams Standings Daytona.json")).toBe(false);
    expect(isMainChampionshipPointsFile(base + "IWSC 03 GTP Manufacturers.json")).toBe(false);
    expect(isMainChampionshipPointsFile(base.replace("POINTS DATA", "POINTS DATA - Official") + "IMPC 01a GS Drivers.json")).toBe(false);
    expect(isMainChampionshipPointsFile(base + "IWSC 02 GTP Teams.csv")).toBe(false);
  });

  it("prefers the Official folder over Provisional", () => {
    const p = (folder: string) => `Results/x/y/02_IMSA Michelin Pilot Challenge/${folder}/IMPC 02 GS Teams.json`;
    expect(pickPointsFiles([p("POINTS DATA - Provisional"), p("POINTS DATA - Official")])).toEqual([p("POINTS DATA - Official")]);
  });

  it("extracts the latest event's sessions, including qualifying penalties", () => {
    const parsed = parseOfficialPointsFile(gtpTeams2026, "IWSC 02 GTP Teams.json")!;
    expect(parsed.eventName).toBe("Daytona");
    expect(parsed.keyType).toBe("car");
    expect(parsed.sessions.map((s) => s.kind)).toEqual(["qualifying", "race"]);
    // #31 set the fastest time but its times were disallowed: last in class (20), not pole (35)
    expect(parsed.sessions[0].points.get("31")).toBe(20);
    expect(parsed.sessions[0].points.get("93")).toBe(35);
    expect(parsed.sessions[1].points.get("7")).toBe(350);
  });

  it("matches an official session only when it agrees with the classification", () => {
    const parsed = mergeOfficialPoints([parseOfficialPointsFile(gtpTeams2026, "IWSC 02 GTP Teams.json")]);
    const race = parsed.race.map((c) => c.points);
    const cars = [...race[0].keys()];
    const computed = new Map(cars.map((c) => [c, race[0].get(c)!]));
    expect(chooseOfficialSession(cars, computed, race)).toBe(race[0]);
    // A stale file from another event disagrees with what we computed: rejected
    const shuffled = new Map(cars.map((c, i) => [c, race[0].get(cars[(i + 1) % cars.length])!]));
    expect(chooseOfficialSession(cars, shuffled, race)).toBeNull();
  });
});

describe("recomputeStoredPoints", () => {
  const row = (car: string, cls: string, pic: number | string, position: number, extra: Partial<{ status: string; laps: number; points: number | null }> = {}) => ({
    car_number: car,
    position,
    status: extra.status ?? "finished",
    laps_completed: extra.laps ?? 100,
    points: extra.points ?? null,
    extra_data: { Class: cls, PIC: pic },
  });

  it("scores every driver row of a car identically and zeroes a 0-lap 'finished' non-starter", () => {
    const rows = [row("7", "GTP", 1, 1), row("7", "GTP", 1, 1), row("79", "LMP2", 12, 35, { laps: 0, points: 190 }), row("31", "GTP", "2", 2)];
    const out = recomputeStoredPoints({ session_type: "endurance_race", scheme: "imsa_wtscc" }, rows);
    expect(out.map((r) => r.points)).toEqual([350, 350, 0, 320]);
    expect(out[2]).toMatchObject({ status: "dns", changed: true });
  });

  it("keeps a DNF with zero laps (it started) scoring", () => {
    const out = recomputeStoredPoints({ session_type: "race", scheme: "imsa_wtscc" }, [row("70", "GTD", 18, 40, { status: "dnf", laps: 0 })]);
    expect(out[0].points).toBe(130);
  });

  it("never scores hourly snapshots, practice or unverified series", () => {
    const rows = [row("7", "GTP", 1, 1)];
    expect(recomputeStoredPoints({ session_type: "race", parent_session_id: "p", scheme: "imsa_wtscc" }, rows)[0].points).toBeNull();
    expect(recomputeStoredPoints({ session_type: "practice", scheme: "imsa_wtscc" }, rows)[0].points).toBeNull();
    expect(recomputeStoredPoints({ session_type: "race", scheme: "imsa_vprc" }, rows)[0].points).toBeNull();
    expect(recomputeStoredPoints({ session_type: "qualifying", scheme: "imsa_mpc" }, rows)[0].points).toBeNull();
  });

  it("uses official points when supplied", () => {
    const out = recomputeStoredPoints({ session_type: "qualifying", scheme: "imsa_wtscc" }, [row("31", "GTP", 1, 1), row("93", "GTP", 2, 2)], {
      official: new Map([["31", 20], ["93", 35]]),
    });
    expect(out.map((r) => r.points)).toEqual([20, 35]);
  });

  it("can re-derive class positions from overall order", () => {
    const rows = [row("2", "GTD", 9, 2), row("1", "GTP", 9, 1), row("3", "GTD", 9, 3, { status: "dsq" })];
    const out = recomputeStoredPoints({ session_type: "race", scheme: "imsa_wtscc" }, rows, { classPositionFrom: "position" });
    expect(out.map((r) => r.points)).toEqual([350, 350, 0]);
  });
});
