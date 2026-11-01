import { describe, expect, it } from "vitest";
import { cautionKind, describeCautions, digestEvent, isCaution, stagePositions, type DigestInput } from "@/lib/insights";

const base = (over: Partial<DigestInput>): DigestInput => ({
  event: { id: "e" },
  sessions: [{ id: "r", name: "Race", session_type: "race", sort_order: 2 }],
  raceResults: [],
  qualifyingResults: [],
  laps: () => [],
  stints: [],
  pitStops: [],
  flags: [],
  liveries: {},
  classColors: {},
  names: { drivers: { lando: "Lando Norris", oscar: "Oscar Piastri", max: "Max Verstappen", kyle: "Kyle Larson", will: "William Byron" }, teams: {}, cars: {} },
  ...over,
});
const res = (car: string, driver: string, position: number, extra: Record<string, unknown> = {}) => ({ session_id: "r", car_number: car, driver_id: driver, position, status: "finished", laps_completed: 57, extra_data: extra });
const lap = (car: string, lap_number: number, elapsed: number) => ({ session_id: "r", car_number: car, lap_number, elapsed });

describe("insights for single-class and single-driver racing", () => {
  it("names solo drivers and says 'the win', not a class", () => {
    const d = digestEvent(
      base({
        raceResults: [res("4", "lando", 1), res("81", "oscar", 2), res("1", "max", 3)],
        laps: () => [lap("4", 57, 5400), lap("81", 57, 5400.4), lap("1", 57, 5410)],
        flags: [
          { session_id: "r", flag_state: "VSC", start_elapsed: 100, end_elapsed: 160 },
          { session_id: "r", flag_state: "SC", start_elapsed: 1000, end_elapsed: 1300 },
          { session_id: "r", flag_state: "RED", start_elapsed: 2000, end_elapsed: 2600 },
        ],
      }),
    );
    const race = d.races[0];
    expect(race.classes).toEqual([{ name: "Overall", color: null, cars: 3 }]);
    const closest = race.insights.find((i) => i.kind === "closest_finish")!;
    expect(closest.detail).toBe("Norris held off Piastri for the win after 57 laps.");
    expect(closest.named).toBe(true);
    expect(race.insights.find((i) => i.kind === "caution")!.detail).toMatch(/^1 virtual safety car and 1 safety car periods neutralised/);
    expect(race.insights.find((i) => i.kind === "red_flag")!.detail).toBe("The race was stopped once, for 10m 00s in all.");
  });

  it("calls a sprint a sprint", () => {
    const d = digestEvent(
      base({
        sessions: [{ id: "r", name: "Sprint", session_type: "sprint_race", sort_order: 1 }],
        raceResults: [res("4", "lando", 1), res("81", "oscar", 2)],
        laps: () => [lap("4", 19, 1800), lap("81", 19, 1801)],
      }),
    );
    expect(d.races[0].insights.find((i) => i.kind === "closest_finish")!.detail).toBe("Norris held off Piastri for the sprint win after 57 laps.");
  });

  it("reports stage winners from extra_data", () => {
    expect([...stagePositions({ "Stage 1": 1, stage_2: "3", S3: 2, Class: "X" })]).toEqual([
      [1, 1],
      [2, 3],
      [3, 2],
    ]);
    const d = digestEvent(base({ raceResults: [res("5", "kyle", 1, { "Stage 1": 1, "Stage 2": 2 }), res("24", "will", 2, { "Stage 1": 4, "Stage 2": 1 })] }));
    const st = d.races[0].insights.find((i) => i.kind === "stages")!;
    expect(st.detail).toBe("Stage 1 to Larson, Stage 2 to Byron; Larson won the race.");
    const sweep = digestEvent(base({ raceResults: [res("5", "kyle", 1, { "Stage 1": 1, "Stage 2": 1 }), res("24", "will", 2)] }));
    expect(sweep.races[0].insights.find((i) => i.kind === "stages")!.title).toBe("Stage sweep");
  });

  it("knows caution flavours", () => {
    expect(["FCY", "SC", "VSC", "YELLOW", "CAUTION", "GREEN", "RED"].map(isCaution)).toEqual([true, true, true, true, true, false, false]);
    expect(cautionKind("VSC")).toBe("virtual safety car");
    expect(cautionKind("FCY")).toBe("full-course yellow");
    expect(describeCautions(["YELLOW", "YELLOW"])).toBe("2 caution periods");
  });
});
