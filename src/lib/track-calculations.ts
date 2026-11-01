import {
  computeTrackFingerprint,
  csiCategory,
  eiCategory,
  tcsCategory,
  tdiCategory,
  type TrackFingerprint,
} from "../../supabase/functions/_shared/fingerprint-math";

/**
 * Circuit fingerprint shown on circuit, event and session pages.
 *
 * The maths and the categories live in supabase/functions/_shared/fingerprint-math.ts (pure,
 * shared with the driver fingerprint and the Node recalculation scripts; formulas documented there):
 *  - tcs100 "Circuit Character"  – straights vs corner density (0 tight … 100 power)
 *  - ei     "Elevation"          – 5 × elevation range (m) / length (km), 100 ⇔ 20 m/km
 *  - csi    "Corner Severity"    – heavy-braking corners as % of all corners
 *  - tdi    "Circuit Demand"     – ((100 − tcs) + ei + 1.5 × csi) / 3.5
 *
 * Categories are chosen from the value rounded to an integer, because that is what the UI
 * displays (so "15" is always "Flat", never "Undulating").
 */
export type TrackMetrics = TrackFingerprint;
export { tcsCategory, eiCategory, csiCategory, tdiCategory };

/**
 * Inputs may be numbers or numeric strings straight from the database (`numeric` columns arrive
 * as strings). Zero is a real value (a flat circuit has 0 m elevation change), so do NOT pre-coerce
 * with `x ? Number(x) : null`.
 */
export function computeTrackMetrics(
  lengthKm: number | string | null | undefined,
  turns: number | string | null | undefined,
  totalStraightLengthKm: number | string | null | undefined,
  totalElevationChangeM: number | string | null | undefined,
  heavyBrakingCorners: number | string | null | undefined,
): TrackMetrics {
  return computeTrackFingerprint({
    length_km: lengthKm,
    turns,
    total_straight_length_km: totalStraightLengthKm,
    total_elevation_change_m: totalElevationChangeM,
    heavy_braking_corners: heavyBrakingCorners,
  });
}

export function categoryColor(category: string): string {
  switch (category) {
    case "Power Circuit": return "text-blue-400";
    case "Speed Circuit": return "text-sky-400";
    case "High-Speed Technical": return "text-teal-400";
    case "Balanced": return "text-green-400";
    case "Technical": return "text-orange-400";
    case "Tight & Twisty": return "text-red-400";
    case "Flat": return "text-green-400";
    case "Undulating": return "text-yellow-400";
    case "Hilly": return "text-orange-400";
    case "Highland": return "text-amber-500";
    case "Mountainous": return "text-red-400";
    case "Flowing": return "text-green-400";
    case "Rhythmic": return "text-yellow-400";
    case "High Braking Density": return "text-orange-400";
    case "Extreme Braking Density": return "text-red-400";
    case "Efficient": return "text-green-400";
    case "Active": return "text-yellow-400";
    case "Punishing": return "text-orange-400";
    case "Relentless": return "text-red-400";
    default: return "text-muted-foreground";
  }
}

export function categoryBubbleClasses(category: string): string {
  switch (category) {
    case "Power Circuit": return "bg-blue-400/15 text-blue-400 border-blue-400/30";
    case "Speed Circuit": return "bg-sky-400/15 text-sky-400 border-sky-400/30";
    case "High-Speed Technical": return "bg-teal-400/15 text-teal-400 border-teal-400/30";
    case "Balanced": return "bg-green-400/15 text-green-400 border-green-400/30";
    case "Technical": return "bg-orange-400/15 text-orange-400 border-orange-400/30";
    case "Tight & Twisty": return "bg-red-400/15 text-red-400 border-red-400/30";
    case "Flat": return "bg-green-400/15 text-green-400 border-green-400/30";
    case "Undulating": return "bg-yellow-400/15 text-yellow-400 border-yellow-400/30";
    case "Hilly": return "bg-orange-400/15 text-orange-400 border-orange-400/30";
    case "Highland": return "bg-amber-500/15 text-amber-500 border-amber-500/30";
    case "Mountainous": return "bg-red-400/15 text-red-400 border-red-400/30";
    case "Flowing": return "bg-green-400/15 text-green-400 border-green-400/30";
    case "Rhythmic": return "bg-yellow-400/15 text-yellow-400 border-yellow-400/30";
    case "High Braking Density": return "bg-orange-400/15 text-orange-400 border-orange-400/30";
    case "Extreme Braking Density": return "bg-red-400/15 text-red-400 border-red-400/30";
    case "Efficient": return "bg-green-400/15 text-green-400 border-green-400/30";
    case "Active": return "bg-yellow-400/15 text-yellow-400 border-yellow-400/30";
    case "Punishing": return "bg-orange-400/15 text-orange-400 border-orange-400/30";
    case "Relentless": return "bg-red-400/15 text-red-400 border-red-400/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

export function categoryHexColor(category: string): string {
  switch (category) {
    case "Power Circuit": return "#60a5fa";
    case "Speed Circuit": return "#38bdf8";
    case "High-Speed Technical": return "#2dd4bf";
    case "Balanced": case "Flat": case "Flowing": case "Efficient": return "#4ade80";
    case "Technical": case "Hilly": case "High Braking Density": case "Punishing": return "#fb923c";
    case "Tight & Twisty": case "Mountainous": case "Extreme Braking Density": case "Relentless": return "#f87171";
    case "Undulating": case "Rhythmic": case "Active": return "#facc15";
    case "Highland": return "#f59e0b";
    default: return "#8b8b9a";
  }
}
