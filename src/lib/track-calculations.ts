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
  if (v >= 74.0) return "Power Circuit";
  if (v >= 61.0) return "Speed Circuit";
  if (v >= 52.0) return "High-Speed Technical";
  if (v >= 42.0) return "Balanced";
  if (v >= 28.0) return "Technical";
  return "Tight & Twisty";
}

function eiCategory(v: number): string {
  if (v <= 15) return "Flat";
  if (v <= 40) return "Undulating";
  if (v <= 65) return "Hilly";
  if (v <= 85) return "Highland";
  return "Mountain";
}

function csiCategory(v: number): string {
  if (v <= 15) return "Flowing";
  if (v <= 30) return "Rhythmic";
  if (v <= 50) return "High Braking Density";
  return "Extreme Braking Density";
}

function tdiCategory(v: number): string {
  if (v <= 25) return "Efficient";
  if (v <= 45) return "Active";
  if (v <= 70) return "Punishing";
  return "Relentless";
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
    case "Mountain": return "text-red-400";
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
    case "Mountain": return "bg-red-400/15 text-red-400 border-red-400/30";
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
    case "Tight & Twisty": case "Mountain": case "Extreme Braking Density": case "Relentless": return "#f87171";
    case "Undulating": case "Rhythmic": case "Active": return "#facc15";
    case "Highland": return "#f59e0b";
    default: return "#8b8b9a";
  }
}
