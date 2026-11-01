import { describe, expect, it } from "vitest";
import {
  buildRecordBook,
  buildRecordIndex,
  decodeRecordIndex,
  expandRecordSlice,
  mergeRecordBooks,
  sliceRecordBook,
  tally,
  teamMatesOf,
  winWord,
  type RecordTables,
} from "@/lib/record-book";

const series = { id: "f1", name: "Formula 1", short_name: "F1" };
const imsa = { id: "imsa", name: "IMSA WeatherTech SportsCar Championship", short_name: "IMSA" };

/** An F1-style weekend (sprint + GP, two cars per team, no classes) and an IMSA race with classes. */
function tables(): RecordTables {
  const ev = (id: string, s: typeof series, date: string) => ({ id, name: `2025 ${id}`, short_name: id, start_date: date, end_date: date, season_id: `${s.id}-2025`, year: 2025, series: s, circuit: { id: "c1", name: "Circuit" } });
  const res = (session_id: string, car: string, driver: string, team: string, position: number, status = "finished", extra: Record<string, unknown> = {}) => ({
    session_id,
    car_number: car,
    driver_id: driver,
    team_id: team,
    car_id: `car-${team}`,
    position,
    status,
    laps_completed: 50,
    gap_to_leader: null,
    extra_data: extra,
  });
  return {
    events: [ev("gp", series, "2025-05-04"), ev("sebring", imsa, "2025-03-15")],
    sessions: [
      { id: "sq", event_id: "gp", name: "Sprint Qualifying", session_type: "qualifying", date: "2025-05-02" },
      { id: "q", event_id: "gp", name: "Qualifying", session_type: "qualifying", date: "2025-05-03" },
      { id: "spr", event_id: "gp", name: "Sprint", session_type: "sprint_race", date: "2025-05-03" },
      { id: "gp-r", event_id: "gp", name: "Grand Prix", session_type: "race", date: "2025-05-04" },
      { id: "seb-r", event_id: "sebring", name: "Race", session_type: "endurance_race", date: "2025-03-15" },
      { id: "seb-h1", event_id: "sebring", name: "Hour 1", session_type: "endurance_race", parent_session_id: "seb-r", date: "2025-03-15" },
    ],
    results: [
      res("spr", "1", "max", "rbr", 1),
      res("spr", "22", "yuki", "rbr", 2),
      res("gp-r", "1", "max", "rbr", 2),
      res("gp-r", "22", "yuki", "rbr", 5),
      res("gp-r", "4", "lando", "mcl", 1),
      res("gp-r", "81", "oscar", "mcl", 3, "dnf"),
      res("seb-r", "7", "a", "pen", 1, "finished", { Class: "GTP", PIC: 1 }),
      res("seb-r", "7", "b", "pen", 1, "finished", { Class: "GTP", PIC: 1 }),
      res("seb-r", "77", "c", "aws", 5, "finished", { Class: "GTD", PIC: 1 }),
      res("seb-h1", "7", "a", "pen", 2, "finished", { Class: "GTP", PIC: 2 }),
    ],
    qualifying: [
      { session_id: "sq", driver_id: "yuki", car_number: "22", position: 1, extra_data: {} },
      { session_id: "q", driver_id: "max", car_number: "1", position: 1, extra_data: {} },
      { session_id: "q", driver_id: "max", car_number: "1", position: 1, extra_data: {} },
    ],
    practice: [{ session_id: "q", driver_id: "reserve" }],
    liveries: [{ season_id: "f1-2025", car_number: "1", image_url: "/m/1.png" }],
    classes: [{ season_id: "imsa-2025", class_name: "GTP", color: "#e63946" }],
    drivers: ["max", "yuki", "lando", "oscar", "a", "b", "c", "reserve"].map((id) => ({ id, full_name: id.toUpperCase(), nationality: null, date_of_birth: null })),
    teams: ["rbr", "mcl", "pen", "aws"].map((id) => ({ id, full_name: id, short_name: null })),
    cars: ["rbr", "mcl", "pen", "aws"].map((t) => ({ id: `car-${t}`, model_name: t, manufacturer: null })),
    fingerprints: [{ driver_id: "max", dps: 90 }],
  };
}

describe("record book", () => {
  const book = buildRecordBook(tables());

  it("uses overall positions when a race has no classes, and class positions when it does", () => {
    const gp = book.byDriver.get("lando")!;
    expect(gp[0].pic).toBe(1);
    expect(gp[0].className).toBeNull();
    const seb = book.byDriver.get("c")!;
    expect(seb[0].pic).toBe(1);
    expect(seb[0].position).toBe(5);
  });

  it("never counts hourly snapshots, and lists sprints without counting them", () => {
    expect(book.byDriver.get("a")!.length).toBe(1);
    const max = book.byDriver.get("max")!;
    expect(max.map((e) => e.sprint)).toEqual([true, false]);
    const t = tally(max);
    expect(t.starts).toBe(1);
    expect(t.wins).toBe(0);
    expect(t.podiums).toBe(1);
    expect(winWord(t)).toBe("win");
    expect(winWord(tally(book.byDriver.get("a")!))).toBe("class win");
  });

  it("counts one pole per event, from the main qualifying session", () => {
    expect(book.driverPoles.get("max")).toBe(1);
    expect(book.driverPoles.get("yuki")).toBeUndefined();
    expect(book.byDriver.get("max")!.find((e) => !e.sprint)!.pole).toBe(true);
    expect(book.driverEvents.get("reserve")).toBe(1);
  });

  it("finds team-mates in the other car and who finished ahead", () => {
    expect(teamMatesOf(book, "max")).toEqual([{ id: "yuki", races: 1, ahead: 1, behind: 0 }]);
    expect(teamMatesOf(book, "oscar")).toEqual([{ id: "lando", races: 1, ahead: 0, behind: 1 }]);
    // co-drivers of one car are not team-mates
    expect(teamMatesOf(book, "a")).toEqual([]);
  });

  it("round-trips a driver's compact record", () => {
    const slice = sliceRecordBook(book, "drivers", "max", { "f1-2025": [{ className: "", position: 1, totalPoints: 26 }] });
    const json = JSON.parse(JSON.stringify(slice));
    const back = expandRecordSlice(json);
    expect(back.byDriver.get("max")).toEqual(book.byDriver.get("max"));
    expect(back.drivers.max.full_name).toBe("MAX");
    expect(back.drivers.yuki).toBeDefined(); // team-mate names travel with the record
    expect(back.fingerprints.max.dps).toBe(90);
    expect(back.driverPoles.get("max")).toBe(1);
    expect(back.championships!.get("max")!["f1-2025"][0].totalPoints).toBe(26);
    expect(back.teammates!.get("max")![0].id).toBe("yuki");
  });

  it("round-trips team and car records, and merges records", () => {
    const team = expandRecordSlice(JSON.parse(JSON.stringify(sliceRecordBook(book, "teams", "pen"))));
    expect(team.byTeam.get("pen")).toEqual(book.byTeam.get("pen"));
    expect(team.byTeam.get("pen")![0].classColor).toBe("#e63946");
    const car = expandRecordSlice(sliceRecordBook(book, "cars", "car-rbr"));
    expect(car.byCar.get("car-rbr")!.length).toBe(4);
    expect(car.byCar.get("car-rbr")!.find((e) => e.carNumber === "1")!.livery).toBe("/m/1.png");
    const both = mergeRecordBooks([expandRecordSlice(sliceRecordBook(book, "drivers", "max")), expandRecordSlice(sliceRecordBook(book, "drivers", "yuki"))]);
    expect(both.entries.length).toBe(4);
  });

  it("builds a compact directory that decodes to per-series tallies", () => {
    const ix = decodeRecordIndex(JSON.parse(JSON.stringify(buildRecordIndex(book))));
    const lando = ix.drivers.find((d) => d.id === "lando")!;
    expect(lando).toMatchObject({ starts: 1, wins: 1, classed: false, series: ["f1"], bySeries: { f1: [1, 1, 1] }, years: [2025, 2025] });
    expect(lando.last?.team).toBe("mcl");
    const a = ix.drivers.find((d) => d.id === "a")!;
    expect(a.classed).toBe(true);
    expect(a.classColors.GTP).toBe("#e63946");
    expect(ix.drivers.find((d) => d.id === "reserve")!.starts).toBe(0);
    expect(ix.teams.map((t) => t.id).sort()).toEqual(["aws", "mcl", "pen", "rbr"]);
    expect(ix.cars.find((c) => c.id === "car-rbr")!.hero?.livery).toBe("/m/1.png");
    expect(ix.classes.map((c) => c.name)).toEqual(["GTP", "GTD"]);
  });
});
