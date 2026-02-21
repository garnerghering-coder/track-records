export interface TrackMetrics {
  tcs100: number | null;
  category: string | null;
}

export function computeTrackMetrics(
  lengthKm: number | null | undefined,
  turns: number | null | undefined,
  totalStraightLengthKm: number | null | undefined
): TrackMetrics {
  if (!lengthKm || lengthKm <= 0 || turns == null || turns <= 0 || totalStraightLengthKm == null || totalStraightLengthKm < 0) {
    return { tcs100: null, category: null };
  }

  const td = turns / lengthKm;
  const sr = totalStraightLengthKm / lengthKm;
  const tdNorm = Math.max(0, Math.min(1, (td - 1.5) / 4.3));
  const tcs = sr - tdNorm;
  const tcs100 = Math.round(Math.max(0, Math.min(100, ((tcs + 1.0) / 2.0) * 100)) * 10) / 10;

  let category: string;
  if (tcs100 >= 74.0) category = "POWER CIRCUIT";
  else if (tcs100 >= 61.0) category = "FAST";
  else if (tcs100 >= 52.0) category = "BALANCED-FAST";
  else if (tcs100 >= 42.0) category = "BALANCED";
  else if (tcs100 >= 28.0) category = "TECHNICAL";
  else category = "EXTREME CIRCUIT";

  return { tcs100, category };
}

export function categoryColor(category: string): string {
  switch (category) {
    case "POWER CIRCUIT": return "text-blue-400";
    case "FAST": return "text-sky-400";
    case "BALANCED-FAST": return "text-teal-400";
    case "BALANCED": return "text-green-400";
    case "TECHNICAL": return "text-orange-400";
    case "EXTREME CIRCUIT": return "text-red-400";
    default: return "text-muted-foreground";
  }
}
