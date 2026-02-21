export interface TrackMetrics {
  turnsPerKm: number | null;
  avgSegmentLengthM: number | null;
  significantStraightsPerKm: number | null;
  significantStraightsToTurnsRatio: number | null;
  technicalityScore: number | null;
  trackType: "power" | "technical" | "balanced" | null;
}

export function computeTrackMetrics(
  lengthKm: number | null | undefined,
  turns: number | null | undefined,
  significantStraights: number | null | undefined
): TrackMetrics {
  const noData: TrackMetrics = {
    turnsPerKm: null,
    avgSegmentLengthM: null,
    significantStraightsPerKm: null,
    significantStraightsToTurnsRatio: null,
    technicalityScore: null,
    trackType: null,
  };

  if (!lengthKm || lengthKm <= 0 || turns == null || turns <= 0) return noData;
  const ss = significantStraights ?? 0;

  const turnsPerKm = turns / lengthKm;
  const avgSegmentLengthM = (lengthKm * 1000) / turns;
  const significantStraightsPerKm = ss / lengthKm;
  const significantStraightsToTurnsRatio = ss / turns;

  const rawScore = turnsPerKm * 1.2 + 10 / (ss + 1);
  const technicalityScore = Math.round(Math.min(rawScore, 10) * 10) / 10;

  let trackType: "power" | "technical" | "balanced";

  const isPower =
    ss >= 3 ||
    significantStraightsPerKm > 0.5 ||
    significantStraightsToTurnsRatio > 0.35;

  const isTechnical =
    (ss <= 1 && (turnsPerKm > 7.5 || avgSegmentLengthM < 160)) ||
    significantStraightsToTurnsRatio < 0.15;

  if (isPower) {
    trackType = "power";
  } else if (isTechnical) {
    trackType = "technical";
  } else {
    trackType = "balanced";
  }

  return {
    turnsPerKm: Math.round(turnsPerKm * 100) / 100,
    avgSegmentLengthM: Math.round(avgSegmentLengthM),
    significantStraightsPerKm: Math.round(significantStraightsPerKm * 100) / 100,
    significantStraightsToTurnsRatio: Math.round(significantStraightsToTurnsRatio * 100) / 100,
    technicalityScore,
    trackType,
  };
}

export function trackTypeLabel(type: "power" | "technical" | "balanced"): string {
  switch (type) {
    case "power": return "Power / Fast";
    case "technical": return "Technical / Curvy";
    case "balanced": return "Balanced";
  }
}

export function trackTypeColor(type: "power" | "technical" | "balanced"): string {
  switch (type) {
    case "power": return "text-blue-400";
    case "technical": return "text-orange-400";
    case "balanced": return "text-green-400";
  }
}
