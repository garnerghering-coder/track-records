import { describe, expect, it } from "vitest";
import {
  classPositionFromRow,
  compareStandings,
  computeDriverStandings,
  computeTeamStandings,
  standingsKindForSessionType,
  type StandingsRow,
  type StandingsSession,
} from "@/lib/standings";

const S = (id: string, kind: "race" | "qualifying", eventId: string, order: number, countsForWins = kind === "race"): StandingsSession => ({ id, kind, eventId, order, countsForWins });
const R = (sessionId: string, car: string, driver: string | null, points: number | null, cls = "GTP", pos: number | null = null, status = "finished"): StandingsRow => ({
  sessionId,
  carNumber: car,
  driverId: driver,
  points,
  className: cls,
  classPosition: pos,
  status,
});

describe("row helpers", () => {
  it("maps session types and reads PIC (number or string)", () => {
    expect(["race", "endurance_race", "sprint_race", "qualifying", "practice"].map(standingsKindForSessionType)).toEqual(["race", "race", "race", "qualifying", null]);
    expect(classPositionFromRow({ Class: "GTD", PIC: "4" }, 30)).toBe(4);
    expect(classPositionFromRow({ Class: "GTD", PIC: 2 }, 30)).toBe(2);
    expect(classPositionFromRow({}, 7)).toBe(7);
  });
});

describe("team standings", () => {
  const sessions = [S("q1", "qualifying", "e1", 0), S("r1", "race", "e1", 1)];

  it("counts a car's points once per session however many driver rows it has", () => {
    const rows = [R("r1", "7", "nasr", 350, "GTP", 1), R("r1", "7", "tandy", 350, "GTP", 1), R("r1", "7", "andlauer", 350, "GTP", 1), R("q1", "7", "nasr", 30, "GTP", 3)];
    const [t] = computeTeamStandings(sessions, rows);
    expect(t.totalPoints).toBe(380);
    expect(t.driverIds).toEqual(["nasr", "tandy", "andlauer"]);
    expect(t.wins).toBe(1);
  });

  it("ignores rows of sessions not passed in (hourly snapshots, practice)", () => {
    const rows = [R("r1", "7", "a", 350, "GTP", 1), R("hour-6", "7", "a", 350, "GTP", 1)];
    expect(computeTeamStandings(sessions, rows)[0].totalPoints).toBe(350);
  });

  it("keeps cars apart by class (class change / shared number)", () => {
    const rows = [R("r1", "8", "a", 350, "LMP2", 1), R("r1", "8", "b", 320, "GTD", 2)];
    const out = computeTeamStandings(sessions, rows);
    expect(out.map((t) => [t.className, t.totalPoints, t.position])).toEqual([
      ["LMP2", 350, 1],
      ["GTD", 320, 1],
    ]);
  });

  it("does not count a non-starter's class position as a podium", () => {
    const rows = [R("r1", "79", "a", 0, "LMP2", 3, "dns"), R("r1", "1", "b", 350, "LMP2", 1)];
    const out = computeTeamStandings(sessions, rows);
    expect(out.find((t) => t.carNumber === "79")).toBeUndefined(); // 0 points: not listed
    expect(out[0].podiums).toBe(1);
  });
});

describe("tie-breaks", () => {
  it("more wins beats more seconds at equal points", () => {
    const sessions = [S("r1", "race", "e1", 0), S("r2", "race", "e2", 1)];
    // 350 + 290 vs 320 + 320
    const rows = [R("r1", "A", null, 350, "GS", 1), R("r2", "A", null, 290, "GS", 4), R("r1", "B", null, 320, "GS", 2), R("r2", "B", null, 320, "GS", 2)];
    const out = computeTeamStandings(sessions, rows);
    expect(out.map((t) => [t.carNumber, t.position])).toEqual([
      ["A", 1],
      ["B", 2],
    ]);
  });

  it("countback includes qualifying positions (IMSA 2025 GTD: Hargrove ahead of Aron on 193)", () => {
    const sessions = [S("q", "qualifying", "e1", 0), S("r", "race", "e1", 1)];
    const rows = [R("q", "hargrove", null, 23, "GTD", 8), R("r", "hargrove", null, 170, "GTD", 19), R("q", "aron", null, 13, "GTD", 18), R("r", "aron", null, 180, "GTD", 18)];
    expect(computeTeamStandings(sessions, rows).map((t) => t.carNumber)).toEqual(["hargrove", "aron"]);
  });

  it("identical results: whoever achieved them first ranks ahead (IMSA 2025 MPC: McCumbee R5 before Wetterau R7)", () => {
    const sessions = [S("r5", "race", "e5", 5), S("r7", "race", "e7", 7)];
    const rows = [R("r7", "wetterau", null, 320, "GS", 2), R("r5", "mccumbee", null, 320, "GS", 2)];
    const out = computeTeamStandings(sessions, rows);
    expect(out.map((t) => [t.carNumber, t.position])).toEqual([
      ["mccumbee", 1],
      ["wetterau", 2],
    ]);
  });

  it("compareStandings is 0 only for identical records", () => {
    const a = { totalPoints: 10, results: [{ sessionId: "x", order: 1, points: 10, classPosition: 30 }] };
    expect(compareStandings(a, { ...a })).toBe(0);
  });
});

describe("driver standings", () => {
  it("co-drivers share a position (dense ranking) and earn qualifying points they did not set", () => {
    const sessions = [S("q", "qualifying", "e1", 0), S("r", "race", "e1", 1)];
    const rows = [
      R("q", "6", "jaminet", 21, "GTP", 10),
      R("r", "6", "jaminet", 300, "GTP", 3),
      R("r", "6", "campbell", 300, "GTP", 3),
      R("q", "31", "aitken", 28, "GTP", 3),
      R("r", "31", "aitken", 220, "GTP", 9),
    ];
    const out = computeDriverStandings(sessions, rows);
    expect(out.map((d) => [d.driverId, d.totalPoints, d.position])).toEqual([
      ["campbell", 321, 1],
      ["jaminet", 321, 1],
      ["aitken", 248, 2],
    ]);
  });

  it("a qualifier who did not race keeps the qualifying points (Andlauer, PLM 2025)", () => {
    const sessions = [S("q", "qualifying", "e1", 0), S("r", "race", "e1", 1)];
    const rows = [R("q", "6", "andlauer", 25, "GTP", 6), R("r", "6", "campbell", 300, "GTP", 3)];
    const out = computeDriverStandings(sessions, rows);
    expect(out.find((d) => d.driverId === "andlauer")?.totalPoints).toBe(25);
    expect(out.find((d) => d.driverId === "campbell")?.totalPoints).toBe(325);
  });

  it("a driver in two cars of one class scores only for the regular car (L. Vanthoor, PLM 2025)", () => {
    const sessions = [S("r1", "race", "e1", 0), S("q2", "qualifying", "e2", 1), S("r2", "race", "e2", 2)];
    const rows = [
      R("r1", "7", "lvt", 350, "GTP", 1),
      R("q2", "6", "andlauer", 25, "GTP", 6),
      R("q2", "7", "nasr", 28, "GTP", 4),
      R("r2", "6", "lvt", 300, "GTP", 3),
      R("r2", "6", "campbell", 300, "GTP", 3),
      R("r2", "7", "lvt", 210, "GTP", 10),
      R("r2", "7", "nasr", 210, "GTP", 10),
    ];
    const lvt = computeDriverStandings(sessions, rows).find((d) => d.driverId === "lvt")!;
    expect(lvt.totalPoints).toBe(350 + 28 + 210);
    expect(lvt.carNumbers[0]).toBe("7");
  });

  it("a driver in two classes scores in both (Kirkwood, Daytona 2025)", () => {
    const sessions = [S("r", "race", "e1", 0)];
    const rows = [R("r", "14", "kirkwood", 200, "GTDPRO", 11), R("r", "12", "kirkwood", 170, "GTD", 19)];
    const out = computeDriverStandings(sessions, rows);
    expect(out.map((d) => [d.className, d.totalPoints])).toEqual([
      ["GTDPRO", 200],
      ["GTD", 170],
    ]);
  });

  it("does not double count duplicate rows of the same driver", () => {
    const sessions = [S("r", "race", "e1", 0)];
    const rows = [R("r", "7", "a", 350, "GTP", 1), R("r", "7", "a", 350, "GTP", 1)];
    expect(computeDriverStandings(sessions, rows)[0].totalPoints).toBe(350);
  });
});
