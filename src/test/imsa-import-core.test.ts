import { describe, expect, it } from "vitest";
import { _internals } from "../../supabase/functions/import-imsa-results/core.ts";

const { matchDriver, matchCar, alKamelDriverName, parseTimeCardLaps, parseTimeCardFlagEvents, deriveStrategyRowsFromTimeCard } = _internals;

describe("importer entity matching", () => {
  const drivers = [
    { id: "beche", full_name: "Mathias Beche" },
    { id: "novak", full_name: "Matt Novak(R)" },
    { id: "hasse", full_name: "Valentin Hasse-Clot" },
  ];

  it("matches drivers case-, accent- and rookie-marker-insensitively", () => {
    expect(matchDriver("Mathias BECHE", drivers, new Map())).toBe("beche");
    expect(matchDriver("Matt Novak", drivers, new Map())).toBe("novak");
    expect(matchDriver("Valentin Hasse Clot", drivers, new Map())).toBe("hasse");
    expect(matchDriver("Someone Else", drivers, new Map())).toBeNull();
    expect(matchDriver("Some Alias", drivers, new Map([["some alias", "beche"]]))).toBe("beche");
  });

  it("drops the (R) rookie marker from Al Kamel names", () => {
    expect(alKamelDriverName({ firstname: "Matt", surname: "Novak(R)" })).toBe("Matt Novak");
    expect(alKamelDriverName({ firstname: "Ellie", surname: "Gossett (R)" })).toBe("Ellie Gossett");
    expect(alKamelDriverName({ first_name: "Nick", last_name: "Tandy" })).toBe("Nick Tandy");
  });

  it("matches cars by make and the most specific model, never across makes", () => {
    const cars = [
      { id: "amg", model_name: "GT3", manufacturer: "Mercedes-AMG" },
      { id: "aston", model_name: "Vantage GT3 Evo", manufacturer: "Aston Martin" },
      { id: "lambo", model_name: "GT3 EVO2", manufacturer: "Lamborghini" },
      { id: "bmw", model_name: "M4 GT3 EVO", manufacturer: "BMW" },
      { id: "ferrari", model_name: "296 GT3 EVO", manufacturer: "Ferrari" },
    ];
    expect(matchCar("Mercedes-AMG GT3", cars, "Mercedes-AMG")).toBe("amg");
    expect(matchCar("Aston Martin Vantage GT3 Evo", cars, "Aston Martin")).toBe("aston");
    expect(matchCar("Lamborghini Huracan GT3 EVO2", cars, "Lamborghini")).toBe("lambo");
    expect(matchCar("BMW M4 GT3 EVO", cars, "BMW")).toBe("bmw");
    expect(matchCar("Ferrari 296 GT3", cars, "Ferrari")).toBe("ferrari");
    // no Chevrolet / Porsche GT3 yet: create one rather than borrow Mercedes' "GT3"
    expect(matchCar("Chevrolet Corvette Z06 GT3.R", cars, "Chevrolet")).toBeNull();
    expect(matchCar("Porsche 911 GT3 R (992)", cars, "Porsche")).toBeNull();
  });
});

describe("time card parsing", () => {
  const header = "﻿NUMBER; DRIVER_NUMBER; LAP_NUMBER; LAP_TIME; CROSSING_FINISH_LINE_IN_PIT; ELAPSED;DRIVER_NAME;PIT_TIME;FLAG_AT_FL;";
  const lap = (car: string, n: number, elapsed: string, driver: string, flag: string, inPit = "", pit = "") => `${car};1;${n};1:00.000;${inPit};${elapsed};${driver};${pit};${flag};`;
  const csv = [
    header,
    lap("7", 1, "1:30.000", "Nick Tandy", "GF"),
    lap("7", 2, "3:00.000", "Nick Tandy", "GF"),
    lap("7", 3, "4:40.000", "Nick Tandy", "FCY"),
    lap("7", 4, "6:50.000", "Nick Tandy", "FCY", "B"),
    // pit stop under caution: a slow lap the gap rule alone would not flag
    lap("7", 5, "9:20.000", "Felipe Nasr", "FCY", "", "0:00:59.324"),
    lap("7", 6, "10:50.000", "Felipe Nasr", "GF"),
    lap("7", 7, "12:20.000", "Felipe Nasr", "FF"),
    lap("6", 1, "1:31.000", "Matt Campbell", "GF"),
    lap("6", 2, "4:45.000", "Matt Campbell", "FCY"),
    lap("6", 3, "10:52.000", "Matt Campbell", "GF"),
    // pit box after the line: slow in-lap ending in the pit lane, PIT_TIME on the next lap
    lap("60", 1, "1:30.000", "Tom Blomqvist", "GF"),
    lap("60", 2, "3:00.000", "Tom Blomqvist", "GF"),
    lap("60", 3, "5:13.000", "Tom Blomqvist", "FCY", "B"),
    lap("60", 4, "6:40.000", "Colin Braun", "FCY", "", "0:01:07.392"),
    lap("60", 5, "8:10.000", "Colin Braun", "FCY"),
  ].join("\n");

  it("derives flag periods from FLAG_AT_FL, keeping the state through the chequered flag", () => {
    expect(parseTimeCardFlagEvents(csv)).toEqual([
      { elapsedSec: 0, state: "GREEN" },
      { elapsedSec: 280, state: "FCY" },
      { elapsedSec: 650, state: "GREEN" },
    ]);
  });

  it("splits stints at PIT_TIME laps, also under caution", () => {
    const laps = parseTimeCardLaps(csv);
    const flags = parseTimeCardFlagEvents(csv);
    const { stints, pitStops } = deriveStrategyRowsFromTimeCard(laps, new Map([["nick tandy", "d1"], ["felipe nasr", "d2"]]), flags);
    const car7 = stints.filter((s) => s.car_number === "7");
    expect(car7.map((s) => [s.driver_id, s.start_lap, s.end_lap])).toEqual([
      ["d1", 1, 4],
      ["d2", 5, 7],
    ]);
    expect(pitStops.filter((p) => p.car_number === "7").map((p) => [p.lap_number, p.flag_status, p.driver_id])).toEqual([[4, "FCY", "d2"]]);
    // one stop, not two (the slow in-lap is not a second stop), with the pit-lane time
    expect(pitStops.filter((p) => p.car_number === "60").map((p) => [p.lap_number, p.total_pit_time])).toEqual([[3, "1:07.392"]]);
  });
});
