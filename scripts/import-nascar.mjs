#!/usr/bin/env node
/**
 * Import NASCAR Cup Series seasons from NASCAR's public JSON feeds (cf.nascar.com) into the
 * repo data store: series, seasons, circuits/layouts, events, practice / qualifying / race
 * sessions, results (stage points included in `points`), lap times (Race Replay), pit stops,
 * caution periods (flag segments) and the lap-by-lap notes (Race Control).
 *
 *   node --experimental-strip-types scripts/import-nascar.mjs --season 2025 [--season 2024 ...]
 *     [--race <race_id>] [--replace] [--preview] [--cache <dir>] [--quiet]
 *
 *   --season   one or more seasons (repeat the flag); every points race of the season is imported,
 *              plus the Daytona Duels (points-paying qualifying races) as sprint races of the
 *              Daytona 500 event. Exhibition races (Clash, All-Star Race/Open) are skipped.
 *   --race     only this NASCAR race_id (a Duel id imports into its Daytona 500 event)
 *   --replace  delete the event's existing sessions and every row hanging off them first
 *              (without it, events that already have sessions are skipped)
 *   --preview  fetch and count only, write nothing
 *   --cache    keep the downloaded feeds in <dir> and reuse them (default: $TMPDIR/track-records-nascar-cache)
 *
 * Feeds used (series_id 1 = Cup):
 *   cacher/<year>/1/race_list_basic.json            schedule, race ids
 *   cacher/<year>/1/<race_id>/weekend-feed.json     results (points, laps led, status), stage results,
 *                                                   caution segments, practice/qualifying runs
 *   cacher/<year>/1/<race_id>/lap-times.json        every car's lap times + running position, per-lap flag
 *   cacher/<year>/1/<race_id>/lap-notes.json        lap-by-lap notes (Race Control)
 *   cacher/live/series_1/<race_id>/live-pit-data.json  pit stops
 *   cacher/live/series_1/<race_id>/live-flag-data.json flag changes (red flags)
 *   cacher/drivers.json                             date of birth, hometown country
 * Afterwards run: node --experimental-strip-types scripts/recompute-fingerprints.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { ROOT, openStore } from "./lib/local-store.mjs";

const { values: a } = parseArgs({
  options: {
    season: { type: "string", multiple: true },
    race: { type: "string" },
    replace: { type: "boolean", default: false },
    preview: { type: "boolean", default: false },
    cache: { type: "string" },
    quiet: { type: "boolean", short: "q", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});
if (a.help || !a.season?.length) {
  console.error("usage: scripts/import-nascar.mjs --season <yyyy> [--season <yyyy>] [--race <race_id>] [--replace] [--preview] [--cache <dir>]");
  process.exit(a.help ? 0 : 2);
}
const log = a.quiet ? () => {} : (...m) => console.error(...m);
const CACHE = a.cache || path.join(os.tmpdir(), "track-records-nascar-cache");
const BASE = "https://cf.nascar.com/";
const SERIES_NAME = "NASCAR Cup Series";

/* ── polite cached fetch: one request at a time, 250 ms apart ── */
let requests = 0;
let cacheHits = 0;
let lastRequest = 0;
const cacheFile = (rel) => path.join(CACHE, rel.replace(/[^a-z0-9._-]+/gi, "_"));
/** Forget a cached feed (a race that has not been run yet must be fetched again next time). */
const uncache = (rel) => fs.rmSync(cacheFile(rel), { force: true });
async function feed(rel, { optional = false } = {}) {
  const file = cacheFile(rel);
  if (fs.existsSync(file)) {
    cacheHits++;
    const txt = fs.readFileSync(file, "utf8");
    return txt === "" ? null : JSON.parse(txt);
  }
  const wait = lastRequest + 250 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  requests++;
  const res = await fetch(BASE + rel, { headers: { "user-agent": "track-records-importer (+https://github.com/garnerghering-coder)" } });
  fs.mkdirSync(CACHE, { recursive: true });
  if (res.status === 403 || res.status === 404) {
    if (!optional) throw new Error(`${rel}: HTTP ${res.status}`);
    fs.writeFileSync(file, "");
    return null;
  }
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  const txt = await res.text();
  fs.writeFileSync(file, txt);
  return JSON.parse(txt);
}

/* ── NASCAR track_id → circuit + layout ──
 * Circuits are matched to existing rows by name (case-insensitive); layouts by circuit + name.
 * Lengths are NASCAR's official track lengths (miles → km); turns only where unambiguous. */
const MI = 1.609344;
const TRACKS = {
  105: { circuit: "Daytona International Speedway", short: "Daytona", tz: "America/New_York", layout: "Oval", miles: 2.5, turns: 4, kind: "superspeedway" },
  111: { circuit: "Atlanta Motor Speedway", short: "Atlanta", location: "Hampton, Georgia", lat: 33.3869, lon: -84.3169, tz: "America/New_York", layout: "Oval", miles: 1.54, turns: 4, kind: "superspeedway" },
  42: { circuit: "Las Vegas Motor Speedway", short: "Las Vegas", location: "Las Vegas, Nevada", lat: 36.2719, lon: -115.0106, tz: "America/Los_Angeles", layout: "Oval", miles: 1.5, turns: 4, kind: "oval" },
  84: { circuit: "Phoenix Raceway", short: "Phoenix", location: "Avondale, Arizona", lat: 33.3753, lon: -112.3111, tz: "America/Phoenix", layout: "Oval", miles: 1.0, turns: 4, kind: "oval" },
  14: { circuit: "Bristol Motor Speedway", short: "Bristol", location: "Bristol, Tennessee", lat: 36.5157, lon: -82.257, tz: "America/New_York", layout: "Oval", miles: 0.533, turns: 4, kind: "oval" },
  214: { circuit: "Circuit of the Americas (COTA)", short: "COTA", tz: "America/Chicago", byYear: { 2024: { layout: "Grand Prix" } }, layout: "National Circuit", miles: 2.4, turns: null, kind: "road" },
  26: { circuit: "Richmond Raceway", short: "Richmond", location: "Richmond, Virginia", lat: 37.5917, lon: -77.4197, tz: "America/New_York", layout: "Oval", miles: 0.75, turns: 4, kind: "oval" },
  22: { circuit: "Martinsville Speedway", short: "Martinsville", location: "Ridgeway, Virginia", lat: 36.6342, lon: -79.8517, tz: "America/New_York", layout: "Oval", miles: 0.526, turns: 4, kind: "oval" },
  43: { circuit: "Texas Motor Speedway", short: "Texas", location: "Fort Worth, Texas", lat: 33.0372, lon: -97.2811, tz: "America/Chicago", layout: "Oval", miles: 1.5, turns: 4, kind: "oval" },
  82: { circuit: "Talladega Superspeedway", short: "Talladega", location: "Lincoln, Alabama", lat: 33.5672, lon: -86.0656, tz: "America/Chicago", layout: "Oval", miles: 2.66, turns: 4, kind: "superspeedway" },
  103: { circuit: "Dover Motor Speedway", short: "Dover", location: "Dover, Delaware", lat: 39.1897, lon: -75.5306, tz: "America/New_York", layout: "Oval", miles: 1.0, turns: 4, kind: "oval" },
  41: { circuit: "Kansas Speedway", short: "Kansas", location: "Kansas City, Kansas", lat: 39.1157, lon: -94.8311, tz: "America/Chicago", layout: "Oval", miles: 1.5, turns: 4, kind: "oval" },
  4: { circuit: "Darlington Raceway", short: "Darlington", location: "Darlington, South Carolina", lat: 34.2953, lon: -79.9056, tz: "America/New_York", layout: "Oval", miles: 1.366, turns: 4, kind: "oval" },
  162: { circuit: "Charlotte Motor Speedway", short: "Charlotte", location: "Concord, North Carolina", lat: 35.3522, lon: -80.6828, tz: "America/New_York", layout: "Oval", miles: 1.5, turns: 4, kind: "oval" },
  210: { circuit: "Charlotte Motor Speedway", short: "Charlotte Roval", location: "Concord, North Carolina", lat: 35.3522, lon: -80.6828, tz: "America/New_York", layout: "Roval", miles: 2.28, turns: 17, kind: "road" },
  45: { circuit: "World Wide Technology Raceway", short: "Gateway", location: "Madison, Illinois", lat: 38.6511, lon: -90.1358, tz: "America/Chicago", layout: "Oval", miles: 1.25, turns: 4, kind: "oval" },
  99: { circuit: "Sonoma Raceway", short: "Sonoma", location: "Sonoma, California", lat: 38.1611, lon: -122.4547, tz: "America/Los_Angeles", layout: "NASCAR Course", miles: 1.99, turns: 12, kind: "road" },
  206: { circuit: "Iowa Speedway", short: "Iowa", location: "Newton, Iowa", lat: 41.6797, lon: -93.0128, tz: "America/Chicago", layout: "Oval", miles: 0.875, turns: 4, kind: "oval" },
  138: { circuit: "New Hampshire Motor Speedway", short: "New Hampshire", location: "Loudon, New Hampshire", lat: 43.3625, lon: -71.4606, tz: "America/New_York", layout: "Oval", miles: 1.058, turns: 4, kind: "oval" },
  52: { circuit: "Nashville Superspeedway", short: "Nashville", location: "Lebanon, Tennessee", lat: 36.045, lon: -86.4122, tz: "America/Chicago", layout: "Oval", miles: 1.333, turns: 4, kind: "oval" },
  218: { circuit: "Chicago Street Course", short: "Chicago", location: "Chicago, Illinois", lat: 41.8756, lon: -87.6198, tz: "America/Chicago", layout: "Street Circuit", miles: 2.2, turns: 12, kind: "street" },
  198: { circuit: "Pocono Raceway", short: "Pocono", location: "Long Pond, Pennsylvania", lat: 41.0553, lon: -75.5111, tz: "America/New_York", layout: "Oval", miles: 2.5, turns: 3, kind: "oval" },
  123: { circuit: "Indianapolis Motor Speedway", short: "Indianapolis", tz: "America/Indiana/Indianapolis", layout: "Oval", miles: 2.5, turns: 4, kind: "oval" },
  133: { circuit: "Michigan International Speedway", short: "Michigan", location: "Brooklyn, Michigan", lat: 42.0661, lon: -84.2411, tz: "America/Detroit", layout: "Oval", miles: 2.0, turns: 4, kind: "oval" },
  157: { circuit: "Watkins Glen International", short: "Watkins Glen", tz: "America/New_York", layout: "Short Course with Inner Loop", miles: 2.45, turns: null, kind: "road" },
  40: { circuit: "Homestead-Miami Speedway", short: "Homestead", location: "Homestead, Florida", lat: 25.4517, lon: -80.4089, tz: "America/New_York", layout: "Oval", miles: 1.5, turns: 4, kind: "oval" },
  75: { circuit: "Autódromo Hermanos Rodríguez", short: "Mexico City", tz: "America/Mexico_City", layout: "NASCAR Course", miles: 2.42, turns: null, kind: "road" },
  221: { circuit: "San Diego Street Course", short: "San Diego", location: "Coronado, California", lat: 32.6995, lon: -117.2153, tz: "America/Los_Angeles", layout: "Street Circuit", miles: null, turns: null, kind: "street" },
  39: { circuit: "Chicagoland Speedway", short: "Chicagoland", location: "Joliet, Illinois", lat: 41.4747, lon: -88.0581, tz: "America/Chicago", layout: "Oval", miles: 1.5, turns: 4, kind: "oval" },
  177: { circuit: "North Wilkesboro Speedway", short: "North Wilkesboro", location: "North Wilkesboro, North Carolina", lat: 36.1422, lon: -81.07, tz: "America/New_York", layout: "Oval", miles: 0.625, turns: 4, kind: "oval" },
};

/* ── helpers ── */
const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const uuid = () => crypto.randomUUID();
const round3 = (x) => Math.round(x * 1000) / 1000;
const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const fmtLap = (sec) => {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  if (sec < 60) return sec.toFixed(3);
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(3).padStart(6, "0")}`;
};
const fmtClock = (sec) => {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${(s % 60).toFixed(3).padStart(6, "0")}`;
};
/** "2025-02-16T19:30:00" (UTC) → { date: "2025-02-16", time: "14:30" } in the track's zone. */
function localParts(utcIso, tz) {
  if (!utcIso) return null;
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(utcIso) ? utcIso : utcIso + "Z");
  if (isNaN(d)) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, ms: d.getTime() };
}
/** NASCAR's own times without a zone are US Eastern. */
function easternToUtc(iso) {
  if (!iso) return null;
  for (const off of ["-05:00", "-04:00"]) {
    const d = new Date(iso + off);
    const back = localParts(d.toISOString(), "America/New_York");
    if (back && `${back.date}T${back.time}` === iso.slice(0, 16)) return d.toISOString();
  }
  return new Date(iso + "-05:00").toISOString();
}
const titleRace = (s) =>
  String(s)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bDAYTONA\b/g, "Daytona")
    .replace(/\bXFINITY\b/g, "Xfinity")
    .replace(/\bVISITPA\.COM\b/g, "VisitPA.com");
const cleanDriver = (s) =>
  String(s ?? "")
    .replace(/\((i|P|R|\d+)\)/gi, "")
    .replace(/[*#]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function practiceName(run) {
  const n = run.run_name.replace(/^NCS\s+/i, "").trim();
  if (/final practice/i.test(n)) return "Final Practice";
  const m = n.match(/practice\s*(\d+)?/i);
  if (m) return m[1] ? `Practice ${m[1]}` : "Practice";
  return n;
}
function qualifyingName(run) {
  const n = run.run_name;
  if (/final round/i.test(n)) return "Qualifying – Final Round";
  const r = n.match(/round\s*(\d+)/i);
  const g = n.match(/group\s*([A-Z0-9]+)/i);
  if (r && g) return `Qualifying – Round ${r[1]}, Group ${g[1]}`;
  if (r) return `Qualifying – Round ${r[1]}`;
  if (g) return `Qualifying – Group ${g[1]}`;
  return "Qualifying";
}

/* ── lap timeline ──
 * NASCAR lap times start at each car's own crossing of the start line and red-flag laps are
 * sometimes 9999.999 (time unknown). Elapsed = cumulative lap time + a per-car offset; the offsets
 * (the car's start-line delay, and a re-sync after every unknown lap) are fitted so that the
 * order of line crossings agrees with the running positions NASCAR publishes for every lap. */
function buildTimeline(lapFeed, lapsCompleted, finishPos = new Map()) {
  const cars = [];
  for (const c of lapFeed.laps || []) {
    const num = String(c.Number);
    const maxLap = lapsCompleted.get(num);
    if (maxLap == null || maxLap <= 0) continue;
    const L = [...(c.Laps || [])].sort((x, y) => x.Lap - y.Lap);
    const p0 = L.find((l) => l.Lap === 0)?.RunningPos ?? null;
    const t = [];
    const pos = [];
    for (const l of L) {
      if (l.Lap < 1 || l.Lap > maxLap) continue;
      t[l.Lap] = l.LapTime == null || !(l.LapTime > 0) || l.LapTime >= 5000 ? null : l.LapTime;
      pos[l.Lap] = l.RunningPos ?? null;
    }
    const n = t.length > 1 ? maxLap : 0; // laps the feed lacks (it sometimes stops early) are estimated below
    if (n < 1) continue;
    // laps missing from the feed count as unknown
    for (let k = 1; k <= n; k++) if (!(k in t)) t[k] = null;
    cars.push({ num, p0, t, pos, n, driverId: c.NASCARDriverID });
  }
  if (!cars.length) return null;
  const maxN = Math.max(...cars.map((c) => c.n));
  const med = [];
  for (let k = 1; k <= maxN; k++) med[k] = median(cars.filter((c) => c.n >= k && c.t[k] != null).map((c) => c.t[k]));
  for (let k = 1; k <= maxN; k++) if (med[k] == null) med[k] = med[k - 1] ?? 60;
  for (const c of cars) {
    c.P = new Float64Array(c.n + 1);
    c.seg = new Int32Array(c.n + 1); // segment index per lap
    let s = 0;
    let seg = 0;
    for (let k = 1; k <= c.n; k++) {
      if (c.t[k] == null && k > 1 && c.t[k - 1] != null) seg++; // a run of unknown laps re-syncs once
      s += c.t[k] ?? med[k];
      c.P[k] = s;
      c.seg[k] = seg;
    }
    c.off = new Float64Array(seg + 1);
    c.p0 = c.p0 ?? c.pos[1] ?? cars.length;
  }
  // constraints: at each lap k, the car in running position p crossed before the car in p+1
  const byNum = new Map(cars.map((c) => [c.num, c]));
  const pairs = []; // [ahead, behind, lap]
  for (let k = 1; k <= maxN; k++) {
    const row = cars.filter((c) => c.n >= k && c.pos[k] != null).sort((x, y) => x.pos[k] - y.pos[k]);
    for (let i = 1; i < row.length; i++) pairs.push([row[i - 1], row[i], k]);
  }
  // the official classification fixes the order of the final crossings (the lap feed sometimes
  // stops a few laps early; the field also crosses in order under a caution finish)
  const fin = cars.filter((c) => finishPos.has(c.num)).sort((x, y) => finishPos.get(x.num) - finishPos.get(y.num));
  for (let i = 1; i < fin.length; i++) {
    const [x, y] = [fin[i - 1], fin[i]];
    if (x.n === y.n) for (let w = 0; w < 3; w++) pairs.push([x, y, x.n]);
  }
  const X = (c, k) => c.P[k] + c.off[c.seg[k]];
  const violations = () => pairs.reduce((n, [x, y, k]) => n + (X(x, k) >= X(y, k) ? 1 : 0), 0);
  // 1) start delay grows with grid position: fit one factor per race
  let best = { g: 0, v: Infinity };
  for (let g = 0; g <= 0.4; g += 0.01) {
    for (const c of cars) c.off.fill(g * (c.p0 - 1));
    const v = violations();
    if (v < best.v) best = { g, v };
  }
  for (const c of cars) c.off.fill(best.g * (c.p0 - 1));
  // 2) refine each car's offsets (per segment) by coordinate descent
  const pairsOf = new Map(cars.map((c) => [c, []]));
  for (const p of pairs) {
    pairsOf.get(p[0]).push(p);
    pairsOf.get(p[1]).push(p);
  }
  const segCost = (c, s, value) => {
    const keep = c.off[s];
    c.off[s] = value;
    let v = 0;
    for (const [x, y, k] of pairsOf.get(c)) if (c.seg[k] === s && X(x, k) >= X(y, k)) v++;
    c.off[s] = keep;
    return v;
  };
  const pick = (c, s, cands) => {
    let min = Infinity;
    let at = [];
    for (const v of cands) {
      const cost = segCost(c, s, v);
      if (cost < min) {
        min = cost;
        at = [v];
      } else if (cost === min) at.push(v);
    }
    // middle of the best interval nearest the current value
    at.sort((x, y) => x - y);
    let runs = [[at[0]]];
    for (let i = 1; i < at.length; i++) {
      if (at[i] - at[i - 1] <= 0.0501) runs[runs.length - 1].push(at[i]);
      else runs.push([at[i]]);
    }
    const cur = c.off[s];
    runs.sort((r1, r2) => Math.min(...r1.map((v) => Math.abs(v - cur))) - Math.min(...r2.map((v) => Math.abs(v - cur))));
    const r = runs[0];
    return r[Math.floor(r.length / 2)];
  };
  const grid = (center, half, step) => {
    const out = [];
    for (let v = center - half; v <= center + half + 1e-9; v += step) out.push(v);
    return out;
  };
  for (let it = 0; it < 5; it++) {
    for (const c of cars) {
      for (let s = 0; s < c.off.length; s++) {
        if (s === 0) c.off[0] = pick(c, 0, grid(c.off[0], 4, 0.05));
        else {
          const coarse = pick(c, s, grid(c.off[s - 1], 600, 2));
          c.off[s] = pick(c, s, grid(coarse, 2.5, 0.05));
        }
        // crossings must stay in order: never let a segment start before its previous lap ended
        if (s > 0) {
          const k = c.seg.indexOf(s);
          const minStart = X(c, k - 1) + 0.5 * med[k];
          if (X(c, k) < minStart) c.off[s] += minStart - X(c, k);
        }
      }
    }
  }
  // laps the feed never had at the end of the race: line the cars up in classification order
  for (let i = 1; i < fin.length; i++) {
    const [x, y] = [fin[i - 1], fin[i]];
    const last = y.off.length - 1;
    const trailing = last > 0 && y.t.slice(y.seg.indexOf(last)).every((v) => v == null);
    if (x.n === y.n && trailing && X(y, y.n) <= X(x, y.n)) y.off[last] += X(x, y.n) - X(y, y.n) + 0.1;
  }
  const vFinal = violations();
  // leader's start crossing = 0
  const shift = Math.min(...cars.map((c) => c.off[0]));
  for (const c of cars) for (let s = 0; s < c.off.length; s++) c.off[s] -= shift;
  const elapsed = new Map();
  for (const c of cars) {
    const arr = [];
    for (let k = 1; k <= c.n; k++) arr[k] = round3(X(c, k));
    elapsed.set(c.num, arr);
  }
  const leader = [0];
  for (let k = 1; k <= maxN; k++) leader[k] = Math.min(...cars.filter((c) => c.n >= k).map((c) => elapsed.get(c.num)[k]));
  const fastest = new Map(cars.map((c) => [c.num, Math.min(...c.t.filter((x) => x != null))]));
  return { elapsed, leader, maxN, fastest, stats: { pairs: pairs.length, violations: vFinal, g: best.g, unknownLaps: cars.reduce((n, c) => n + c.off.length - 1, 0) }, byNum, med };
}

/* ── store ── */
const store = openStore({ writable: true });
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};
const rows = async (t) => must(await store.from(t).select("*"), t) || [];
const insert = async (t, list) => {
  if (!list.length) return;
  for (let i = 0; i < list.length; i += 20000) must(await store.from(t).insert(list.slice(i, i + 20000)), `insert ${t}`);
};
const SESSION_TABLES = ["v2_race_results", "v2_qualifying_results", "v2_practice_results", "v2_lap_times", "v2_stints", "v2_pit_stops", "v2_flag_segments", "v2_session_weather", "v2_session_summaries", "v2_annotation_sections"];
async function deleteEventSessions(eventId) {
  const ids = (must(await store.from("v2_sessions").select("id").eq("event_id", eventId), "sessions") || []).map((s) => s.id);
  if (!ids.length) return 0;
  const sections = must(await store.from("v2_annotation_sections").select("id").in("session_id", ids), "sections") || [];
  if (sections.length) must(await store.from("v2_annotation_items").delete().in("section_id", sections.map((s) => s.id)), "items");
  const schema = await store.db.schema();
  for (const t of SESSION_TABLES.filter((t) => schema.tables[t])) must(await store.from(t).delete().in("session_id", ids), t);
  must(await store.from("v2_sessions").delete().in("id", ids), "sessions");
  return ids.length;
}

const COUNTED = ["v2_events", "v2_sessions", "v2_race_results", "v2_qualifying_results", "v2_practice_results", "v2_lap_times", "v2_pit_stops", "v2_flag_segments", "v2_annotation_items", "v2_drivers", "v2_teams", "v2_cars", "v2_circuits", "v2_circuit_layouts", "v2_team_season_cars"];
const counts = async () => Object.fromEntries(await Promise.all(COUNTED.map(async (t) => [t, (await store.db.rows(t)).length])));
const before = await counts();

/* lookups (kept in memory, appended as we create rows) */
const drivers = await rows("v2_drivers");
const teams = await rows("v2_teams");
const cars = await rows("v2_cars");
const circuits = await rows("v2_circuits");
const layouts = await rows("v2_circuit_layouts");
const tsc = await rows("v2_team_season_cars");
const driverByName = new Map(drivers.map((d) => [norm(d.full_name), d]));
const teamByName = new Map();
for (const t of teams) for (const n of [t.full_name, t.short_name]) if (n && !teamByName.has(norm(n))) teamByName.set(norm(n), t);

let nascarDrivers = null;
async function driverProfile(nascarId) {
  if (!nascarDrivers) {
    const d = await feed("cacher/drivers.json", { optional: true });
    nascarDrivers = new Map((d?.response || []).map((r) => [Number(r.Nascar_Driver_ID), r]));
  }
  return nascarDrivers.get(Number(nascarId)) || null;
}
/** Feed spellings of drivers who already exist under another spelling. */
const DRIVER_ALIASES = { "john h nemechek": "John Hunter Nemechek" };
async function driverId(name, nascarId, hometownCountry) {
  let full = cleanDriver(name);
  full = DRIVER_ALIASES[norm(full)] || full;
  const key = norm(full);
  let d = driverByName.get(key) || driverByName.get(key.replace(/ jr$/, "")) || driverByName.get(key + " jr");
  if (d) return d.id;
  const prof = await driverProfile(nascarId);
  const dob = prof?.DOB && !prof.DOB.startsWith("0001") ? prof.DOB.slice(0, 10) : null;
  const country = (hometownCountry || prof?.Hometown_Country || "").trim() || null;
  d = { id: uuid(), full_name: full, short_name: null, nationality: country, date_of_birth: dob };
  if (!a.preview) await insert("v2_drivers", [d]);
  drivers.push(d);
  driverByName.set(key, d);
  return d.id;
}
async function teamId(name) {
  const full = String(name || "").trim();
  if (!full) return null;
  let t = teamByName.get(norm(full));
  if (t) return t.id;
  t = { id: uuid(), full_name: full, short_name: null };
  if (!a.preview) await insert("v2_teams", [t]);
  teamByName.set(norm(full), t);
  return t.id;
}
async function carId(make, model) {
  if (!make) return null;
  const mm = String(model || "").trim();
  let c = cars.find((x) => norm(x.manufacturer) === norm(make) && norm(x.model_name) === norm(mm));
  if (c) return c.id;
  c = { id: uuid(), manufacturer: make.trim(), model_name: mm };
  if (!a.preview) await insert("v2_cars", [c]);
  cars.push(c);
  return c.id;
}
async function seriesAndSeason(year) {
  let series = (await rows("v2_series")).find((s) => norm(s.name) === norm(SERIES_NAME));
  if (!series) {
    series = { id: uuid(), name: SERIES_NAME, short_name: "NASCAR Cup" };
    if (!a.preview) {
      await insert("v2_series", [series]);
      await insert("v2_series_aliases", ["NASCAR Cup", "Cup Series", "NCS"].map((alias) => ({ series_id: series.id, alias })));
    }
  }
  let season = (await rows("v2_seasons")).find((s) => s.series_id === series.id && Number(s.year) === Number(year));
  if (!season) {
    season = { id: uuid(), series_id: series.id, year: Number(year), cdm: null, is_multiclass: false, is_spec_series: false, spec_car_id: null };
    if (!a.preview) await insert("v2_seasons", [season]);
  }
  return { series, season };
}
async function circuitAndLayout(trackId, year, feedMiles) {
  const cfg = TRACKS[trackId];
  if (!cfg) throw new Error(`unknown NASCAR track_id ${trackId}: add it to TRACKS`);
  const lay = { ...cfg, ...(cfg.byYear?.[year] || {}) };
  let c = circuits.find((x) => norm(x.name) === norm(cfg.circuit));
  if (!c) {
    c = { id: uuid(), name: cfg.circuit, location: cfg.location ?? null, country: "United States", layout_image_url: null, length_km: null, latitude: cfg.lat ?? null, longitude: cfg.lon ?? null };
    if (!a.preview) await insert("v2_circuits", [c]);
    circuits.push(c);
  }
  let l = layouts.find((x) => x.circuit_id === c.id && norm(x.name) === norm(lay.layout));
  if (!l) {
    const miles = lay.miles ?? feedMiles;
    l = {
      id: uuid(),
      circuit_id: c.id,
      name: lay.layout,
      length_km: miles ? Math.round(miles * MI * 1000) / 1000 : null,
      turns: lay.turns ?? null,
      total_straight_length_km: null,
      total_elevation_change_m: null,
      heavy_braking_corners: null,
      layout_image_url: null,
      sort_order: layouts.filter((x) => x.circuit_id === c.id).length,
    };
    if (!a.preview) await insert("v2_circuit_layouts", [l]);
    layouts.push(l);
  }
  return { circuit: c, layout: l, cfg };
}

/* ── one race (or Duel) → sessions + rows ── */
const FLAG = { 1: "GREEN", 2: "YELLOW", 3: "RED", 4: "GREEN" };
const report = [];

async function importRaceSession({ year, raceId, eventId, sessionName, sessionType, sortHint, tz, wf, pending, raceStatusSkip }) {
  const w = wf.weekend_race[0];
  const started = (w.results || []).filter((r) => r.finishing_position > 0);
  const [lapFeed, notes, pits, flags] = await Promise.all([
    feed(`cacher/${year}/1/${raceId}/lap-times.json`, { optional: true }),
    feed(`cacher/${year}/1/${raceId}/lap-notes.json`, { optional: true }),
    feed(`cacher/live/series_1/${raceId}/live-pit-data.json`, { optional: true }),
    feed(`cacher/live/series_1/${raceId}/live-flag-data.json`, { optional: true }),
  ]);
  const raceRun = (w.schedule || []).find((s) => s.run_type === 3);
  const startUtc = raceRun?.start_time_utc || easternToUtc(w.race_date);
  const lp = localParts(startUtc, tz);
  const sessionId = uuid();
  pending.sessions.push({ id: sessionId, event_id: eventId, name: sessionName, session_type: sessionType, status: "published", sort_order: 0, _sortMs: lp?.ms ?? sortHint, date: lp ? `${lp.date}T00:00:00+00:00` : null, start_time: lp?.time ?? null, parent_session_id: null, source_document_url: `${BASE}cacher/${year}/1/${raceId}/weekend-feed.json` });

  const lapsCompleted = new Map(started.map((r) => [String(r.car_number), r.laps_completed]));
  const tl = lapFeed ? buildTimeline(lapFeed, lapsCompleted, new Map(started.map((r) => [String(r.car_number), r.finishing_position]))) : null;
  const pitByCar = new Map();
  for (const p of pits || []) {
    if (!(p.lap_count > 0) || !(p.pit_in_race_time > 0)) continue;
    const k = String(p.vehicle_number);
    if (!pitByCar.has(k)) pitByCar.set(k, []);
    pitByCar.get(k).push(p);
  }
  const stage = new Map(); // car → {1: pts, 2: pts}
  for (const s of w.stage_results || []) for (const r of s.results || []) {
    const k = String(r.car_number);
    if (!stage.has(k)) stage.set(k, {});
    stage.get(k)[s.stage_number] = { pts: r.stage_points, pos: r.finishing_position };
  }
  // Some weekend feeds were never filled with points (2025 Talladega playoff race): use the
  // live points feed's per-race points for those.
  let pointsOf = (r) => r.points_earned ?? null;
  let pointsNote = null;
  if (started.length && started.every((r) => !r.points_earned)) {
    const live = await feed(`live/feeds/series_1/${raceId}/live_points.json`, { optional: true });
    if (Array.isArray(live) && live.some((v) => v.points_earned_this_race > 0)) {
      const byCar = new Map(live.map((v) => [String(v.car_number), v.points_earned_this_race]));
      pointsOf = (r) => byCar.get(String(r.car_number)) ?? 0;
      pointsNote = "live_points.json";
      log(`      ${w.race_name}: weekend feed has no points, using live_points.json`);
    }
  }
  const dmap = new Map();
  for (const r of started) {
    const did = await driverId(r.driver_fullname, r.driver_id, r.hometown_country);
    const tid = await teamId(r.team_name);
    const cid = await carId(r.car_make, r.car_model);
    dmap.set(String(r.car_number), did);
    if (tid && cid) pending.teamCars.set(tid, cid);
    const fin = /running/i.test(r.finishing_status || "") || r.finishing_status === "";
    const status = r.disqualified ? "dsq" : fin ? "finished" : "dnf";
    const gap = r.finishing_position === 1 ? null : r.diff_laps > 0 ? `${r.diff_laps} ${r.diff_laps === 1 ? "Lap" : "Laps"}` : r.diff_time > 0 ? `+${(r.diff_time / 1000).toFixed(3)}` : null;
    const st = stage.get(String(r.car_number)) || {};
    const extra = {};
    if (r.starting_position) extra["Start"] = r.starting_position;
    extra["Laps Led"] = r.laps_led ?? 0;
    if (r.times_led) extra["Times Led"] = r.times_led;
    for (const n of Object.keys(st).sort()) {
      if (st[n].pos) extra[`Stage ${n}`] = st[n].pos; // stage finishing position (top 10 are published)
      if (st[n].pts) extra[`Stage ${n} Pts`] = st[n].pts;
    }
    if (r.playoff_points_earned) extra["Playoff Pts"] = r.playoff_points_earned;
    if (r.sponsor) extra["Sponsor"] = r.sponsor;
    if (r.crew_chief_fullname) extra["Crew Chief"] = r.crew_chief_fullname;
    if (r.car_make) extra["Manufacturer"] = r.car_make;
    if (pointsNote) extra["Points Source"] = pointsNote;
    const fl = tl?.fastest.get(String(r.car_number));
    pending.race.push({
      session_id: sessionId,
      position: r.finishing_position,
      driver_id: did,
      team_id: tid,
      car_id: cid,
      car_number: String(r.car_number),
      laps_completed: r.laps_completed ?? null,
      gap_to_leader: gap,
      fastest_lap_time: fl && Number.isFinite(fl) ? fmtLap(fl) : null,
      pit_stops: pits ? (pitByCar.get(String(r.car_number)) || []).length : null,
      points: pointsOf(r),
      status,
      dnf_reason: status === "dnf" ? r.finishing_status || null : status === "dsq" ? "Disqualified" : null,
      total_time: null,
      extra_data: extra,
    });
  }
  const sum = { session: sessionName, results: started.length, laps: 0, pits: 0, flags: 0, notes: 0, cautions: (w.caution_segments || []).length };
  if (tl) {
    for (const [num, arr] of tl.elapsed) for (let k = 1; k < arr.length; k++) pending.laps.push({ session_id: sessionId, car_number: num, lap_number: k, elapsed: arr[k] });
    sum.laps = [...tl.elapsed.values()].reduce((n, arr) => n + arr.length - 1, 0);
    sum.order = `${tl.stats.violations}/${tl.stats.pairs} order conflicts, g=${tl.stats.g.toFixed(2)}, unknown laps ${tl.stats.unknownLaps}`;
    // flags: per-lap state of the leader's lap
    const per = new Map((lapFeed.flags || []).map((f) => [f.LapsCompleted, f.FlagState]));
    const segs = [];
    const greenLap = median(Array.from({ length: tl.maxN }, (_, i) => i + 1).filter((k) => per.get(k) === 1).map((k) => tl.leader[k] - tl.leader[k - 1])) || 60;
    const reds = new Set((flags || []).filter((f) => f.flag_state === 3).map((f) => f.lap_number + 1));
    for (let k = 1; k <= tl.maxN; k++) {
      const cautionLap = (w.caution_segments || []).some((c) => c.start_lap <= k && k <= c.end_lap);
      let state = per.has(k) ? FLAG[per.get(k)] || "GREEN" : cautionLap ? "YELLOW" : "GREEN";
      if (reds.has(k) && tl.leader[k] - tl.leader[k - 1] > 3 * greenLap) state = "RED";
      const s0 = tl.leader[k - 1];
      const s1 = tl.leader[k];
      const last = segs[segs.length - 1];
      if (last && last.flag_state === state) last.end_elapsed = s1;
      else segs.push({ session_id: sessionId, flag_state: state, start_elapsed: round3(s0), end_elapsed: round3(s1) });
    }
    for (const s of segs) s.end_elapsed = round3(s.end_elapsed);
    pending.flags.push(...segs);
    sum.flags = segs.filter((s) => s.flag_state !== "GREEN").length;
    // pit stops placed on the car's own timeline (pit road time from the feed)
    const offs = [];
    for (const [num, list] of pitByCar) {
      const arr = tl.elapsed.get(num);
      if (!arr) continue;
      for (const p of list) if (arr[p.lap_count] != null) offs.push(p.pit_in_race_time - arr[p.lap_count]);
    }
    const raceOff = median(offs.filter((o) => Math.abs(o) < 2 * greenLap)) ?? 0;
    for (const [num, list] of pitByCar) {
      const arr = tl.elapsed.get(num);
      if (!arr) continue;
      const own = median(list.filter((p) => arr[p.lap_count] != null).map((p) => p.pit_in_race_time - arr[p.lap_count]).filter((o) => Math.abs(o) < 2 * greenLap));
      const off = Math.max(-greenLap, Math.min(greenLap, own ?? raceOff));
      for (const p of list) {
        const base = arr[Math.min(p.lap_count, arr.length - 1)];
        if (base == null) continue;
        const inEl = Math.max(0, base + off);
        const dur = p.total_duration > 0 && p.total_duration < 3600 ? p.total_duration : null;
        pending.pits.push({
          session_id: sessionId,
          car_number: num,
          driver_id: dmap.get(num) ?? null,
          lap_number: p.lap_count,
          stop_duration: dur ? fmtLap(dur) : null,
          total_pit_time: null,
          flag_status: { 1: "Green", 2: "Yellow", 3: "Red", 4: "Green" }[p.pit_in_flag_status] ?? null,
          pit_in_elapsed: round3(inEl),
          pit_out_elapsed: dur ? round3(inEl + dur) : null,
        });
        sum.pits++;
      }
    }
    // race control: lap notes at the leader's line crossing of that lap
    const noteLaps = notes?.laps ? Object.keys(notes.laps).map(Number).sort((x, y) => x - y) : [];
    if (noteLaps.length) {
      const secId = uuid();
      pending.sections.push({ id: secId, session_id: sessionId, title: "Race Control", sort_order: 0 });
      const green = (flags || []).find((f) => f.flag_state === 1 && f.lap_number === 0 && f.time_of_day_os);
      const t0 = green ? new Date(green.time_of_day_os).getTime() : startUtc ? new Date(startUtc + (/Z$/.test(startUtc) ? "" : "Z")).getTime() : null;
      let i = 0;
      for (const k of noteLaps) {
        const el = k <= 0 ? 0 : tl.leader[Math.min(k, tl.maxN)];
        for (const n of notes.laps[String(k)]) {
          const clock = t0 ? localParts(new Date(t0 + el * 1000).toISOString(), tz) : null;
          const tod = clock ? new Date(t0 + el * 1000).toLocaleTimeString("en-GB", { timeZone: tz, hour12: false }) : "--:--:--";
          const color = n.FlagState === 2 ? "#eab308" : n.FlagState === 3 ? "#ef4444" : null;
          pending.items.push({ section_id: secId, description: `[${tod}] (+${fmtClock(el)}) Lap ${k}: ${String(n.Note).replace(/\s+/g, " ").trim()}`, color, sort_order: i++ });
        }
      }
      sum.notes = i;
    }
  }
  return sum;
}

async function importWeekend({ year, race, duels, event, tz }) {
  const wf = await feed(`cacher/${year}/1/${race.race_id}/weekend-feed.json`);
  const w = wf.weekend_race?.[0];
  if (!w || !(w.results || []).some((r) => r.finishing_position > 0)) {
    uncache(`cacher/${year}/1/${race.race_id}/weekend-feed.json`);
    return { skipped: "no results yet" };
  }
  const pending = { sessions: [], race: [], quali: [], practice: [], laps: [], pits: [], flags: [], sections: [], items: [], teamCars: new Map() };
  const sums = [];
  // practice + qualifying runs
  for (const run of wf.weekend_runs || []) {
    if (run.run_type !== 1 && run.run_type !== 2) continue;
    if (/duel/i.test(run.run_name)) continue; // the Duel lineup runs repeat the pole qualifying
    const results = (run.results || []).filter((r) => r.finishing_position > 0);
    if (!results.length) continue;
    const lp = localParts(run.run_date_utc || easternToUtc(run.run_date), tz);
    const isQ = run.run_type === 2;
    const sid = uuid();
    pending.sessions.push({ id: sid, event_id: event.id, name: isQ ? qualifyingName(run) : practiceName(run), session_type: isQ ? "qualifying" : "practice", status: "published", sort_order: 0, _sortMs: lp?.ms ?? 0, date: lp ? `${lp.date}T00:00:00+00:00` : null, start_time: lp?.time ?? null, parent_session_id: null, source_document_url: `${BASE}cacher/${year}/1/${race.race_id}/weekend-feed.json` });
    const pole = Math.min(...results.map((r) => (r.best_lap_time > 0 ? r.best_lap_time : Infinity)));
    for (const r of results) {
      const did = await driverId(r.driver_name, r.driver_id, null);
      const entry = (w.results || []).find((x) => String(x.car_number) === String(r.car_number));
      const tid = await teamId(entry?.team_name);
      const cid = await carId(entry?.car_make || r.manufacturer, entry?.car_model);
      const best = r.best_lap_time > 0 ? r.best_lap_time : null;
      const gap = best && Number.isFinite(pole) && best > pole ? `+${(best - pole).toFixed(3)}` : null;
      const extra = {};
      if (r.best_lap_speed > 0) extra["Best Speed (mph)"] = r.best_lap_speed;
      if (r.best_lap_number > 0) extra["Best Lap"] = r.best_lap_number;
      if (r.comment) extra["Comment"] = r.comment;
      const row = { session_id: sid, position: r.finishing_position, driver_id: did, team_id: tid, car_id: cid, car_number: String(r.car_number), extra_data: extra };
      if (isQ) pending.quali.push({ ...row, best_time: fmtLap(best), gap_to_pole: gap, laps_run: r.laps_completed ?? null, points: null });
      else pending.practice.push({ ...row, best_lap_time: fmtLap(best), gap_to_p1: gap, laps_run: r.laps_completed ?? null });
    }
    sums.push({ session: run.run_name, results: results.length });
  }
  for (const d of duels) {
    const dwf = await feed(`cacher/${year}/1/${d.race_id}/weekend-feed.json`);
    if (!dwf.weekend_race?.[0]?.results?.some((r) => r.finishing_position > 0)) continue;
    const m = d.race_name.match(/Duel\s*(\d)/i);
    sums.push(await importRaceSession({ year, raceId: d.race_id, eventId: event.id, sessionName: `Duel ${m ? m[1] : duels.indexOf(d) + 1}`, sessionType: "sprint_race", sortHint: 0, tz, wf: dwf, pending }));
  }
  sums.push(await importRaceSession({ year, raceId: race.race_id, eventId: event.id, sessionName: "Race", sessionType: "race", sortHint: Infinity, tz, wf, pending }));
  // order sessions chronologically (Duels share a night; keep their numbering)
  pending.sessions.sort((x, y) => (x._sortMs ?? 0) - (y._sortMs ?? 0) || x.name.localeCompare(y.name));
  pending.sessions.forEach((s, i) => {
    s.sort_order = i;
    delete s._sortMs;
  });
  const dates = pending.sessions.map((s) => s.date?.slice(0, 10)).filter(Boolean).sort();
  return { pending, sums, dates };
}

/* ── run ── */
const dataDir = path.join(ROOT, "data");
const dirSize = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? dirSize(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
const sizeBefore = dirSize(dataDir);

for (const year of a.season.map(Number)) {
  const list = await feed(`cacher/${year}/1/race_list_basic.json`);
  const points = list.filter((r) => r.race_type_id === 1);
  const duelsAll = list.filter((r) => r.race_type_id !== 1 && /duel/i.test(r.race_name));
  // weekend feeds carry the corrected race date; order rounds by it
  const dated = [];
  for (const r of points) {
    const wf = await feed(`cacher/${year}/1/${r.race_id}/weekend-feed.json`);
    const sched = wf.weekend_race?.[0]?.schedule?.find((s) => s.run_type === 3)?.start_time_utc;
    dated.push({ r, when: sched ? sched + "Z" : easternToUtc(wf.weekend_race?.[0]?.race_date || r.race_date) });
  }
  dated.sort((x, y) => String(x.when).localeCompare(String(y.when)));
  const { season } = await seriesAndSeason(year);
  const events = (await rows("v2_events")).filter((e) => e.season_id === season.id);
  for (const [i, { r }] of dated.entries()) {
    const isDaytona500 = /daytona 500/i.test(r.race_name);
    const duels = isDaytona500 ? duelsAll.filter((d) => d.track_id === r.track_id) : [];
    if (a.race && String(r.race_id) !== a.race && !duels.some((d) => String(d.race_id) === a.race)) continue;
    const feedMiles = r.scheduled_laps > 0 ? r.scheduled_distance / r.scheduled_laps : null;
    const { circuit, layout, cfg } = await circuitAndLayout(r.track_id, year, feedMiles);
    const name = `${year} ${titleRace(r.race_name)}`;
    let event = events.find((e) => e.circuit_id === circuit.id && (norm(e.name) === norm(name) || String(e.round_number) === String(i + 1)));
    const existing = event ? must(await store.from("v2_sessions").select("id").eq("event_id", event.id), "sessions") || [] : [];
    if (existing.length && !a.replace) {
      log(`skip  ${name}: already imported (use --replace)`);
      continue;
    }
    const res = await importWeekend({ year, race: r, duels, event: event || { id: "pending" }, tz: cfg.tz });
    if (res.skipped) {
      log(`skip  ${name}: ${res.skipped}`);
      continue;
    }
    if (!event) {
      event = { id: uuid(), season_id: season.id, circuit_id: circuit.id, layout_id: layout.id, name, short_name: cfg.short, round_number: String(i + 1), start_date: res.dates[0] ?? null, end_date: res.dates[res.dates.length - 1] ?? null, description: null, status: "published" };
      if (!a.preview) await insert("v2_events", [event]);
      events.push(event);
    } else if (!a.preview) {
      must(await store.from("v2_events").update({ name, short_name: cfg.short, round_number: String(i + 1), layout_id: layout.id, circuit_id: circuit.id, start_date: res.dates[0] ?? event.start_date, end_date: res.dates[res.dates.length - 1] ?? event.end_date }).eq("id", event.id), "event");
    }
    const p = res.pending;
    for (const s of p.sessions) {
      s.event_id = event.id;
      s.layout_id = layout.id; // venues such as Charlotte, Daytona, Indianapolis and COTA have several layouts
    }
    if (a.replace && existing.length && !a.preview) await deleteEventSessions(event.id);
    if (!a.preview) {
      await insert("v2_sessions", p.sessions);
      await insert("v2_race_results", p.race);
      await insert("v2_qualifying_results", p.quali);
      await insert("v2_practice_results", p.practice);
      await insert("v2_lap_times", p.laps);
      await insert("v2_pit_stops", p.pits);
      await insert("v2_flag_segments", p.flags);
      await insert("v2_annotation_sections", p.sections);
      await insert("v2_annotation_items", p.items);
      const add = [];
      for (const [tid, cid] of p.teamCars) {
        if (tsc.some((x) => x.team_id === tid && x.season_id === season.id)) continue;
        const row = { team_id: tid, season_id: season.id, car_id: cid };
        tsc.push(row);
        add.push(row);
      }
      await insert("v2_team_season_cars", add);
    }
    const race = res.sums[res.sums.length - 1];
    log(`ok    R${String(i + 1).padStart(2)} ${name} — ${p.sessions.length} sessions, ${race.results} cars, ${p.laps.length} laps, ${p.pits.length} pits, ${p.flags.filter((f) => f.flag_state !== "GREEN").length} caution/red periods (feed: ${race.cautions}), ${p.items.length} notes${race.order ? ` [${race.order}]` : ""}`);
    report.push({ year, round: i + 1, race_id: r.race_id, name, sessions: p.sessions.length, cars: race.results, laps: p.laps.length, pits: p.pits.length });
  }
}

const after = await counts();
console.error("\nrows (before -> after):");
for (const t of Object.keys(after)) if (after[t] !== before[t]) console.error(`  ${t.padEnd(24)} ${before[t] ?? 0} -> ${after[t]} (+${after[t] - (before[t] ?? 0)})`);
console.error(`requests: ${requests}, cache hits: ${cacheHits}`);
if (a.preview) console.error("preview: nothing written");
else {
  await store.flush();
  const growth = dirSize(dataDir) - sizeBefore;
  console.error(`saved ${report.length} race weekends. data/ ${growth >= 0 ? "+" : ""}${(growth / 1048576).toFixed(2)} MB`);
  console.error("next: node --experimental-strip-types scripts/recompute-fingerprints.mjs");
}
