#!/usr/bin/env node
/**
 * Import the FIA Formula One World Championship (Grands Prix and Sprints) into
 * the repo data store from two open APIs:
 *
 *   - Jolpica (Ergast-compatible) https://api.jolpi.ca/ergast/f1/ — calendar,
 *     race / sprint / qualifying classifications, points, drivers, constructors
 *     and the official championship standings (used to verify the import).
 *   - OpenF1 https://api.openf1.org/v1/ — session times, practice and sprint
 *     qualifying classifications, lap-by-lap timing (→ v2_lap_times elapsed),
 *     tyre stints, pit lane passages, race control messages (→ annotations and
 *     flag segments) and weather.
 *
 *   node --experimental-strip-types scripts/import-f1.mjs --year 2025 \
 *     [--round 7] [--replace] [--cache <dir>] [--dry-run] [--verify-only]
 *
 *   --year       season to import (one per run)
 *   --round      only this round (default: every round whose race has results)
 *   --replace    re-import events that already have sessions (deletes the
 *                event's sessions and every row hanging off them first);
 *                without it, events that already have sessions are skipped
 *   --cache      directory for cached API responses (default
 *                $F1_CACHE or .cache/f1 in the repo root, git-ignored)
 *   --dry-run    fetch and build everything, write nothing
 *   --verify-only  only compare stored points with the official standings
 *
 * Every API response is cached on disk, so re-runs make no requests. Requests
 * are spaced out (Jolpica ≥ 0.4 s, OpenF1 ≥ 1.1 s apart, retry on 429).
 * Afterwards run scripts/recompute-fingerprints.mjs and review git diff.
 * Liveries and track maps: scripts/f1-media.mjs.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ROOT, openStore } from "./lib/local-store.mjs";

const { values: a } = parseArgs({
  options: {
    year: { type: "string" },
    round: { type: "string" },
    replace: { type: "boolean", default: false },
    cache: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "verify-only": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});
if (a.help || !a.year) {
  console.error("usage: scripts/import-f1.mjs --year <yyyy> [--round N] [--replace] [--cache <dir>] [--dry-run] [--verify-only]");
  process.exit(a.help ? 0 : 2);
}
const YEAR = Number(a.year);
const CACHE = a.cache || process.env.F1_CACHE || path.join(ROOT, ".cache/f1");
fs.mkdirSync(CACHE, { recursive: true });

export const SERIES_NAME = "Formula 1";
const LEGACY_SERIES_NAMES = ["FIA Formula One World Championship"];
export const SERIES_SHORT = "F1";
const SERIES_ALIASES = ["F1", "Formula One", "FIA Formula One World Championship"];
const JOLPICA = "https://api.jolpi.ca/ergast/f1";
const OPENF1 = "https://api.openf1.org/v1";

/* ── polite, cached fetch ─────────────────────────────────────────────── */
const lastCall = new Map();
let requests = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  const file = path.join(CACHE, crypto.createHash("sha1").update(url).digest("hex") + ".json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const host = new URL(url).host;
  const gap = host.includes("openf1") ? 1100 : 400;
  for (let attempt = 0; ; attempt++) {
    const wait = (lastCall.get(host) || 0) + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall.set(host, Date.now());
    requests++;
    const res = await fetch(url, { headers: { "User-Agent": "TrackRecords-importer (static results archive)" } });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 6) throw new Error(`${res.status} ${url}`);
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (res.status === 404) {
      fs.writeFileSync(file, "[]");
      return [];
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const text = await res.text();
    const json = JSON.parse(text);
    // OpenF1 answers {"detail": "No results found."} for empty sets
    const out = json && !Array.isArray(json) && json.detail && host.includes("openf1") ? [] : json;
    fs.writeFileSync(file, JSON.stringify(out));
    return out;
  }
}

/** All pages of a Jolpica list endpoint, races merged by round. */
async function jolpicaRaces(pathPart, key) {
  const races = new Map();
  for (let offset = 0; ; offset += 100) {
    const d = await getJson(`${JOLPICA}/${pathPart}/?limit=100&offset=${offset}`);
    const list = d.MRData.RaceTable.Races;
    for (const r of list) {
      if (!races.has(r.round)) races.set(r.round, { ...r, [key]: [] });
      races.get(r.round)[key].push(...(r[key] || []));
    }
    if (offset + 100 >= Number(d.MRData.total)) break;
  }
  return races;
}

/* ── small helpers ────────────────────────────────────────────────────── */
export const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`.\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const same = (x, y) => norm(x) === norm(y);
const ts = (iso) => Date.parse(iso) / 1000;
const round3 = (x) => Math.round(x * 1000) / 1000;

/** 83.456 → "1:23.456"; 5504.742 → "1:31:44.742" */
export function fmtTime(sec) {
  if (sec == null || !Number.isFinite(sec)) return null;
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
/** "1:23.456" → 83.456 */
export function parseTime(t) {
  if (!t) return null;
  const parts = String(t).split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}
/** "+H:MM:SS.sss" offset used by race-control annotations */
export function fmtOffset(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return `+${h}:${String(m).padStart(2, "0")}:${s}`;
}
/** OpenF1 gmt_offset "03:00:00" / "-05:00:00" → seconds */
const offsetSeconds = (o) => {
  const m = String(o || "0:0:0").match(/^(-)?(\d+):(\d+)(?::(\d+))?$/);
  if (!m) return 0;
  return (m[1] ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] || 0));
};
const localParts = (iso, gmt) => {
  const d = new Date(Date.parse(iso) + offsetSeconds(gmt) * 1000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16), clock: d.slice(11, 19) };
};

const DEMONYM = {
  American: "United States", Argentine: "Argentina", Argentinian: "Argentina", Australian: "Australia", Austrian: "Austria",
  Belgian: "Belgium", Brazilian: "Brazil", British: "United Kingdom", Canadian: "Canada", Chinese: "China", Colombian: "Colombia",
  Danish: "Denmark", Dutch: "Netherlands", Estonian: "Estonia", Finnish: "Finland", French: "France", German: "Germany",
  Indian: "India", Irish: "Ireland", Israeli: "Israel", Italian: "Italy", Japanese: "Japan", Mexican: "Mexico", Monegasque: "Monaco",
  "New Zealander": "New Zealand", Polish: "Poland", Russian: "Russia", Spanish: "Spain", Swedish: "Sweden", Swiss: "Switzerland",
  Thai: "Thailand", Venezuelan: "Venezuela", Bosnian: "Bosnia and Herzegovina",
};
const IOC = {
  ARG: "Argentina", AUS: "Australia", AUT: "Austria", BEL: "Belgium", BRA: "Brazil", CAN: "Canada", CHN: "China", COL: "Colombia",
  DEN: "Denmark", ESP: "Spain", EST: "Estonia", FIN: "Finland", FRA: "France", GBR: "United Kingdom", GER: "Germany", IND: "India",
  IRL: "Ireland", ISR: "Israel", ITA: "Italy", JPN: "Japan", MEX: "Mexico", MON: "Monaco", NED: "Netherlands", NZL: "New Zealand",
  POL: "Poland", SUI: "Switzerland", SWE: "Sweden", THA: "Thailand", USA: "United States", VEN: "Venezuela",
};

/* Constructors: one v2_teams row each; chassis per season. */
export const CONSTRUCTORS = {
  red_bull: { full: "Red Bull Racing", short: "Red Bull", re: /red bull racing|^red bull$/i },
  ferrari: { full: "Scuderia Ferrari", short: "Ferrari", re: /ferrari/i },
  mclaren: { full: "McLaren F1 Team", short: "McLaren", re: /mclaren/i },
  mercedes: { full: "Mercedes-AMG Petronas F1 Team", short: "Mercedes", re: /mercedes/i },
  aston_martin: { full: "Aston Martin F1 Team", short: "Aston Martin", re: /aston martin/i },
  alpine: { full: "Alpine F1 Team", short: "Alpine", re: /alpine/i },
  williams: { full: "Williams Racing", short: "Williams", re: /williams/i },
  rb: { full: "Racing Bulls", short: "Racing Bulls", re: /racing bulls|^rb$|visa cash app|^rb f1/i },
  sauber: { full: "Sauber F1 Team", short: "Sauber", re: /sauber/i },
  haas: { full: "Haas F1 Team", short: "Haas", re: /haas/i },
  audi: { full: "Audi F1 Team", short: "Audi", re: /audi/i },
  cadillac: { full: "Cadillac F1 Team", short: "Cadillac", re: /cadillac/i },
};
/** Entrant names that differ from the team row's name in a season. */
const SEASON_TEAM_NAMES = { 2024: { rb: "Visa Cash App RB", sauber: "Stake F1 Team Kick Sauber" }, 2025: { sauber: "Stake F1 Team Kick Sauber" } };
export const CHASSIS = {
  2024: { red_bull: "RB20", ferrari: "SF-24", mclaren: "MCL38", mercedes: "F1 W15", aston_martin: "AMR24", alpine: "A524", williams: "FW46", rb: "VCARB 01", sauber: "C44", haas: "VF-24" },
  2025: { red_bull: "RB21", ferrari: "SF-25", mclaren: "MCL39", mercedes: "F1 W16", aston_martin: "AMR25", alpine: "A525", williams: "FW47", rb: "VCARB 02", sauber: "C45", haas: "VF-25" },
  2026: { red_bull: "RB22", ferrari: "SF-26", mclaren: "MCL40", mercedes: "F1 W17", aston_martin: "AMR26", alpine: "A526", williams: "FW48", rb: "VCARB 03", audi: "R26", haas: "VF-26", cadillac: "MAC-26" },
};
const CHASSIS_MAKER = { red_bull: "Red Bull", rb: "Racing Bulls", sauber: "Sauber", mercedes: "Mercedes", aston_martin: "Aston Martin" };

/* Jolpica circuitId → existing v2_circuits name (+ the layout used by F1 today). */
export const CIRCUITS = {
  albert_park: { name: "Albert Park Grand Prix Circuit", layout: "Street Circuit" },
  shanghai: { name: "Shanghai International Circuit" },
  suzuka: { name: "Suzuka International Racing Course" },
  bahrain: { name: "Bahrain International Circuit" },
  jeddah: { name: "Jeddah Corniche Circuit" },
  miami: { name: "Miami International Autodrome" },
  imola: { name: "Autodromo Enzo e Dino Ferrari" },
  monaco: { name: "Circuit de Monaco" },
  catalunya: { name: "Circuit de Barcelona-Catalunya", layout: "Grand Prix" },
  villeneuve: { name: "Circuit Gilles Villeneuve" },
  red_bull_ring: { name: "Red Bull Ring" },
  silverstone: { name: "Silverstone Circuit" },
  hungaroring: { name: "Hungaroring" },
  spa: { name: "Circuit de Spa-Francorchamps" },
  zandvoort: { name: "Circuit Zandvoort" },
  monza: { name: "Autodromo Nazionale Monza" },
  baku: { name: "Baku City Circuit" },
  marina_bay: { name: "Marina Bay Street Circuit", layout: "Street Circuit" },
  americas: { name: "Circuit of the Americas (COTA)" },
  rodriguez: { name: "Autódromo Hermanos Rodríguez" },
  interlagos: { name: "Autódromo José Carlos Pace (Interlagos)" },
  vegas: { name: "Las Vegas Street Circuit" },
  losail: { name: "Lusail International Circuit" },
  yas_marina: { name: "Yas Marina Circuit", layout: "Grand Prix" },
  madring: {
    name: "Madring", location: "Madrid", country: "Spain",
    newLayout: { name: "Grand Prix", length_km: 5.416, turns: 22 },
  },
  sepang: {
    name: "Sepang International Circuit", location: "Sepang", country: "Malaysia",
    newLayout: { name: "Grand Prix", length_km: 5.543, turns: 15 },
  },
};

/* ── store ────────────────────────────────────────────────────────────── */
const store = openStore({ writable: true });
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};
const all = async (t) => must(await store.from(t).select("*"), t) || [];
const insertOne = async (t, row) => must(await store.from(t).insert(row).select("*").single(), t);
const insertMany = async (t, rows) => {
  if (rows.length) must(await store.from(t).insert(rows), t);
};
const SESSION_TABLES = ["v2_race_results", "v2_qualifying_results", "v2_practice_results", "v2_lap_times", "v2_stints", "v2_pit_stops", "v2_flag_segments", "v2_session_weather", "v2_session_summaries"];
async function deleteEventSessions(eventId) {
  const ids = (must(await store.from("v2_sessions").select("id").eq("event_id", eventId), "sessions") || []).map((s) => s.id);
  if (!ids.length) return 0;
  const sections = must(await store.from("v2_annotation_sections").select("id").in("session_id", ids), "sections") || [];
  if (sections.length) must(await store.from("v2_annotation_items").delete().in("section_id", sections.map((s) => s.id)), "items");
  for (const t of [...SESSION_TABLES, "v2_annotation_sections"]) must(await store.from(t).delete().in("session_id", ids), t);
  must(await store.from("v2_sessions").delete().in("id", ids), "sessions");
  return ids.length;
}

/* ── series / season ─────────────────────────────────────────────────── */
async function ensureSeries() {
  const seriesRows = await all("v2_series");
  let series = seriesRows.find((s) => same(s.name, SERIES_NAME));
  const legacy = !series && seriesRows.find((s) => LEGACY_SERIES_NAMES.some((n) => same(s.name, n)));
  if (legacy) {
    must(await store.from("v2_series").update({ name: SERIES_NAME, short_name: SERIES_SHORT }).eq("id", legacy.id), "series");
    series = { ...legacy, name: SERIES_NAME };
  }
  if (!series) series = await insertOne("v2_series", { name: SERIES_NAME, short_name: SERIES_SHORT });
  const aliases = (await all("v2_series_aliases")).filter((x) => x.series_id === series.id);
  for (const alias of SERIES_ALIASES) if (!aliases.some((x) => same(x.alias, alias))) await insertOne("v2_series_aliases", { series_id: series.id, alias });
  let season = (await all("v2_seasons")).find((s) => s.series_id === series.id && Number(s.year) === YEAR);
  if (!season) season = await insertOne("v2_seasons", { series_id: series.id, year: YEAR, cdm: null, is_multiclass: false, is_spec_series: false, spec_car_id: null });
  return { series, season };
}

/* ── teams and cars ──────────────────────────────────────────────────── */
async function ensureTeams(season, constructorIds) {
  const teams = await all("v2_teams");
  const cars = await all("v2_cars");
  const tsc = await all("v2_team_season_cars");
  const tsn = await all("v2_team_season_names");
  const out = new Map();
  for (const cid of constructorIds) {
    const def = CONSTRUCTORS[cid];
    if (!def) throw new Error(`unknown constructor ${cid}: add it to CONSTRUCTORS`);
    let team = teams.find((t) => same(t.full_name, def.full));
    if (!team) {
      team = await insertOne("v2_teams", { full_name: def.full, short_name: def.short, nationality: null });
      teams.push(team);
    }
    const model = CHASSIS[YEAR]?.[cid];
    if (!model) throw new Error(`no chassis for ${cid} ${YEAR}`);
    const maker = CHASSIS_MAKER[cid] || def.short;
    let car = cars.find((c) => same(c.model_name, model) && same(c.manufacturer, maker));
    if (!car) {
      car = await insertOne("v2_cars", { model_name: model, manufacturer: maker });
      cars.push(car);
    }
    if (!tsc.some((x) => x.team_id === team.id && x.season_id === season.id)) {
      const row = await insertOne("v2_team_season_cars", { team_id: team.id, car_id: car.id, season_id: season.id });
      tsc.push(row);
    }
    const display = SEASON_TEAM_NAMES[YEAR]?.[cid];
    if (display && !tsn.some((x) => x.team_id === team.id && x.season_id === season.id)) {
      tsn.push(await insertOne("v2_team_season_names", { team_id: team.id, season_id: season.id, display_name: display }));
    }
    out.set(cid, { teamId: team.id, carId: car.id });
  }
  return out;
}
const constructorFromName = (name) => Object.entries(CONSTRUCTORS).find(([, d]) => d.re.test(String(name || "").trim()))?.[0] || null;

/* ── drivers ─────────────────────────────────────────────────────────── */
let driverRows = null;
const driverCache = new Map(); // key → v2_drivers.id
async function resolveDriver({ key, fullName, dob, nationality }) {
  if (driverCache.has(key)) return driverCache.get(key);
  driverRows ??= await all("v2_drivers");
  const n = norm(fullName);
  let found = driverRows.filter((d) => norm(d.full_name) === n);
  if (found.length > 1 && dob) found = found.filter((d) => !d.date_of_birth || d.date_of_birth === dob);
  if (!found.length && dob) {
    // same birthday + same family name (e.g. "Pato" vs "Patricio")
    const last = n.split(" ").pop();
    found = driverRows.filter((d) => d.date_of_birth === dob && norm(d.full_name).split(" ").pop() === last);
  }
  let row = found[0];
  if (row) {
    const patch = {};
    if (!row.date_of_birth && dob) patch.date_of_birth = dob;
    if (!row.nationality && nationality) patch.nationality = nationality;
    if (Object.keys(patch).length) {
      must(await store.from("v2_drivers").update(patch).eq("id", row.id), "drivers");
      Object.assign(row, patch);
    }
  } else {
    row = await insertOne("v2_drivers", { full_name: fullName, short_name: null, nationality: nationality || null, date_of_birth: dob || null });
    driverRows.push(row);
    stats.drivers_created++;
  }
  driverCache.set(key, row.id);
  return row.id;
}
const jolpicaDriverInfo = (d) => ({
  key: `j:${d.driverId}`,
  fullName: `${d.givenName} ${d.familyName}`.trim(),
  dob: d.dateOfBirth || null,
  nationality: DEMONYM[d.nationality] || null,
});

/* ── race control colours (mirrors the IMSA importer's rcItemColor) ── */
function rcColor(m) {
  const msg = String(m.message || "").toUpperCase();
  const flag = String(m.flag || "").toUpperCase();
  if (flag === "RED" || msg.includes("RED FLAG")) return "#ef4444";
  if (m.category === "SafetyCar" || msg.includes("SAFETY CAR")) return "#f97316";
  if (flag.includes("CHEQUERED")) return "#a1a1aa";
  if (flag === "GREEN" || flag === "CLEAR" || msg.includes("GREEN LIGHT")) return "#22c55e";
  if (flag.includes("YELLOW")) return "#eab308";
  if (msg.includes("PENALTY") || msg.includes("DRIVE THROUGH") || msg.includes("STOP AND GO") || msg.includes("STOP/GO")) return "#a855f7";
  if (/SPUN|CONTACT|OFF TRACK|STOPPED|INCIDENT|ACCIDENT|DEBRIS|COLLISION|CRASH/.test(msg)) return "#f59e0b";
  return "#3b82f6";
}

/**
 * Flag segments from race-control messages: GREEN from the start; SC from
 * "SAFETY CAR DEPLOYED" until the track goes green after "SAFETY CAR IN THIS
 * LAP"; VSC from "VIRTUAL SAFETY CAR DEPLOYED" until "... ENDING" (+10 s, or the
 * following TRACK CLEAR); RED from a track red flag until the session restarts;
 * YELLOW for full-track yellows (sector yellows are local and ignored);
 * CHEQUERED from the chequered flag until the last car has finished.
 */
export function buildFlagSegments(messages, t0, end) {
  const segs = [];
  let state = "GREEN";
  let since = 0;
  let scIn = false;
  let vscEnding = null;
  const go = (next, at) => {
    if (next === state) return;
    at = Math.max(since, Math.min(at, end));
    if (at > since) segs.push({ flag_state: state, start_elapsed: round3(since), end_elapsed: round3(at) });
    state = next;
    since = at;
    if (next !== "SC") scIn = false;
    vscEnding = null;
  };
  for (const m of messages) {
    const t = ts(m.date) - t0;
    if (t < 0) continue;
    if (t > end) break;
    const msg = String(m.message || "").toUpperCase();
    const flag = String(m.flag || "").toUpperCase();
    if (vscEnding != null && t - vscEnding > 20) go("GREEN", vscEnding + 10);
    if (m.category === "SafetyCar") {
      if (msg.includes("VIRTUAL SAFETY CAR DEPLOYED")) go("VSC", t);
      else if (msg.includes("VIRTUAL SAFETY CAR ENDING")) vscEnding = t;
      else if (msg.includes("SAFETY CAR DEPLOYED")) go("SC", t);
      else if (msg.includes("SAFETY CAR IN THIS LAP")) scIn = true;
      continue;
    }
    if (m.category === "SessionStatus" && /SESSION STARTED|SESSION RESUMED/.test(msg) && state === "RED") {
      go("GREEN", t);
      continue;
    }
    if (m.category === "Flag" && m.scope === "Track") {
      if (flag === "RED") go("RED", t);
      else if (flag === "CHEQUERED") {
        if (vscEnding != null) go("GREEN", Math.min(vscEnding + 10, t));
        go("CHEQUERED", t);
        break;
      }
      else if ((flag === "GREEN" || flag === "CLEAR") && state !== "RED") {
        if (state === "SC" && !scIn) continue;
        go("GREEN", t);
      } else if ((flag === "YELLOW" || flag === "DOUBLE YELLOW") && state === "GREEN") go("YELLOW", t);
    }
  }
  if (vscEnding != null) go("GREEN", vscEnding + 10);
  if (end > since) segs.push({ flag_state: state, start_elapsed: round3(since), end_elapsed: round3(end) });
  return segs;
}

/** Elapsed (s from t0) at the end of each lap, per driver number, from OpenF1 laps. */
export function lapEndTimes(laps) {
  const byCar = new Map();
  for (const l of laps) {
    if (!byCar.has(l.driver_number)) byCar.set(l.driver_number, new Map());
    byCar.get(l.driver_number).set(l.lap_number, l);
  }
  const out = new Map();
  for (const [num, m] of byCar) {
    const ends = new Map();
    const max = Math.max(...m.keys());
    for (let n = 1; n <= max; n++) {
      const l = m.get(n);
      const next = m.get(n + 1);
      let end = null;
      if (l?.date_start && l.lap_duration != null) end = ts(l.date_start) + l.lap_duration;
      else if (next?.date_start) end = ts(next.date_start);
      if (end != null) ends.set(n, end);
    }
    out.set(num, ends);
  }
  return out;
}

/* ── weather summary ─────────────────────────────────────────────────── */
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
function weatherRow(sessionId, samples) {
  if (!samples.length) return null;
  const nums = (k) => samples.map((s) => s[k]).filter((x) => typeof x === "number");
  const min = (k) => (nums(k).length ? Math.min(...nums(k)) : null);
  const max = (k) => (nums(k).length ? Math.max(...nums(k)) : null);
  const wet = samples.filter((s) => s.rainfall && Number(s.rainfall) > 0).length;
  const share = wet / samples.length;
  const windKmh = nums("wind_speed").map((w) => w * 3.6);
  const dirs = nums("wind_direction");
  let dir = null;
  if (dirs.length) {
    const x = dirs.reduce((s, d) => s + Math.cos((d * Math.PI) / 180), 0);
    const y = dirs.reduce((s, d) => s + Math.sin((d * Math.PI) / 180), 0);
    const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    dir = COMPASS[Math.round(deg / 22.5) % 16];
  }
  const wMax = windKmh.length ? Math.max(...windKmh) : null;
  return {
    session_id: sessionId,
    condition_summary: share === 0 ? "Dry" : share > 0.5 ? "Wet" : "Mixed (rain during the session)",
    condition_emoji: share === 0 ? "☀️" : share > 0.5 ? "🌧️" : "🌦️",
    air_temp_min: min("air_temperature"),
    air_temp_max: max("air_temperature"),
    track_temp_min: min("track_temperature"),
    track_temp_max: max("track_temperature"),
    rain_mm: null,
    rain_detail: wet ? `Rainfall reported in ${Math.round(share * 100)}% of weather samples` : null,
    wind_summary: wMax == null ? null : wMax < 12 ? "Light winds" : wMax < 25 ? "Moderate winds" : "Strong winds",
    wind_speed_min: windKmh.length ? Math.round(Math.min(...windKmh)) : null,
    wind_speed_max: wMax == null ? null : Math.round(wMax),
    wind_direction: dir,
    hourly_data: null,
    fetched_at: new Date().toISOString(),
  };
}

/* ── main ─────────────────────────────────────────────────────────────── */
const stats = { events_created: 0, events_skipped: 0, sessions: 0, drivers_created: 0, rows: {} };
const bump = (t, n) => (stats.rows[t] = (stats.rows[t] || 0) + n);
const log = (...m) => console.error(...m);

const calendar = (await getJson(`${JOLPICA}/${YEAR}/races/?limit=100`)).MRData.RaceTable.Races;
const raceResults = await jolpicaRaces(`${YEAR}/results`, "Results");
const sprintResults = await jolpicaRaces(`${YEAR}/sprint`, "SprintResults");
const qualiResults = await jolpicaRaces(`${YEAR}/qualifying`, "QualifyingResults");
const driverPool = [];
for (const y of [YEAR, 2024, 2025, 2026]) driverPool.push(...(await getJson(`${JOLPICA}/${y}/drivers/?limit=100`)).MRData.DriverTable.Drivers);
const GIVEN_ALIASES = { pato: "patricio", kimi: "andrea kimi" };
const of1Sessions = await getJson(`${OPENF1}/sessions?year=${YEAR}`);
const of1Meetings = await getJson(`${OPENF1}/meetings?year=${YEAR}`);

const { series, season } = await ensureSeries();
log(`series ${series.id}  season ${YEAR} ${season.id}`);

/* verification: stored points vs the official standings */
async function verify() {
  const dS = (await getJson(`${JOLPICA}/${YEAR}/driverstandings/?limit=100`)).MRData.StandingsTable.StandingsLists[0];
  const cS = (await getJson(`${JOLPICA}/${YEAR}/constructorstandings/?limit=100`)).MRData.StandingsTable.StandingsLists[0];
  const events = (await all("v2_events")).filter((e) => e.season_id === season.id);
  const sessions = (await all("v2_sessions")).filter((s) => events.some((e) => e.id === s.event_id) && (s.session_type === "race" || s.session_type === "sprint_race"));
  const ids = new Set(sessions.map((s) => s.id));
  const rows = (await all("v2_race_results")).filter((r) => ids.has(r.session_id));
  const drivers = new Map((await all("v2_drivers")).map((d) => [d.id, d.full_name]));
  const teams = new Map((await all("v2_teams")).map((t) => [t.id, t.full_name]));
  const byDriver = new Map();
  const byTeam = new Map();
  for (const r of rows) {
    byDriver.set(r.driver_id, (byDriver.get(r.driver_id) || 0) + (r.points || 0));
    byTeam.set(r.team_id, (byTeam.get(r.team_id) || 0) + (r.points || 0));
  }
  const problems = [];
  const lines = [];
  if (dS) {
    lines.push(`official driver standings after round ${dS.round}:`);
    for (const s of dS.DriverStandings) {
      const name = `${s.Driver.givenName} ${s.Driver.familyName}`;
      const id = [...drivers].find(([, n]) => norm(n) === norm(name))?.[0];
      const mine = id ? byDriver.get(id) || 0 : null;
      const ok = mine === Number(s.points);
      if (!ok) problems.push(`driver ${name}: official ${s.points}, stored ${mine}`);
      if (Number(s.position) <= 10 || !ok) lines.push(`  P${s.position} ${name.padEnd(24)} ${String(s.points).padStart(4)}  stored ${mine}${ok ? "" : "  ✗"}`);
    }
  }
  if (cS) {
    lines.push(`official constructor standings after round ${cS.round}:`);
    for (const s of cS.ConstructorStandings) {
      const def = CONSTRUCTORS[s.Constructor.constructorId];
      const id = [...teams].find(([, n]) => def && same(n, def.full))?.[0];
      const mine = id ? byTeam.get(id) || 0 : null;
      const ok = mine === Number(s.points);
      if (!ok) problems.push(`constructor ${s.Constructor.name}: official ${s.points}, stored ${mine}`);
      lines.push(`  P${s.position} ${s.Constructor.name.padEnd(24)} ${String(s.points).padStart(4)}  stored ${mine}${ok ? "" : "  ✗"}`);
    }
  }
  console.log(lines.join("\n"));
  console.log(problems.length ? `VERIFY: ${problems.length} mismatch(es)\n  ${problems.join("\n  ")}` : "VERIFY: all official standings match");
  return problems.length === 0;
}
if (a["verify-only"]) {
  await verify();
  process.exit(0);
}

const constructorIds = new Set();
for (const m of [raceResults, sprintResults, qualiResults]) for (const r of m.values()) for (const x of r.Results || r.SprintResults || r.QualifyingResults || []) constructorIds.add(x.Constructor.constructorId);
const teamMap = await ensureTeams(season, [...constructorIds].sort());

const circuits = await all("v2_circuits");
const layouts = await all("v2_circuit_layouts");
async function circuitFor(race) {
  const def = CIRCUITS[race.Circuit.circuitId];
  if (!def) throw new Error(`unknown circuit ${race.Circuit.circuitId}: add it to CIRCUITS`);
  let c = circuits.find((x) => same(x.name, def.name));
  if (!c) {
    const loc = race.Circuit.Location;
    c = await insertOne("v2_circuits", {
      name: def.name, location: def.location || loc.locality, country: def.country || loc.country,
      layout_image_url: null, length_km: null, latitude: Number(loc.lat), longitude: Number(loc.long),
    });
    circuits.push(c);
    log(`  created circuit ${def.name}`);
  }
  const mine = layouts.filter((l) => l.circuit_id === c.id);
  let layout = def.layout ? mine.find((l) => same(l.name, def.layout)) : mine.length === 1 ? mine[0] : null;
  if (!layout && def.newLayout) {
    layout = await insertOne("v2_circuit_layouts", {
      circuit_id: c.id, ...def.newLayout, total_straight_length_km: null, total_elevation_change_m: null,
      heavy_braking_corners: null, layout_image_url: null, sort_order: 1,
    });
    layouts.push(layout);
    log(`  created layout ${def.name} / ${layout.name}`);
  }
  if (!layout) throw new Error(`no layout for ${def.name}`);
  return { circuit: c, layout };
}

const existingEvents = (await all("v2_events")).filter((e) => e.season_id === season.id);
const eventSessions = await all("v2_sessions");
const SESSION_DEFS = {
  "Practice 1": { type: "practice", source: "of1" },
  "Practice 2": { type: "practice", source: "of1" },
  "Practice 3": { type: "practice", source: "of1" },
  "Sprint Qualifying": { type: "qualifying", source: "of1q" },
  "Sprint Shootout": { type: "qualifying", source: "of1q", rename: "Sprint Qualifying" },
  Sprint: { type: "sprint_race", source: "sprint" },
  Qualifying: { type: "qualifying", source: "quali" },
  Race: { type: "race", source: "race" },
};

for (const race of calendar) {
  if (a.round && race.round !== a.round) continue;
  const results = raceResults.get(race.round)?.Results || [];
  if (!results.length) {
    log(`R${race.round} ${race.raceName}: no race results yet, skipped`);
    continue;
  }
  const meeting = of1Meetings.find((m) => {
    const ss = of1Sessions.filter((s) => s.meeting_key === m.meeting_key && s.session_name === "Race" && !s.is_cancelled);
    return ss.some((s) => s.date_start.slice(0, 10) === race.date || Math.abs(ts(s.date_start) - ts(`${race.date}T${race.time || "12:00:00Z"}`)) < 36 * 3600);
  });
  if (!meeting) throw new Error(`no OpenF1 meeting for ${YEAR} R${race.round}`);
  const sessions = of1Sessions
    .filter((s) => s.meeting_key === meeting.meeting_key && !s.is_cancelled && SESSION_DEFS[s.session_name])
    .sort((x, y) => x.date_start.localeCompare(y.date_start));
  const gmt = sessions[0]?.gmt_offset;
  const name = `${YEAR} ${race.raceName}`;
  const { circuit, layout } = await circuitFor(race);
  const startDate = sessions.length ? localParts(sessions[0].date_start, gmt).date : race.date;
  const endDate = localParts(sessions.find((s) => s.session_name === "Race")?.date_start || `${race.date}T12:00:00Z`, gmt).date;

  let event = existingEvents.find((e) => same(e.name, name) || String(e.round_number) === race.round);
  if (event) {
    const has = eventSessions.some((s) => s.event_id === event.id);
    if (has && !a.replace) {
      log(`R${race.round} ${name}: already imported (use --replace), skipped`);
      stats.events_skipped++;
      continue;
    }
    if (has && !a["dry-run"]) log(`R${race.round} ${name}: replace deleted ${await deleteEventSessions(event.id)} session(s)`);
    must(await store.from("v2_events").update({ name, circuit_id: circuit.id, layout_id: layout.id, start_date: startDate, end_date: endDate, round_number: race.round }).eq("id", event.id), "events");
  } else {
    event = await insertOne("v2_events", {
      season_id: season.id, circuit_id: circuit.id, layout_id: layout.id, name,
      short_name: race.raceName.replace(/Grand Prix/, "GP"), round_number: race.round,
      start_date: startDate, end_date: endDate, description: null, status: "published",
    });
    stats.events_created++;
  }
  log(`R${race.round} ${name} (${circuit.name}, meeting ${meeting.meeting_key})`);

  /* who drove which number this weekend (Jolpica first, OpenF1 for practice-only drivers) */
  const numberInfo = new Map(); // number → { driver, constructorId }
  for (const list of [qualiResults.get(race.round)?.QualifyingResults, sprintResults.get(race.round)?.SprintResults, results])
    for (const r of list || []) numberInfo.set(String(r.number), { driver: jolpicaDriverInfo(r.Driver), constructorId: r.Constructor.constructorId });
  const of1Drivers = await getJson(`${OPENF1}/drivers?meeting_key=${meeting.meeting_key}`);
  const entrant = async (sessionKey, number) => {
    const num = String(number);
    let info = numberInfo.get(num);
    const od = of1Drivers.find((d) => d.session_key === sessionKey && String(d.driver_number) === num) || of1Drivers.find((d) => String(d.driver_number) === num);
    if (!info) {
      if (!od) return null;
      // practice-only driver: match Jolpica's driver lists (2024–2026) by family + given name
      const last = norm(od.last_name);
      const first = norm(GIVEN_ALIASES[norm(od.first_name)] || od.first_name);
      const jd = driverPool.find((d) => norm(d.familyName) === last && norm(d.givenName).split(" ").includes(first)) ||
        driverPool.find((d) => norm(d.familyName) === last && norm(d.givenName)[0] === first[0]);
      const driver = jd
        ? { ...jolpicaDriverInfo(jd), nationality: DEMONYM[jd.nationality] || IOC[od.country_code] || null }
        : { key: `o:${first} ${last}`, fullName: `${od.first_name} ${od.last_name}`.trim(), dob: null, nationality: IOC[od.country_code] || null };
      const constructorId = constructorFromName(od.team_name);
      if (!constructorId) throw new Error(`unknown OpenF1 team "${od.team_name}"`);
      info = { driver, constructorId };
      numberInfo.set(num, info);
    }
    if (!info.driver.nationality && od) info.driver.nationality = IOC[od.country_code] || null;
    if (!teamMap.has(info.constructorId)) {
      const extra = await ensureTeams(season, [info.constructorId]);
      teamMap.set(info.constructorId, extra.get(info.constructorId));
    }
    const { teamId, carId } = teamMap.get(info.constructorId);
    return { driverId: await resolveDriver(info.driver), teamId, carId, carNumber: num };
  };

  const meetingResults = await getJson(`${OPENF1}/session_result?meeting_key=${meeting.meeting_key}`);
  const meetingWeather = await getJson(`${OPENF1}/weather?meeting_key=${meeting.meeting_key}`);
  const meetingRC = await getJson(`${OPENF1}/race_control?meeting_key=${meeting.meeting_key}`);
  const meetingPits = await getJson(`${OPENF1}/pit?meeting_key=${meeting.meeting_key}`);
  const meetingStints = await getJson(`${OPENF1}/stints?meeting_key=${meeting.meeting_key}`);

  let sortOrder = 0;
  for (const s of sessions) {
    const def = SESSION_DEFS[s.session_name];
    const sName = def.rename || s.session_name;
    const sr = meetingResults.filter((r) => r.session_key === s.session_key);
    const jol = def.source === "race" ? results : def.source === "sprint" ? sprintResults.get(race.round)?.SprintResults || [] : def.source === "quali" ? qualiResults.get(race.round)?.QualifyingResults || [] : null;
    if ((jol && !jol.length) || (!jol && !sr.length)) {
      log(`  ${sName}: no classification, skipped`);
      continue;
    }
    const lp = localParts(s.date_start, s.gmt_offset);
    const session = await insertOne("v2_sessions", {
      event_id: event.id, name: sName, session_type: def.type, status: "published", sort_order: sortOrder++,
      source_document_url: `${OPENF1}/sessions?session_key=${s.session_key}`,
      date: `${lp.date}T00:00:00+00:00`, start_time: lp.time, end_time: s.date_end ? localParts(s.date_end, s.gmt_offset).time : null,
      layout_id: layout.id, parent_session_id: null,
    });
    stats.sessions++;
    const sid = session.id;
    const srBy = new Map(sr.map((r) => [String(r.driver_number), r]));

    /* weather (every session) */
    const w = weatherRow(sid, meetingWeather.filter((x) => x.session_key === s.session_key));
    if (w) {
      await insertMany("v2_session_weather", [w]);
      bump("v2_session_weather", 1);
    }

    if (def.type === "practice") {
      const rows = [];
      for (const r of [...sr].sort((x, y) => (x.position ?? 99) - (y.position ?? 99))) {
        const e = await entrant(s.session_key, r.driver_number);
        if (!e) continue;
        const best = typeof r.duration === "number" ? r.duration : null;
        rows.push({
          session_id: sid, position: r.position ?? null, driver_id: e.driverId, team_id: e.teamId, car_id: e.carId, car_number: e.carNumber,
          best_lap_time: fmtTime(best), gap_to_p1: typeof r.gap_to_leader === "number" && r.gap_to_leader > 0 ? `+${r.gap_to_leader.toFixed(3)}` : null,
          laps_run: r.number_of_laps ?? null, points: null, extra_data: r.position ? { PIC: r.position } : {},
        });
      }
      await insertMany("v2_practice_results", rows);
      bump("v2_practice_results", rows.length);
      log(`  ${sName}: ${rows.length} practice rows`);
      continue;
    }

    if (def.type === "qualifying") {
      // Grand Prix qualifying from Jolpica (Q1/Q2/Q3); sprint qualifying from OpenF1 (SQ1/SQ2/SQ3)
      const entries = def.source === "quali"
        ? jol.map((r) => ({ number: r.number, position: Number(r.position), q: [r.Q1, r.Q2, r.Q3].map((t) => parseTime(t)) }))
        : sr.map((r) => ({ number: r.driver_number, position: r.position, q: Array.isArray(r.duration) ? r.duration.map((d) => (typeof d === "number" ? d : null)) : [r.duration ?? null, null, null] }));
      entries.sort((x, y) => (x.position ?? 99) - (y.position ?? 99));
      const phaseBest = [0, 1, 2].map((i) => Math.min(...entries.map((e) => e.q[i]).filter((x) => x != null)));
      const rows = [];
      for (const q of entries) {
        const e = await entrant(s.session_key, q.number);
        if (!e) continue;
        const phase = q.q[2] != null ? 2 : q.q[1] != null ? 1 : q.q[0] != null ? 0 : null;
        const best = phase == null ? null : q.q[phase];
        const gap = best != null && Number.isFinite(phaseBest[phase]) ? best - phaseBest[phase] : null;
        rows.push({
          session_id: sid, position: q.position ?? null, driver_id: e.driverId, team_id: e.teamId, car_id: e.carId, car_number: e.carNumber,
          best_time: fmtTime(best), gap_to_pole: gap != null && gap > 0.0005 ? `+${gap.toFixed(3)}` : null,
          laps_run: srBy.get(String(q.number))?.number_of_laps ?? null, points: null,
          q1_time: fmtTime(q.q[0]), q2_time: fmtTime(q.q[1]), q3_time: fmtTime(q.q[2]), extra_data: def.source === "quali" && q.position ? { PIC: q.position } : {},
        });
      }
      await insertMany("v2_qualifying_results", rows);
      bump("v2_qualifying_results", rows.length);
      log(`  ${sName}: ${rows.length} qualifying rows`);
      continue;
    }

    /* race / sprint */
    const laps = await getJson(`${OPENF1}/laps?session_key=${s.session_key}`);
    const ends = lapEndTimes(laps);
    const rc = meetingRC.filter((m) => m.session_key === s.session_key).sort((x, y) => x.date.localeCompare(y.date));
    const winner = jol.find((r) => r.position === "1");
    const lap1 = laps.filter((l) => l.lap_number === 1 && l.date_start).map((l) => ts(l.date_start));
    let t0 = lap1.length ? Math.min(...lap1) : ts(s.date_start);
    const starts = rc.filter((m) => m.category === "SessionStatus" && /SESSION STARTED/.test(m.message)).map((m) => ts(m.date));
    const wEnd = winner ? ends.get(Number(winner.number))?.get(Number(winner.laps)) : null;
    let t0Source = "first lap start";
    if (wEnd != null && winner?.Time?.millis) {
      const cand = wEnd - Number(winner.Time.millis) / 1000;
      if (starts.some((x) => Math.abs(x - cand) < 6) || Math.abs(cand - t0) < 6) {
        t0 = cand;
        t0Source = "winner's official race time";
      }
    }
    // OpenF1 occasionally misses laps (e.g. 2025 Miami: laps 1–24 absent). Then use
    // Jolpica's lap times for the whole race: elapsed = cumulative lap time from t0.
    let lapSource = "OpenF1";
    const coverageShort = jol.some((r) => Number(r.laps) > 1 && (ends.get(Number(r.number))?.size || 0) < Number(r.laps) - 1);
    if (coverageShort && def.source === "race") {
      const jl = await jolpicaRaces(`${YEAR}/${race.round}/laps`, "Laps");
      const timing = new Map();
      for (const lap of jl.get(race.round)?.Laps || [])
        for (const t of lap.Timings || []) {
          if (!timing.has(t.driverId)) timing.set(t.driverId, new Map());
          timing.get(t.driverId).set(Number(lap.number), parseTime(t.time));
        }
      if (timing.size) {
        lapSource = "Jolpica lap times (OpenF1 laps incomplete)";
        ends.clear();
        for (const r of jol) {
          const tm = timing.get(r.Driver.driverId);
          if (!tm) continue;
          const m = new Map();
          let cum = 0;
          for (let n = 1; tm.has(n); n++) {
            cum += tm.get(n);
            m.set(n, t0 + cum);
          }
          ends.set(Number(r.number), m);
        }
      }
    }
    const lapRows = [];
    const lastElapsed = new Map();
    const lapEndByCar = new Map();
    for (const r of jol) {
      const num = Number(r.number);
      const e = ends.get(num);
      if (!e) continue;
      const done = Number(r.laps);
      const m = new Map();
      let prev = 0;
      for (const [n, end] of [...e].sort((x, y) => x[0] - y[0])) {
        if (n > done) break;
        const el = round3(end - t0);
        if (el <= prev) continue;
        prev = el;
        m.set(n, el);
        lapRows.push({ session_id: sid, car_number: String(num), lap_number: n, elapsed: el });
      }
      lapEndByCar.set(String(num), m);
      if (m.size) lastElapsed.set(String(num), Math.max(...m.values()));
    }
    const finish = Math.max(0, ...lastElapsed.values());

    // stints (tyre stints, one driver per car)
    const entrants = new Map();
    for (const r of jol) entrants.set(String(r.number), await entrant(s.session_key, r.number));
    const stintRows = [];
    for (const st of meetingStints.filter((x) => x.session_key === s.session_key)) {
      const num = String(st.driver_number);
      const m = lapEndByCar.get(num);
      const en = entrants.get(num);
      if (!m || !m.size || !en || st.lap_start == null) continue;
      const lastLap = Math.max(...m.keys());
      const endLap = Math.min(st.lap_end ?? lastLap, lastLap);
      if (st.lap_start > endLap) continue;
      const startEl = st.lap_start <= 1 ? 0 : m.get(st.lap_start - 1);
      const endEl = m.get(endLap);
      if (startEl == null || endEl == null) continue;
      stintRows.push({ session_id: sid, car_number: num, driver_id: en.driverId, start_lap: st.lap_start, end_lap: endLap, start_elapsed: startEl, end_elapsed: endEl });
    }

    // flags + race control
    const flagRows = finish > 0 ? buildFlagSegments(rc, t0, finish).map((f) => ({ session_id: sid, ...f })) : [];
    const reds = flagRows.filter((f) => f.flag_state === "RED");
    const pitRows = [];
    const pitCount = new Map();
    for (const p of meetingPits.filter((x) => x.session_key === s.session_key && x.date)) {
      const num = String(p.driver_number);
      const en = entrants.get(num);
      if (!en) continue;
      const pin = round3(ts(p.date) - t0);
      if (pin < 0 || (finish && pin > finish + 120)) continue;
      const lane = p.lane_duration ?? p.pit_duration ?? null;
      const underRed = reds.some((f) => pin >= f.start_elapsed - 5 && pin <= f.end_elapsed);
      pitRows.push({
        session_id: sid, car_number: num, driver_id: en.driverId, lap_number: p.lap_number ?? null,
        stop_duration: lane != null ? fmtTime(lane) : null,
        total_pit_time: p.stop_duration != null ? fmtTime(p.stop_duration) : null,
        pit_in_elapsed: pin, pit_out_elapsed: lane != null ? round3(pin + lane) : null,
        flag_status: underRed ? "Red" : null,
      });
      if (!underRed) pitCount.set(num, (pitCount.get(num) || 0) + 1);
    }
    const section = await insertOne("v2_annotation_sections", { session_id: sid, title: "Race Control", sort_order: 0 });
    const items = rc
      .filter((m) => !(m.category === "Flag" && String(m.flag).toUpperCase() === "BLUE"))
      .map((m, i) => {
        const off = ts(m.date) - t0;
        const clock = localParts(m.date, s.gmt_offset).clock;
        return { section_id: section.id, description: `[${clock}] ${off >= 0 ? `(${fmtOffset(off)}) ` : ""}${m.message}`, color: rcColor(m), sort_order: i };
      });

    // classification
    const winnerLaps = Number(winner?.laps || 0);
    const raceRows = [];
    for (const r of jol) {
      const en = entrants.get(String(r.number));
      if (!en) continue;
      const pt = r.positionText;
      const numeric = /^\d+$/.test(pt);
      const st = r.status || "";
      const runningAtEnd = /^Finished$|^Lapped$|^\+\d+ Laps?$/.test(st);
      const status = numeric ? (runningAtEnd ? "finished" : "classified") : pt === "D" || pt === "E" ? "dsq" : pt === "W" || pt === "F" ? "dns" : "dnf";
      const down = winnerLaps - Number(r.laps || 0);
      let gap = null;
      if (r.position !== "1" && numeric) gap = down > 0 ? `${down} Lap${down > 1 ? "s" : ""}` : r.Time?.time ? (r.Time.time.startsWith("+") ? r.Time.time : `+${r.Time.time}`) : null;
      raceRows.push({
        session_id: sid, position: Number(r.position), driver_id: en.driverId, team_id: en.teamId, car_id: en.carId, car_number: en.carNumber,
        laps_completed: Number(r.laps), gap_to_leader: gap, total_time: r.position === "1" ? r.Time?.time ?? null : null,
        fastest_lap_time: r.FastestLap?.Time?.time ?? null, pit_stops: pitCount.get(String(r.number)) ?? 0,
        points: Number(r.points), status, dnf_reason: status === "finished" ? null : st || null,
        extra_data: { PIC: Number(r.position), grid: Number(r.grid), position_text: pt, ...(r.FastestLap?.rank ? { fastest_lap_rank: Number(r.FastestLap.rank) } : {}) },
      });
    }

    // sanity: laps per car vs classification
    const short = raceRows.filter((r) => r.laps_completed > 0 && (lapEndByCar.get(r.car_number)?.size || 0) < r.laps_completed - 1);
    await insertMany("v2_race_results", raceRows);
    await insertMany("v2_lap_times", lapRows);
    await insertMany("v2_stints", stintRows);
    await insertMany("v2_pit_stops", pitRows);
    await insertMany("v2_flag_segments", flagRows);
    await insertMany("v2_annotation_items", items);
    for (const [t, n] of [["v2_race_results", raceRows.length], ["v2_lap_times", lapRows.length], ["v2_stints", stintRows.length], ["v2_pit_stops", pitRows.length], ["v2_flag_segments", flagRows.length], ["v2_annotation_items", items.length], ["v2_annotation_sections", 1]]) bump(t, n);
    const flagSummary = flagRows.filter((f) => f.flag_state !== "GREEN").map((f) => `${f.flag_state}@${Math.round(f.start_elapsed)}`).join(" ");
    log(`  ${sName}: ${raceRows.length} results, ${lapRows.length} laps from ${lapSource} (t0 from ${t0Source}), ${stintRows.length} stints, ${pitRows.length} pit, ${items.length} RC, flags [${flagSummary}]` +
      (short.length ? `  ⚠ lap timing short for #${short.map((r) => `${r.car_number}(${lapEndByCar.get(r.car_number)?.size || 0}/${r.laps_completed})`).join(" #")}` : ""));
  }
}

if (a["dry-run"]) log("dry run: nothing written");
else await store.flush();
log(`done: ${JSON.stringify(stats)}  (${requests} API requests, rest from cache)`);
if (!a["dry-run"] && !a.round) await verify();
