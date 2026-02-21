export interface TrackMetrics {
  tcs100: number | null;
  tcsCategory: string | null;
  ei: number | null;
  eiCategory: string | null;
  csi: number | null;
  csiCategory: string | null;
  tdi: number | null;
  tdiCategory: string | null;
}

export function computeTrackMetrics(
  lengthKm: number | null | undefined,
  turns: number | null | undefined,
  totalStraightLengthKm: number | null | undefined,
  totalElevationChangeM: number | null | undefined,
  heavyBrakingCorners: number | null | undefined
): TrackMetrics {
  const result: TrackMetrics = {
    tcs100: null, tcsCategory: null,
    ei: null, eiCategory: null,
    csi: null, csiCategory: null,
    tdi: null, tdiCategory: null,
  };

  const hasBase = lengthKm && lengthKm > 0 && turns != null && turns > 0;

  // TCS requires length, turns, and straight length
  if (hasBase && totalStraightLengthKm != null && totalStraightLengthKm >= 0) {
    const td = turns / lengthKm;
    const sr = totalStraightLengthKm / lengthKm;
    const tdNorm = Math.max(0, Math.min(1, (td - 1.5) / 4.3));
    const tcs = sr - tdNorm;
    result.tcs100 = Math.round(Math.max(0, Math.min(100, ((tcs + 1.0) / 2.0) * 100)) * 10) / 10;
    result.tcsCategory = tcsCategory(result.tcs100);
  }

  // EI requires length and elevation
  if (hasBase && totalElevationChangeM != null && totalElevationChangeM >= 0) {
    result.ei = Math.round(Math.max(0, Math.min(100, totalElevationChangeM / (lengthKm / 10))) * 10) / 10;
    result.eiCategory = eiCategory(result.ei);
  }

  // CSI requires turns and heavy braking corners
  if (hasBase && heavyBrakingCorners != null && heavyBrakingCorners >= 0) {
    result.csi = Math.round(Math.max(0, Math.min(100, (heavyBrakingCorners / turns) * 100)) * 10) / 10;
    result.csiCategory = csiCategory(result.csi);
  }

  // TDI requires all three sub-scores
  if (result.tcs100 != null && result.ei != null && result.csi != null) {
    result.tdi = Math.round(Math.max(0, Math.min(100, ((100 - result.tcs100) + result.ei + (result.csi * 1.5)) / 3.5)) * 10) / 10;
    result.tdiCategory = tdiCategory(result.tdi);
  }

  return result;
}

function tcsCategory(v: number): string {
  if (v >= 74.0) return "POWER CIRCUIT";
  if (v >= 61.0) return "FAST";
  if (v >= 52.0) return "BALANCED-FAST";
  if (v >= 42.0) return "BALANCED";
  if (v >= 28.0) return "TECHNICAL";
  return "EXTREME CIRCUIT";
}

function eiCategory(v: number): string {
  if (v <= 15) return "Flat";
  if (v <= 35) return "Undulating";
  if (v <= 60) return "Hilly";
  return "Mountain";
}

function csiCategory(v: number): string {
  if (v <= 15) return "Flowing";
  if (v <= 30) return "Mixed";
  if (v <= 50) return "Technical Corners";
  return "Stop-and-Go";
}

function tdiCategory(v: number): string {
  if (v <= 25) return "Low Demand";
  if (v <= 45) return "Moderate Demand";
  if (v <= 70) return "High Demand";
  return "Extreme Demand";
}

export function categoryColor(category: string): string {
  switch (category) {
    // TCS
    case "POWER CIRCUIT": return "text-blue-400";
    case "FAST": return "text-sky-400";
    case "BALANCED-FAST": return "text-teal-400";
    case "BALANCED": return "text-green-400";
    case "TECHNICAL": return "text-orange-400";
    case "EXTREME CIRCUIT": return "text-red-400";
    // EI
    case "Flat": return "text-green-400";
    case "Undulating": return "text-yellow-400";
    case "Hilly": return "text-orange-400";
    case "Mountain": return "text-red-400";
    // CSI
    case "Flowing": return "text-green-400";
    case "Mixed": return "text-yellow-400";
    case "Technical Corners": return "text-orange-400";
    case "Stop-and-Go": return "text-red-400";
    // TDI
    case "Low Demand": return "text-green-400";
    case "Moderate Demand": return "text-yellow-400";
    case "High Demand": return "text-orange-400";
    case "Extreme Demand": return "text-red-400";
    default: return "text-muted-foreground";
  }
}
