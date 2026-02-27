// ── Lap-based position calculation utilities ────────────────────────

export interface LapTimeRow {
  car_number: string;
  lap_number: number;
  elapsed: number;
}

export interface CarStanding {
  carNumber: string;
  position: number;
  lapsCompleted: number;
  elapsed: number;
}

/**
 * Compute car positions at a given elapsed time from lap timing data.
 * Position = most laps completed, tiebreak = earliest elapsed for that lap.
 */
export function computeStandingsAtTime(
  lapTimes: LapTimeRow[],
  atElapsed: number
): CarStanding[] {
  const carLatest = new Map<string, { lap: number; elapsed: number }>();

  for (const lt of lapTimes) {
    if (lt.elapsed > atElapsed) continue;
    const existing = carLatest.get(lt.car_number);
    if (
      !existing ||
      lt.lap_number > existing.lap ||
      (lt.lap_number === existing.lap && lt.elapsed < existing.elapsed)
    ) {
      carLatest.set(lt.car_number, { lap: lt.lap_number, elapsed: lt.elapsed });
    }
  }

  const standings = Array.from(carLatest.entries()).map(([cn, info]) => ({
    carNumber: cn,
    position: 0,
    lapsCompleted: info.lap,
    elapsed: info.elapsed,
  }));

  standings.sort((a, b) => {
    if (b.lapsCompleted !== a.lapsCompleted) return b.lapsCompleted - a.lapsCompleted;
    return a.elapsed - b.elapsed;
  });

  standings.forEach((s, i) => (s.position = i + 1));
  return standings;
}

/**
 * Compute class positions at a given time.
 */
export function computeClassStandingsAtTime(
  lapTimes: LapTimeRow[],
  atElapsed: number,
  carClassMap: Map<string, string>
): (CarStanding & { classPosition: number; className: string })[] {
  const overall = computeStandingsAtTime(lapTimes, atElapsed);

  // Group by class
  const byClass = new Map<string, CarStanding[]>();
  for (const s of overall) {
    const cls = carClassMap.get(s.carNumber) || "";
    if (!byClass.has(cls)) byClass.set(cls, []);
    byClass.get(cls)!.push(s);
  }

  const result: (CarStanding & { classPosition: number; className: string })[] = [];
  for (const [cls, cars] of byClass) {
    cars.forEach((c, i) => {
      result.push({ ...c, classPosition: i + 1, className: cls });
    });
  }

  return result;
}

/**
 * Generate evenly-spaced sample timestamps appropriate for race duration.
 */
export function generateSampleTimestamps(
  minElapsed: number,
  maxElapsed: number,
  compact?: boolean
): number[] {
  const duration = maxElapsed - minElapsed;
  const durationH = duration / 3600;

  let intervalS: number;
  if (durationH > 6) intervalS = compact ? 600 : 300;
  else if (durationH > 1) intervalS = compact ? 300 : 120;
  else intervalS = compact ? 60 : 30;

  const timestamps: number[] = [];
  for (let t = minElapsed; t <= maxElapsed; t += intervalS) {
    timestamps.push(t);
  }
  if (timestamps.length > 0 && timestamps[timestamps.length - 1] < maxElapsed) {
    timestamps.push(maxElapsed);
  }

  return timestamps;
}

/**
 * Format elapsed seconds as H:MM:SS or M:SS.
 */
export function formatElapsedLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Get smart tick interval for x-axis based on total race duration.
 */
export function getTickIntervalSeconds(durationS: number): number {
  const durationH = durationS / 3600;
  if (durationH > 6) return 3600;
  if (durationH > 2) return 1800;
  if (durationH > 0.5) return 600;
  return 300;
}

/**
 * Paginated fetch of all lap times for a session.
 */
export async function fetchAllLapTimes(
  supabase: any,
  sessionId: string
): Promise<LapTimeRow[]> {
  const PAGE_SIZE = 1000;
  const allRows: LapTimeRow[] = [];
  let offset = 0;

  while (true) {
    const { data } = await supabase
      .from("v2_lap_times")
      .select("car_number, lap_number, elapsed")
      .eq("session_id", sessionId)
      .order("car_number")
      .order("elapsed", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    const rows = data || [];
    for (const r of rows) {
      allRows.push({
        car_number: (r as any).car_number,
        lap_number: (r as any).lap_number,
        elapsed: Number((r as any).elapsed),
      });
    }
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRows;
}
