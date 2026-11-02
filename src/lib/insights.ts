/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Race digests: the "story" of each race, computed from the repo data at
 * build time (scripts/build-data.mjs → public/data/derived/digests.json).
 * Pure and dependency-free so it runs in Node, vitest and the browser.
 */

export type Row = Record<string, any>;

export interface DigestInput {
  event: Row;
  sessions: Row[]; // all sessions of the event
  raceResults: Row[]; // v2_race_results for the event's top-level race sessions
  qualifyingResults: Row[]; // v2_qualifying_results for the event's qualifying sessions
  laps: (sessionId: string) => Row[]; // v2_lap_times of a session
  stints: Row[]; // v2_stints for race sessions and their hourly children
  pitStops: Row[]; // v2_pit_stops for race sessions and their hourly children
  flags: Row[]; // v2_flag_segments for race sessions and their hourly children
  layoutLengthKm?: number | null;
  liveries: Record<string, string>; // car_number → image url (this season)
  classColors: Record<string, string>;
  names: { drivers: Record<string, string>; teams: Record<string, string>; cars: Record<string, string> };
}

export interface ClassifiedCar {
  carNumber: string;
  className: string | null;
  pic: number; // position in class (or overall when single-class)
  position: number;
  laps: number | null;
  status: string;
  driverIds: string[];
  teamId: string | null;
  carId: string | null;
  fastestLap: number | null; // seconds
  finishElapsed: number | null; // seconds from race start at the car's last lap
  livery?: string;
}

export interface Insight {
  kind: "closest_finish" | "biggest_climb" | "laps_led" | "fastest_lap" | "longest_stint" | "caution" | "quickest_stop" | "margin" | "stages" | "red_flag";
  title: string; // short label
  value: string; // the headline number
  detail: string; // one sentence
  carNumber?: string;
  className?: string | null;
  driverIds?: string[];
  /** the detail already names the drivers (lists need not repeat them) */
  named?: boolean;
  weight: number; // for ordering (higher = more interesting)
}

export interface RaceDigest {
  sessionId: string;
  sessionName: string;
  sessionType: string;
  hasLaps: boolean;
  classes: { name: string; color: string | null; cars: number }[];
  winners: ClassifiedCar[]; // one per class, class order
  podiums: Record<string, ClassifiedCar[]>; // class → top 3
  insights: Insight[];
  stats: {
    cars: number;
    finishers: number;
    leaderLaps: number | null;
    distanceKm: number | null;
    durationS: number | null;
    leadChanges: number | null;
    cautions: number;
    cautionS: number;
    pitStops: number;
  };
  lapsLed: { carNumber: string; laps: number }[]; // overall, desc
}

export interface EventDigest {
  eventId: string;
  /** light digest (lists): see liteDigest */
  lite?: boolean;
  races: RaceDigest[]; // in running order; the last one is the headline
}

/**
 * The light digest used by lists (public/data/derived/digests.json): winners,
 * classes and stats; only the fastest-lap insight; podiums only for races
 * without classes (where the "winners" row is the podium). Race pages load the
 * full digest (derived/digests/<eventId>.json).
 */
export function liteDigest(d: EventDigest): EventDigest {
  return {
    eventId: d.eventId,
    lite: true,
    races: d.races.map((r) => ({
      ...r,
      insights: r.insights.filter((i) => i.kind === "fastest_lap"),
      podiums: r.classes.length > 1 ? {} : r.podiums,
      lapsLed: [],
    })),
  };
}

/* ── parsing ─────────────────────────────────────────────────── */

export function parseTime(t: unknown): number | null {
  if (t == null) return null;
  if (typeof t === "number") return Number.isFinite(t) ? t : null;
  const s = String(t).trim().replace(/^\+/, "");
  if (!s || /lap/i.test(s)) return null;
  const parts = s.split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function fmtLap(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}

export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function fmtGap(sec: number): string {
  if (sec < 60) return `${sec.toFixed(3)}s`;
  return fmtLap(sec);
}

const CLASS_ORDER = ["GTP", "HYPERCAR", "LMP2", "LMP3", "GTDPRO", "GTD", "LMGT3", "GS", "TCR"];
const norm = (c: string) => c.toUpperCase().replace(/[\s_-]/g, "");
export function classRank(c: string | null | undefined): number {
  if (!c) return 0;
  const i = CLASS_ORDER.indexOf(norm(c));
  return i === -1 ? 50 : i;
}

const isRaceType = (t: string) => t === "race" || t === "endurance_race" || t === "sprint_race";
const isClassified = (status: string) => !/dns|dsq|disq|excluded/i.test(status || "");

/* ── classification ──────────────────────────────────────────── */

export function classify(results: Row[], lapRows: Row[], liveries: Record<string, string>): ClassifiedCar[] {
  const byCar = new Map<string, ClassifiedCar>();
  for (const r of results) {
    const key = String(r.car_number ?? r.id);
    const cls: string | null = r.extra_data?.Class ?? null;
    const pic = Number(r.extra_data?.PIC);
    let c = byCar.get(key);
    if (!c) {
      c = {
        carNumber: key,
        className: cls,
        pic: Number.isFinite(pic) && pic > 0 ? pic : Number(r.position) || 999,
        position: Number(r.position) || 999,
        laps: r.laps_completed ?? null,
        status: r.status || "finished",
        driverIds: [],
        teamId: r.team_id ?? null,
        carId: r.car_id ?? null,
        fastestLap: parseTime(r.fastest_lap_time),
        finishElapsed: null,
        livery: liveries[key],
      };
      byCar.set(key, c);
    }
    if (r.driver_id && !c.driverIds.includes(r.driver_id)) c.driverIds.push(r.driver_id);
    const fl = parseTime(r.fastest_lap_time);
    if (fl != null && (c.fastestLap == null || fl < c.fastestLap)) c.fastestLap = fl;
  }
  // finishing elapsed per car from lap data
  const last = new Map<string, { lap: number; elapsed: number }>();
  for (const l of lapRows) {
    const k = String(l.car_number);
    const cur = last.get(k);
    if (!cur || l.lap_number > cur.lap) last.set(k, { lap: l.lap_number, elapsed: l.elapsed });
  }
  for (const c of byCar.values()) {
    const l = last.get(c.carNumber);
    if (l) {
      c.finishElapsed = l.elapsed;
      if (c.laps == null) c.laps = l.lap;
    }
  }
  return [...byCar.values()].sort((a, b) => a.position - b.position);
}

/* ── laps led ────────────────────────────────────────────────── */

export function lapsLed(lapRows: Row[], restrictTo?: Set<string>): { leaders: string[]; counts: Map<string, number> } {
  const byLap = new Map<number, { car: string; elapsed: number }>();
  for (const l of lapRows) {
    const car = String(l.car_number);
    if (restrictTo && !restrictTo.has(car)) continue;
    const cur = byLap.get(l.lap_number);
    if (!cur || l.elapsed < cur.elapsed) byLap.set(l.lap_number, { car, elapsed: l.elapsed });
  }
  const laps = [...byLap.keys()].sort((a, b) => a - b);
  const leaders = laps.map((n) => byLap.get(n)!.car);
  const counts = new Map<string, number>();
  for (const c of leaders) counts.set(c, (counts.get(c) || 0) + 1);
  return { leaders, counts };
}

/** Merge stints split at hour boundaries (same car + driver, contiguous). */
export function mergeStints(stints: Row[]): Row[] {
  const sorted = [...stints].sort((a, b) => String(a.car_number).localeCompare(String(b.car_number)) || a.start_elapsed - b.start_elapsed);
  const out: Row[] = [];
  for (const s of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.car_number === s.car_number && prev.driver_id === s.driver_id && Math.abs(s.start_elapsed - prev.end_elapsed) < 1.5) {
      prev.end_elapsed = Math.max(prev.end_elapsed, s.end_elapsed);
      prev.end_lap = s.end_lap ?? prev.end_lap;
    } else out.push({ ...s });
  }
  return out;
}

/** Unique flag periods across a race and its hourly children. */
export function mergeFlags(flags: Row[]): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const f of [...flags].sort((a, b) => a.start_elapsed - b.start_elapsed)) {
    const k = `${f.flag_state}|${Math.round(f.start_elapsed)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const prev = out[out.length - 1];
    if (prev && prev.flag_state === f.flag_state && f.start_elapsed <= prev.end_elapsed + 1) prev.end_elapsed = Math.max(prev.end_elapsed, f.end_elapsed);
    else out.push({ ...f });
  }
  return out;
}

/**
 * Caution periods as officials count them: one period runs from the first
 * caution/red flag until green, so "yellow → red → yellow" is a single period.
 */
export function cautionPeriods(flags: Row[]): Row[][] {
  const periods: Row[][] = [];
  let cur: Row[] | null = null;
  for (const f of flags) {
    const neutral = isCaution(f.flag_state) || isRedFlag(f.flag_state);
    if (!neutral) {
      cur = null;
      continue;
    }
    const prev = cur?.[cur.length - 1];
    if (cur && prev && f.start_elapsed <= prev.end_elapsed + 1) cur.push(f);
    else periods.push((cur = [f]));
  }
  return periods.filter((p) => p.some((f) => isCaution(f.flag_state)));
}

export const isCaution = (state: string) => /YELLOW|FCY|SC|SAFETY|CAUTION|CODE ?60|SLOW/i.test(state || "") && !/GREEN/i.test(state || "");
export const isRedFlag = (state: string) => /\bRED\b/i.test(state || "") && !/CHEQ/i.test(state || "");

/** What a neutralisation is called: "virtual safety car", "safety car", "full-course yellow", "caution". */
export function cautionKind(state: string): string {
  const s = (state || "").toUpperCase();
  if (/VSC|VIRTUAL/.test(s)) return "virtual safety car";
  if (/\bSC\b|SAFETY/.test(s)) return "safety car";
  if (/FCY|FULL/.test(s)) return "full-course yellow";
  if (/CODE ?60/.test(s)) return "Code 60";
  return "caution";
}

/** "1 safety car and 2 virtual safety car periods" */
export function describeCautions(states: string[]): string {
  const m = new Map<string, number>();
  for (const st of states) m.set(cautionKind(st), (m.get(cautionKind(st)) || 0) + 1);
  const parts = [...m.entries()].sort((a, b) => b[1] - a[1]);
  const total = states.length;
  if (parts.length === 1) return `${total} ${parts[0][0]} ${total === 1 ? "period" : "periods"}`;
  const list = parts.map(([k, n]) => `${n} ${k}`);
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]} periods`;
}

/** Stage finishing positions from a result's extra_data ("Stage 1", "stage_2", "S1", "Stage1Pos": 1 = stage win). */
export function stagePositions(extra: unknown): Map<number, number> {
  const out = new Map<number, number>();
  if (!extra || typeof extra !== "object") return out;
  for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
    const m = k.match(/^(?:stage[\s_-]?|s)(\d)(?:[\s_-]?(?:pos|position|finish))?$/i);
    const n = Number(v);
    if (m && Number.isFinite(n) && n > 0) out.set(Number(m[1]), n);
  }
  return out;
}

/* ── digest ──────────────────────────────────────────────────── */

export function digestRace(input: DigestInput, session: Row): RaceDigest {
  const childIds = new Set(input.sessions.filter((s) => s.parent_session_id === session.id).map((s) => s.id));
  const inRace = (sid: string) => sid === session.id || childIds.has(sid);
  const results = input.raceResults.filter((r) => r.session_id === session.id);
  const laps = input.laps(session.id);
  const cars = classify(results, laps, input.liveries);
  const name = (id: string) => input.names.drivers[id] || "Unknown";
  const surname = (id: string) => {
    const parts = name(id).replace(/\s*\(R\)\s*$/i, "").trim().split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
  };
  // Solo drivers are named ("Norris"); shared cars go by number ("#7").
  const carLabel = (c: ClassifiedCar) => (c.driverIds.length === 1 ? surname(c.driverIds[0]) : `#${c.carNumber}`);
  const isNamed = (...cs: (ClassifiedCar | undefined)[]) => cs.every((c) => !c || c.driverIds.length === 1);
  const sprint = session.session_type === "sprint_race" || /sprint/i.test(session.name || "");
  const winWord = sprint ? "sprint win" : "win";

  // classes
  const classNames = [...new Set(cars.map((c) => c.className).filter(Boolean) as string[])].sort((a, b) => classRank(a) - classRank(b) || a.localeCompare(b));
  const multi = classNames.length > 1;
  const classes = (classNames.length ? classNames : [null]).map((n) => ({
    name: n ?? "Overall",
    color: n ? input.classColors[n] ?? null : null,
    cars: cars.filter((c) => (n ? c.className === n : true)).length,
  }));
  const inClass = (n: string | null) => cars.filter((c) => (n && multi ? c.className === n : true) && isClassified(c.status)).sort((a, b) => (multi ? a.pic - b.pic : a.position - b.position));
  const podiums: Record<string, ClassifiedCar[]> = {};
  const winners: ClassifiedCar[] = [];
  for (const cl of classes) {
    const list = inClass(cl.name === "Overall" ? null : cl.name);
    podiums[cl.name] = list.slice(0, 3);
    if (list[0]) winners.push(list[0]);
  }

  const insights: Insight[] = [];

  // closest finish (P1 vs P2 per class, same lap)
  let closest: { gap: number; a: ClassifiedCar; b: ClassifiedCar; cls: string | null } | null = null;
  for (const cl of classes) {
    const [a, b] = podiums[cl.name] || [];
    if (!a || !b || a.finishElapsed == null || b.finishElapsed == null || a.laps !== b.laps) continue;
    const gap = b.finishElapsed - a.finishElapsed;
    if (gap > 0 && (!closest || gap < closest.gap)) closest = { gap, a, b, cls: cl.name === "Overall" ? null : cl.name };
  }
  if (closest)
    insights.push({
      kind: "closest_finish",
      title: "Closest finish",
      value: fmtGap(closest.gap),
      detail: `${carLabel(closest.a)} held off ${carLabel(closest.b)}${closest.cls && multi ? ` for the ${closest.cls} ${winWord}` : ` for the ${winWord}`} after ${closest.a.laps} laps.`,
      carNumber: closest.a.carNumber,
      className: closest.cls,
      driverIds: closest.a.driverIds,
      named: isNamed(closest.a),
      weight: closest.gap < 1 ? 100 : closest.gap < 5 ? 80 : 40,
    });

  // winning margin of the overall winner (only if notable and not already the closest)
  const overall = [...cars].filter((c) => isClassified(c.status)).sort((a, b) => a.position - b.position);
  if (overall[0] && overall[1] && overall[0].finishElapsed != null && overall[1].finishElapsed != null && overall[0].laps === overall[1].laps && closest?.a !== overall[0]) {
    const m = overall[1].finishElapsed - overall[0].finishElapsed;
    if (m > 0)
      insights.push({
        kind: "margin",
        title: "Winning margin",
        value: fmtGap(m),
        detail: `${carLabel(overall[0])} beat ${carLabel(overall[1])} to the ${multi ? "overall " : ""}${winWord}.`,
        carNumber: overall[0].carNumber,
        className: overall[0].className,
        driverIds: overall[0].driverIds,
        named: isNamed(overall[0]),
        weight: m < 2 ? 70 : 25,
      });
  }

  // biggest climb (qualifying class position → finishing class position)
  const quali = input.sessions
    .filter((s) => s.session_type === "qualifying" && !s.parent_session_id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .filter((s) => (s.sort_order ?? 0) <= (session.sort_order ?? 0))
    .pop();
  if (quali) {
    const q = input.qualifyingResults.filter((r) => r.session_id === quali.id);
    const start = new Map<string, number>();
    const byClass = new Map<string, Row[]>();
    for (const r of q) {
      const k = multi ? r.extra_data?.Class ?? "_" : "_";
      if (!byClass.has(k)) byClass.set(k, []);
      if (!byClass.get(k)!.some((x) => x.car_number === r.car_number)) byClass.get(k)!.push(r);
    }
    for (const list of byClass.values()) {
      list.sort((a, b) => (Number(a.extra_data?.PIC) || a.position) - (Number(b.extra_data?.PIC) || b.position));
      list.forEach((r, i) => start.set(String(r.car_number), Number(r.extra_data?.PIC) || i + 1));
    }
    let best: { c: ClassifiedCar; from: number; to: number } | null = null;
    for (const c of cars) {
      if (!isClassified(c.status) || /dnf|retired/i.test(c.status)) continue;
      const from = start.get(c.carNumber);
      const to = multi ? c.pic : c.position;
      if (from == null) continue;
      if (from - to > 0 && (!best || from - to > best.from - best.to)) best = { c, from, to };
    }
    if (best && best.from - best.to >= 3)
      insights.push({
        kind: "biggest_climb",
        title: "Biggest climb",
        value: `+${best.from - best.to}`,
        detail: `${carLabel(best.c)} ${sprint ? "started" : "qualified"} P${best.from}${best.c.className && multi ? ` in ${best.c.className}` : ""} and finished P${best.to}.`,
        carNumber: best.c.carNumber,
        className: best.c.className,
        driverIds: best.c.driverIds,
        named: isNamed(best.c),
        weight: 60 + (best.from - best.to) * 2,
      });
  }

  // laps led
  let leadChanges: number | null = null;
  let lapsLedList: { carNumber: string; laps: number }[] = [];
  if (laps.length) {
    const { leaders, counts } = lapsLed(laps);
    leadChanges = leaders.reduce((n, c, i) => (i > 0 && c !== leaders[i - 1] ? n + 1 : n), 0);
    lapsLedList = [...counts.entries()].map(([carNumber, n]) => ({ carNumber, laps: n })).sort((a, b) => b.laps - a.laps);
    const top = lapsLedList[0];
    if (top) {
      const c = cars.find((x) => x.carNumber === top.carNumber);
      insights.push({
        kind: "laps_led",
        title: "Most laps led",
        value: `${top.laps}`,
        detail: `${c ? carLabel(c) : `#${top.carNumber}`} led ${top.laps} of ${leaders.length} laps; the lead changed ${leadChanges} ${leadChanges === 1 ? "time" : "times"}.`,
        carNumber: top.carNumber,
        className: c?.className,
        driverIds: c?.driverIds,
        named: !!c && isNamed(c),
        weight: 45 + Math.min(leadChanges, 40),
      });
    }
  }

  // fastest lap
  const fl = cars.filter((c) => c.fastestLap != null).sort((a, b) => a.fastestLap! - b.fastestLap!)[0];
  if (fl)
    insights.push({
      kind: "fastest_lap",
      title: "Fastest lap",
      value: fmtLap(fl.fastestLap),
      detail: `${carLabel(fl)}${fl.className && multi ? ` (${fl.className})` : ""} set the fastest lap of the ${sprint ? "sprint" : "race"}.`,
      carNumber: fl.carNumber,
      className: fl.className,
      driverIds: fl.driverIds,
      named: isNamed(fl),
      weight: 50,
    });

  // longest stint
  const stints = mergeStints(input.stints.filter((s) => inRace(s.session_id)));
  // Only meaningful where cars share drivers (endurance); single-driver cars always "never hand over".
  const driversPerCar = new Map<string, Set<string>>();
  for (const s of stints) {
    const k = String(s.car_number);
    if (!driversPerCar.has(k)) driversPerCar.set(k, new Set());
    if (s.driver_id) driversPerCar.get(k)!.add(s.driver_id);
  }
  const longest = stints
    .filter((s) => (driversPerCar.get(String(s.car_number))?.size ?? 0) > 1)
    .map((s) => ({ s, d: (s.end_elapsed ?? 0) - (s.start_elapsed ?? 0) }))
    .filter((x) => x.d > 0)
    .sort((a, b) => b.d - a.d)[0];
  if (longest && longest.s.driver_id)
    insights.push({
      kind: "longest_stint",
      title: "Longest stint",
      value: fmtDuration(longest.d),
      detail: `${name(longest.s.driver_id)} drove #${longest.s.car_number} for ${fmtDuration(longest.d)} without handing over.`,
      carNumber: String(longest.s.car_number),
      driverIds: [longest.s.driver_id],
      weight: 35,
    });

  // cautions
  const flags = mergeFlags(input.flags.filter((f) => inRace(f.session_id)));
  const cautionSegments = flags.filter((f) => isCaution(f.flag_state));
  // one entry per caution period (a red flag inside a caution doesn't split it)
  const cautions = cautionPeriods(flags).map((p) => p.find((f) => isCaution(f.flag_state))!);
  const cautionS = cautionSegments.reduce((n, f) => n + Math.max(0, f.end_elapsed - f.start_elapsed), 0);
  const durationS = laps.length ? Math.max(...laps.map((l) => l.elapsed)) : null;
  if (cautions.length && durationS) {
    const kinds = new Set(cautions.map((f) => cautionKind(f.flag_state)));
    insights.push({
      kind: "caution",
      title: kinds.size === 1 && kinds.has("safety car") ? "Behind the safety car" : "Under caution",
      value: `${Math.round((cautionS / durationS) * 100)}%`,
      detail: `${describeCautions(cautions.map((f) => f.flag_state))} neutralised ${fmtDuration(cautionS)} of racing.`,
      weight: 20 + cautions.length,
    });
  }
  const reds = flags.filter((f) => isRedFlag(f.flag_state));
  if (reds.length) {
    const redS = reds.reduce((n, f) => n + Math.max(0, f.end_elapsed - f.start_elapsed), 0);
    insights.push({
      kind: "red_flag",
      title: "Red flag",
      value: reds.length === 1 ? fmtDuration(redS) : `×${reds.length}`,
      detail: `The race was stopped ${reds.length === 1 ? "once" : reds.length === 2 ? "twice" : `${reds.length} times`}${redS > 0 ? `, for ${fmtDuration(redS)} in all` : ""}.`,
      weight: 55 + reds.length * 5,
    });
  }

  // stages (NASCAR-style): extra_data stage positions on the race results
  const stageWins = new Map<number, ClassifiedCar>();
  for (const r of results) {
    for (const [n, pos] of stagePositions(r.extra_data)) {
      if (pos !== 1) continue;
      const c = cars.find((x) => x.carNumber === String(r.car_number));
      if (c && !stageWins.has(n)) stageWins.set(n, c);
    }
  }
  if (stageWins.size) {
    const list = [...stageWins.entries()].sort((a, b) => a[0] - b[0]);
    const winner = overall[0];
    const distinct = new Set(list.map(([, c]) => c.carNumber));
    const sweep = winner && distinct.size === 1 && distinct.has(winner.carNumber);
    insights.push({
      kind: "stages",
      title: sweep ? "Stage sweep" : "Stage winners",
      value: sweep ? `${list.length}/${list.length}` : String(distinct.size),
      detail: sweep
        ? `${carLabel(winner)} won every stage and the race.`
        : `${list.map(([n, c]) => `Stage ${n} to ${carLabel(c)}`).join(", ")}${winner ? `; ${carLabel(winner)} won the race` : ""}.`,
      carNumber: list[0][1].carNumber,
      driverIds: sweep ? winner.driverIds : undefined,
      named: true,
      weight: sweep ? 75 : 50 + distinct.size * 3,
    });
  }

  // pit stops
  const stops = new Map<string, Row>();
  for (const p of input.pitStops.filter((x) => inRace(x.session_id))) stops.set(`${p.car_number}|${p.lap_number}`, p);
  const quickest = [...stops.values()]
    .map((p) => ({ p, d: parseTime(p.stop_duration) }))
    .filter((x) => x.d != null && x.d > 5)
    .sort((a, b) => a.d! - b.d!)[0];
  if (quickest)
    insights.push({
      kind: "quickest_stop",
      title: "Quickest stop",
      value: fmtGap(quickest.d!),
      detail: `#${quickest.p.car_number} had the shortest time in the pit lane${quickest.p.driver_id ? `, ${name(quickest.p.driver_id)} at the wheel` : ""}.`,
      carNumber: String(quickest.p.car_number),
      weight: 15,
    });

  const leaderLaps = overall[0]?.laps ?? null;
  return {
    sessionId: session.id,
    sessionName: session.name,
    sessionType: session.session_type,
    hasLaps: laps.length > 0,
    classes,
    winners,
    podiums,
    insights: insights.sort((a, b) => b.weight - a.weight),
    stats: {
      cars: cars.length,
      finishers: cars.filter((c) => isClassified(c.status) && !/dnf|retired/i.test(c.status)).length,
      leaderLaps,
      distanceKm: leaderLaps && input.layoutLengthKm ? Math.round(leaderLaps * input.layoutLengthKm) : null,
      durationS,
      leadChanges,
      cautions: cautions.length,
      cautionS,
      pitStops: stops.size,
    },
    lapsLed: lapsLedList.slice(0, 10),
  };
}

export function digestEvent(input: DigestInput): EventDigest {
  const races = input.sessions
    .filter((s) => isRaceType(s.session_type) && !s.parent_session_id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return { eventId: input.event.id, races: races.map((s) => digestRace(input, s)).filter((d) => d.winners.length > 0) };
}
