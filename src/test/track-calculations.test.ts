import { describe, it, expect } from "vitest";
import { computeTrackMetrics, csiCategory, eiCategory, tcsCategory, tdiCategory } from "@/lib/track-calculations";

describe("computeTrackMetrics", () => {
  it("computes every metric and category for a complete layout", () => {
    // WeatherTech Raceway Laguna Seca, Grand Prix
    const m = computeTrackMetrics(3.6, 11, 1.08, 46, 5);
    // TD = 3.056/km → TDn = 0.3618; SR = 0.3 → TCS = (−0.0618 + 1)/2 = 46.9
    expect(m.tcs100).toBe(46.9);
    expect(m.tcsCategory).toBe("Balanced");
    expect(m.ei).toBe(63.9);
    expect(m.eiCategory).toBe("Hilly");
    expect(m.csi).toBe(45.5);
    expect(m.csiCategory).toBe("High Braking Density");
    // (53.1 + 63.9 + 1.5 × 45.5) / 3.5
    expect(m.tdi).toBe(52.9);
    expect(m.tdiCategory).toBe("Punishing");
  });

  it("accepts Postgres numeric strings and zero values", () => {
    const m = computeTrackMetrics("4.0", "10", "1.2", "0", 0);
    expect(m.ei).toBe(0);
    expect(m.eiCategory).toBe("Flat");
    expect(m.csi).toBe(0);
    expect(m.csiCategory).toBe("Flowing");
  });

  it("leaves metrics empty when data is missing", () => {
    const m = computeTrackMetrics(null, null, null, null, null);
    expect(Object.values(m).every((v) => v == null)).toBe(true);
  });
});

describe("categories match the integer shown in the UI", () => {
  it("TCS", () => {
    expect(tcsCategory(73.6)).toBe("Power Circuit"); // displayed 74
    expect(tcsCategory(73.4)).toBe("Speed Circuit");
    expect(tcsCategory(27.4)).toBe("Tight & Twisty");
    expect(tcsCategory(27.5)).toBe("Technical");
  });
  it("EI", () => {
    expect(eiCategory(15.4)).toBe("Flat"); // displayed 15
    expect(eiCategory(15.5)).toBe("Undulating");
    expect(eiCategory(85.4)).toBe("Highland");
    expect(eiCategory(85.5)).toBe("Mountainous");
  });
  it("CSI", () => {
    expect(csiCategory(30.4)).toBe("Rhythmic");
    expect(csiCategory(50.4)).toBe("High Braking Density");
    expect(csiCategory(50.5)).toBe("Extreme Braking Density");
  });
  it("TDI", () => {
    expect(tdiCategory(25.4)).toBe("Efficient");
    expect(tdiCategory(45.5)).toBe("Punishing");
    expect(tdiCategory(70.5)).toBe("Relentless");
  });
});
