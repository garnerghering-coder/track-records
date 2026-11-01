/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Race Replay engine: reconstructs the running order at any moment of a race
 * from lap crossing times (v2_lap_times.elapsed, seconds from the start),
 * plus who was driving (stints), pit visits, flag periods and race control.
 * Pure — no React, no I/O.
 */

export interface ReplayCar {
  carNumber: string;
  className: string | null;
  teamId: string | null;
  driverIds: string[];
  livery?: string;
  crossings: number[]; // elapsed at the end of lap 1..n (ascending)
  finalStatus: string;
}

export interface ReplayStint {
  carNumber: string;
  driverId: string | null;
  start: number;
  end: number;
}
export interface ReplayPit {
  carNumber: string;
  in: number;
  out: number;
}
export interface ReplayFlag {
  state: string;
  start: number;
  end: number;
}
export interface ReplayMessage {
  t: number;
  text: string;
  color?: string | null;
}

export interface ReplayModel {
  cars: ReplayCar[];
  duration: number;
  stints: Map<string, ReplayStint[]>;
  pits: Map<string, ReplayPit[]>;
  flags: ReplayFlag[];
  messages: ReplayMessage[];
  /** message times, ascending (for binary search) */
  messageTimes: number[];
  leaderCrossings: number[]; // elapsed when the race leader completed lap k (index k-1)
  classLeaderCrossings: Map<string, number[]>;
  typicalLap: number;
}

export interface TowerRow {
  car: ReplayCar;
  position: number; // overall
  classPosition: number;
  laps: number;
  lastCross: number;
  gap: string; // to class leader (or overall leader in "All")
  gapOverall: string;
  interval: string;
  inPit: boolean;
  driverId: string | null;
  out: boolean; // stopped / retired by this time
  lastLap: number | null; // seconds
}

export function buildModel(input: {
  laps: { car_number: string | number; lap_number: number; elapsed: number }[];
  cars: Omit<ReplayCar, "crossings">[];
  stints: { car_number: any; driver_id: string | null; start_elapsed: number; end_elapsed: number }[];
  pits: { car_number: any; pit_in_elapsed: number | null; pit_out_elapsed: number | null }[];
  flags: { flag_state: string; start_elapsed: number; end_elapsed: number }[];
  messages: { description: string; color?: string | null }[];
}): ReplayModel {
  const byCar = new Map<string, number[]>();
  for (const l of input.laps) {
    const k = String(l.car_number);
    if (!byCar.has(k)) byCar.set(k, []);
    const arr = byCar.get(k)!;
    arr[l.lap_number - 1] = l.elapsed;
  }
  const cars: ReplayCar[] = [];
  const known = new Map(input.cars.map((c) => [c.carNumber, c]));
  for (const [k, arr] of byCar) {
    const crossings = arr.filter((x) => typeof x === "number").sort((a, b) => a - b);
    const meta = known.get(k);
    cars.push({ carNumber: k, className: meta?.className ?? null, teamId: meta?.teamId ?? null, driverIds: meta?.driverIds ?? [], livery: meta?.livery, finalStatus: meta?.finalStatus ?? "", crossings });
  }
  const duration = Math.max(0, ...cars.map((c) => c.crossings[c.crossings.length - 1] || 0));

  const leaderOf = (list: ReplayCar[]) => {
    const n = Math.max(0, ...list.map((c) => c.crossings.length));
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      let m = Infinity;
      for (const c of list) if (c.crossings[k] != null && c.crossings[k] < m) m = c.crossings[k];
      out.push(m);
    }
    return out;
  };
  const classLeaderCrossings = new Map<string, number[]>();
  for (const cls of new Set(cars.map((c) => c.className || ""))) classLeaderCrossings.set(cls, leaderOf(cars.filter((c) => (c.className || "") === cls)));

  const laps: number[] = [];
  for (const c of cars) for (let i = 1; i < c.crossings.length; i++) laps.push(c.crossings[i] - c.crossings[i - 1]);
  laps.sort((a, b) => a - b);
  const typicalLap = laps.length ? laps[Math.floor(laps.length * 0.25)] : 90;

  const group = <T extends { carNumber: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of list) {
      if (!m.has(x.carNumber)) m.set(x.carNumber, []);
      m.get(x.carNumber)!.push(x);
    }
    for (const v of m.values()) v.sort((a: any, b: any) => (a.start ?? a.in) - (b.start ?? b.in));
    return m;
  };

  // merge stints split at hour boundaries
  const rawStints = input.stints
    .map((s) => ({ carNumber: String(s.car_number), driverId: s.driver_id, start: s.start_elapsed, end: s.end_elapsed }))
    .sort((a, b) => a.carNumber.localeCompare(b.carNumber) || a.start - b.start);
  const stints: ReplayStint[] = [];
  for (const s of rawStints) {
    const p = stints[stints.length - 1];
    if (p && p.carNumber === s.carNumber && p.driverId === s.driverId && Math.abs(s.start - p.end) < 1.5) p.end = Math.max(p.end, s.end);
    else stints.push({ ...s });
  }
  const seenPit = new Set<string>();
  const pits: ReplayPit[] = [];
  for (const p of input.pits) {
    if (p.pit_in_elapsed == null) continue;
    const k = `${p.car_number}|${Math.round(p.pit_in_elapsed)}`;
    if (seenPit.has(k)) continue;
    seenPit.add(k);
    pits.push({ carNumber: String(p.car_number), in: p.pit_in_elapsed, out: p.pit_out_elapsed ?? p.pit_in_elapsed + 60 });
  }
  const flags: ReplayFlag[] = [];
  for (const f of [...input.flags].sort((a, b) => a.start_elapsed - b.start_elapsed)) {
    const p = flags[flags.length - 1];
    if (p && p.state === f.flag_state && f.start_elapsed <= p.end + 1) p.end = Math.max(p.end, f.end_elapsed);
    else if (!p || Math.round(p.start) !== Math.round(f.start_elapsed) || p.state !== f.flag_state) flags.push({ state: f.flag_state, start: f.start_elapsed, end: f.end_elapsed });
  }
  const messages: ReplayMessage[] = [];
  for (const m of input.messages) {
    const t = parseOffset(m.description);
    if (t == null) continue;
    messages.push({ t, text: m.description.replace(/^\[[^\]]*\]\s*\([^)]*\)\s*/, "").trim(), color: m.color });
  }
  messages.sort((a, b) => a.t - b.t);

  return {
    cars,
    duration,
    stints: group(stints),
    pits: group(pits as any) as any,
    flags,
    messages,
    messageTimes: messages.map((m) => m.t),
    leaderCrossings: leaderOf(cars),
    classLeaderCrossings,
    typicalLap,
  };
}

/** "(+17:26:21.904)" → seconds */
export function parseOffset(text: string): number | null {
  const m = text.match(/\(\+(\d+:)?(\d+):(\d+(?:\.\d+)?)\)/);
  if (!m) return null;
  const h = m[1] ? Number(m[1].slice(0, -1)) : 0;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Number of elements ≤ t in an ascending array. */
function countLE(arr: number[], t: number): number {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function fmtGapS(s: number) {
  if (s < 60) return `+${s.toFixed(s < 10 ? 3 : 1)}`;
  const m = Math.floor(s / 60);
  return `+${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

export function towerAt(model: ReplayModel, t: number, classFilter: string | null): TowerRow[] {
  const rows = model.cars
    .map((car) => {
      const laps = countLE(car.crossings, t);
      const lastCross = laps ? car.crossings[laps - 1] : 0;
      const pits = model.pits.get(car.carNumber) || [];
      const inPit = pits.some((p) => p.in <= t && t <= p.out);
      const stints = model.stints.get(car.carNumber) || [];
      let st: ReplayStint | undefined;
      for (const s of stints) {
        if (s.start > t) break;
        st = s; // the latest stint started by t (stints are sorted by start)
        if (t < s.end) break;
      }
      const finished = laps === car.crossings.length;
      const out = finished && t > lastCross + model.typicalLap * 3 && t < model.duration - model.typicalLap * 2;
      const lastLap = laps >= 2 ? car.crossings[laps - 1] - car.crossings[laps - 2] : null;
      return { car, laps, lastCross, inPit, driverId: st?.driverId ?? car.driverIds[0] ?? null, out, lastLap };
    })
    .sort((a, b) => b.laps - a.laps || a.lastCross - b.lastCross || a.car.carNumber.localeCompare(b.car.carNumber, undefined, { numeric: true }));

  const classCount = new Map<string, number>();
  const gapTo = (leader: number[], r: (typeof rows)[number]) => {
    if (!r.laps) return "";
    const lc = leader[r.laps - 1];
    const leaderLaps = countLE(leader, t);
    if (leaderLaps > r.laps) {
      // lapped? compare against leader's crossing of the same lap count
      const diff = leaderLaps - r.laps;
      // if the leader crossed this lap before and the car is within a lap of the leader's next crossing, show time
      if (diff === 1 && lc != null && r.lastCross - lc < (leader[r.laps] ?? Infinity) - lc) return fmtGapS(Math.max(0, r.lastCross - lc));
      return `+${diff} ${diff === 1 ? "lap" : "laps"}`;
    }
    return lc != null && r.lastCross > lc ? fmtGapS(r.lastCross - lc) : "Leader";
  };
  const out: TowerRow[] = [];
  rows.forEach((r, i) => {
    const cls = r.car.className || "";
    const cp = (classCount.get(cls) || 0) + 1;
    classCount.set(cls, cp);
    const classLeader = model.classLeaderCrossings.get(cls) || model.leaderCrossings;
    const prev = rows[i - 1];
    out.push({
      car: r.car,
      position: i + 1,
      classPosition: cp,
      laps: r.laps,
      lastCross: r.lastCross,
      gap: cp === 1 ? "Leader" : gapTo(classLeader, r),
      gapOverall: i === 0 ? "Leader" : gapTo(model.leaderCrossings, r),
      interval: !prev ? "" : prev.laps > r.laps ? `+${prev.laps - r.laps}L` : fmtGapS(Math.max(0, r.lastCross - prev.lastCross)),
      inPit: r.inPit,
      driverId: r.driverId,
      out: r.out,
      lastLap: r.lastLap,
    });
  });
  return classFilter ? out.filter((r) => (r.car.className || "") === classFilter) : out;
}

export function flagAt(model: ReplayModel, t: number): string {
  // A neutralisation inside a longer period wins (e.g. a VSC within a yellow, a red within a caution).
  let f: ReplayFlag | undefined;
  for (const x of model.flags) if (x.start <= t && t < x.end && (!f || x.start >= f.start)) f = x;
  return f?.state || (t <= 0 ? "PRE" : t >= model.duration ? "CHEQUERED" : "GREEN");
}

export function messagesUntil(model: ReplayModel, t: number, n = 5): ReplayMessage[] {
  const idx = countLE(model.messageTimes ?? model.messages.map((m) => m.t), t);
  return model.messages.slice(Math.max(0, idx - n), idx).reverse();
}

export function clock(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
}
