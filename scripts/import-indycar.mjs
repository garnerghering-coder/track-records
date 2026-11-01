#!/usr/bin/env node
/**
 * Import NTT INDYCAR SERIES seasons from INDYCAR's official results into the
 * repo data store.
 *
 *   node --experimental-strip-types scripts/import-indycar.mjs --year 2025 \
 *     [--event <indycar.com EventID>] [--replace] [--preview] [--cache <dir>] [--offline] [--quiet]
 *
 *   --year     season(s) to import, comma separated (2024,2025,2026)
 *   --event    only this indycar.com EventID (see --list)
 *   --list     print the season's events (EventID, date, track) and exit
 *   --replace  delete an event's sessions and all their rows first; without it,
 *              events that already have sessions are skipped (safe to re-run)
 *   --preview  fetch and parse, print counts, write nothing
 *   --cache    directory for downloaded API JSON and PDFs (default: $TMPDIR/indycar-cache);
 *              reruns use the cache and make no requests
 *   --offline  fail instead of downloading anything that is not cached
 *
 * Sources (see docs/DATA-SOURCES.md, "NTT INDYCAR SERIES"):
 *   - indycar.com results API: sessions, classifications (practice, qualifying, race),
 *     championship points actually awarded per race (incl. pole, laps-led and
 *     Indianapolis 500 qualifying points) — /api/results/EventsSessionDetails?id=<session>
 *   - the race's official PDFs (Indy Racing Information System), via the S3 bucket the
 *     results page links to: Results (engines, caution and penalty summaries) and
 *     Section Results (every lap of every car, pit-lane in/out timing).
 *
 * Written tables: v2_series(+aliases), v2_seasons, v2_circuits, v2_circuit_layouts, v2_events,
 * v2_sessions, v2_drivers, v2_teams, v2_cars, v2_team_season_cars, v2_race_results,
 * v2_qualifying_results, v2_practice_results, v2_lap_times, v2_pit_stops, v2_flag_segments,
 * v2_annotation_sections, v2_annotation_items.
 * Afterwards: node --experimental-strip-types scripts/recompute-fingerprints.mjs
 */
import path from "node:path";
import os from "node:os";
import { parseArgs } from "node:util";
import { openStore } from "./lib/local-store.mjs";
import { createSource, parseEngines, parseRaceResultsPdf, parseReportHeader, parseSectionResults } from "./lib/indycar-source.mjs";

const { values: a } = parseArgs({
  options: {
    year: { type: "string" },
    event: { type: "string" },
    list: { type: "boolean", default: false },
    replace: { type: "boolean", default: false },
    preview: { type: "boolean", default: false },
    cache: { type: "string" },
    offline: { type: "boolean", default: false },
    quiet: { type: "boolean", short: "q", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});
if (a.help || !a.year) {
  console.error("usage: scripts/import-indycar.mjs --year 2024[,2025,...] [--event <EventID>] [--list] [--replace] [--preview] [--cache <dir>] [--offline]");
  process.exit(a.help ? 0 : 2);
}
const years = a.year.split(",").map((y) => y.trim());
const log = (...m) => a.quiet || console.error(...m);
const src = createSource({ cacheDir: a.cache || path.join(os.tmpdir(), "indycar-cache"), quiet: a.quiet, offline: a.offline });

/* ── Static reference data ──────────────────────────────────────────── */

const SERIES = { name: "NTT INDYCAR SERIES", short_name: "INDYCAR", aliases: ["IndyCar Series", "NTT IndyCar Series", "IndyCar"] };

/**
 * Venues by the track name printed on INDYCAR's reports. `circuit` reuses an
 * existing v2_circuits row when one has that name; `layout` likewise by
 * circuit + name. Lengths are INDYCAR's official lap lengths.
 */
const MI = 1.609344;
const VENUES = {
  "Streets of St. Petersburg": { circuit: "St. Petersburg Street Circuit", layout: "Street Circuit", short: "St. Petersburg" },
  "Streets of Long Beach": { circuit: "Long Beach Street Circuit", layout: "Street Circuit", short: "Long Beach" },
  "Streets of Detroit": { circuit: "Detroit Street Circuit", layout: "Street Circuit", short: "Detroit" },
  "Road America": { circuit: "Road America", layout: "Full Circuit", short: "Road America" },
  "WeatherTech Raceway Laguna Seca": { circuit: "WeatherTech Raceway Laguna Seca", layout: "Grand Prix", short: "Laguna Seca" },
  "Mid-Ohio Sports Car Course": { circuit: "Mid-Ohio Sports Car Course", layout: "Main Course", short: "Mid-Ohio" },
  "Indianapolis Motor Speedway RC": { circuit: "Indianapolis Motor Speedway", layout: "IMS Road Course", short: "IMS Road Course" },
  "Indianapolis Motor Speedway": {
    circuit: "Indianapolis Motor Speedway",
    layout: "Oval",
    short: "Indy 500",
    newLayout: { length_km: +(2.5 * MI).toFixed(3), turns: 4, sort_order: 2 },
  },
  "Barber Motorsports Park": {
    circuit: "Barber Motorsports Park",
    layout: "Full Course",
    short: "Barber",
    newCircuit: { location: "Birmingham, Alabama", country: "United States", latitude: 33.5326, longitude: -86.6194 },
    newLayout: { length_km: +(2.3 * MI).toFixed(3), turns: 17, sort_order: 1 },
  },
  "The Thermal Club": {
    circuit: "The Thermal Club",
    layout: "INDYCAR Grand Prix Circuit",
    short: "Thermal",
    newCircuit: { location: "Thermal, California", country: "United States", latitude: 33.6292, longitude: -116.1617 },
    newLayout: { length_km: +(3.067 * MI).toFixed(3), turns: 17, sort_order: 1 },
  },
  "Iowa Speedway": {
    circuit: "Iowa Speedway",
    layout: "Oval",
    short: "Iowa",
    newCircuit: { location: "Newton, Iowa", country: "United States", latitude: 41.6781, longitude: -93.0136 },
    newLayout: { length_km: +(0.894 * MI).toFixed(3), turns: 4, sort_order: 1 },
  },
  "Streets of Toronto": {
    circuit: "Exhibition Place Street Circuit",
    layout: "Street Circuit",
    short: "Toronto",
    newCircuit: { location: "Toronto, Ontario", country: "Canada", latitude: 43.6347, longitude: -79.4161 },
    newLayout: { length_km: +(1.786 * MI).toFixed(3), turns: 11, sort_order: 1 },
  },
  "World Wide Technology Raceway": {
    circuit: "World Wide Technology Raceway",
    layout: "Oval",
    short: "Gateway",
    newCircuit: { location: "Madison, Illinois", country: "United States", latitude: 38.6506, longitude: -90.1356 },
    newLayout: { length_km: +(1.25 * MI).toFixed(3), turns: 4, sort_order: 1 },
  },
  "Portland International Raceway": {
    circuit: "Portland International Raceway",
    layout: "Grand Prix",
    short: "Portland",
    newCircuit: { location: "Portland, Oregon", country: "United States", latitude: 45.5947, longitude: -122.6939 },
    newLayout: { length_km: +(1.964 * MI).toFixed(3), turns: 12, sort_order: 1 },
  },
  "Milwaukee Mile": {
    circuit: "Milwaukee Mile",
    layout: "Oval",
    short: "Milwaukee",
    newCircuit: { location: "West Allis, Wisconsin", country: "United States", latitude: 43.0195, longitude: -88.0108 },
    newLayout: { length_km: +(1.015 * MI).toFixed(3), turns: 4, sort_order: 1 },
  },
  "Nashville Superspeedway": {
    circuit: "Nashville Superspeedway",
    layout: "Oval",
    short: "Nashville",
    newCircuit: { location: "Lebanon, Tennessee", country: "United States", latitude: 36.0453, longitude: -86.4119 },
    newLayout: { length_km: +(1.33 * MI).toFixed(3), turns: 4, sort_order: 1 },
  },
  "Phoenix Raceway": {
    circuit: "Phoenix Raceway",
    layout: "Oval",
    short: "Phoenix",
    newCircuit: { location: "Avondale, Arizona", country: "United States", latitude: 33.3747, longitude: -112.3111 },
    newLayout: { length_km: +(1.0 * MI).toFixed(3), turns: 4, sort_order: 1 },
  },
  "Streets of Arlington": {
    circuit: "Arlington Street Circuit",
    layout: "Street Circuit",
    short: "Arlington",
    newCircuit: { location: "Arlington, Texas", country: "United States", latitude: 32.7505, longitude: -97.0826 },
    newLayout: { length_km: +(2.73 * MI).toFixed(3), turns: 14, sort_order: 1 },
  },
  "Streets of Markham": {
    circuit: "Markham Street Circuit",
    layout: "Street Circuit",
    short: "Markham",
    newCircuit: { location: "Markham, Ontario", country: "Canada", latitude: 43.8561, longitude: -79.3370 },
    newLayout: { length_km: +(2.1 * MI).toFixed(3), turns: null, sort_order: 1 },
  },
  "Streets of Washington": {
    circuit: "Washington DC Street Circuit",
    layout: "Street Circuit",
    short: "Washington DC",
    newCircuit: { location: "Washington, D.C.", country: "United States", latitude: 38.8895, longitude: -77.0230 },
    newLayout: { length_km: +(1.7 * MI).toFixed(3), turns: null, sort_order: 1 },
  },
};

/** Entrant names on indycar.com → one team per organisation (the entrant is kept in extra_data). */
const TEAM_NAMES = [
  [/^(A\.?J\.? Foyt)/i, "A.J. Foyt Enterprises"],
  [/^Andretti/i, "Andretti Global"],
  [/^ECR$|^Ed Carpenter/i, "Ed Carpenter Racing"],
  [/^Meyer Shank/i, "Meyer Shank Racing"],
  [/^HMD Motorsports/i, "HMD Motorsports"],
  [/^Dreyer/i, "Dreyer & Reinbold Racing"],
  [/^PREMA/i, "PREMA Racing"],
];
const teamNameOf = (entrant) => {
  const e = String(entrant || "").trim();
  for (const [re, name] of TEAM_NAMES) if (re.test(e)) return name;
  return e.replace(/\s+w\/.*$/i, "").trim();
};

/** indycar.com names that are already in v2_drivers under another spelling. */
const DRIVER_ALIASES = { "pato o'ward": "Patricio O'Ward" };

/** Nationality of drivers whose indycar.com profile page no longer exists (no birth date is guessed). */
const NATIONALITY_FALLBACK = {
  "Agustin Canapino": "Argentina",
  "Linus Lundqvist": "Sweden",
  "Theo Pourchaire": "France",
  "Luca Ghiotto": "Italy",
  "Marco Andretti": "United States",
  "Kyle Larson": "United States",
};

const ENGINES = { H: "Honda", C: "Chevrolet" };
const COUNTRY = { USA: "United States", US: "United States", UK: "United Kingdom", England: "United Kingdom", "Great Britain": "United Kingdom" };
const CAR_MODEL = (engine) => ({ manufacturer: "Dallara", model_name: `IR-18 ${engine}` });

/* ── Helpers ─────────────────────────────────────────────────────────── */

const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const same = (x, y) => norm(x) === norm(y);
const secs = (t) => {
  if (t == null) return null;
  const s = String(t).trim();
  if (!s || /^-|^--/.test(s)) return null;
  const parts = s.split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  const v = parts.reduce((acc, p) => acc * 60 + p, 0);
  return v > 0 ? v : null;
};
/** Seconds → "1:23.456" (or "54.321" under a minute; "1:02:03.456" over an hour). */
const fmt = (s) => {
  if (s == null || !Number.isFinite(s)) return null;
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  if (h) return `${h}:${String(m).padStart(2, "0")}:${sec}`;
  return m ? `${m}:${sec}` : String(Number(sec).toFixed(3));
};
const gap = (d) => (d == null || d <= 0 ? null : `+${fmt(d)}`);
const isoDate = (mdY) => {
  const [m, d, y] = String(mdY).split("/").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const num = (x) => (x == null || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));
const offsetStr = (t) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return `+${h}:${String(m).padStart(2, "0")}:${s}`;
};

/** Which indycar.com sessions to import, with the name and type stored. */
function pickSessions(sessions) {
  const out = [];
  const names = sessions.map((s) => s.SessionName);
  const hasAllCars = names.some((n) => /^Practice \d+ - All Cars$/.test(n));
  for (const s of sessions) {
    const n = s.SessionName.trim();
    if (n === "Race") out.push({ ...s, name: "Race", type: "race" });
    else if (/^(Practice( \d+)?|Final Practice.*|Warmup)$/.test(n)) out.push({ ...s, name: n, type: "practice" });
    else if (/^Practice \d+ - All Cars$/.test(n)) out.push({ ...s, name: n.replace(/ - All Cars$/, ""), type: "practice" });
    else if (/^Practice \d+ - Group \d+$/.test(n) && !hasAllCars) out.push({ ...s, name: n, type: "practice" });
  }
  // Qualifying: one session with the final qualifying order.
  const combined = sessions.find((s) => /^Combined Qualif/.test(s.SessionName));
  const single = sessions.find((s) => /^Qualif(ications|ying)( - Race \d)?$/.test(s.SessionName.trim()));
  if (combined) out.push({ ...combined, name: "Qualifying", type: "qualifying" });
  else if (single) out.push({ ...single, name: "Qualifying", type: "qualifying" });
  else {
    // Indianapolis 500 without a combined report: build the grid order from the segments.
    const seg = (re) => sessions.find((s) => re.test(s.SessionName));
    const parts = { fast6: seg(/Fast 6/i), top12: seg(/Top.?12/i), day1: seg(/Day 1|All Cars/i), last: seg(/Last Chance/i) };
    if (parts.day1) out.push({ ...parts.day1, name: "Qualifying", type: "qualifying", segments: parts });
  }
  return out;
}

/* ── Store ───────────────────────────────────────────────────────────── */

const store = openStore({ writable: !a.preview });
const all = async (t) => {
  const { data, error } = await store.from(t).select("*");
  if (error) throw new Error(`${t}: ${error.message}`);
  return data || [];
};
const insert = async (table, rows) => {
  if (!rows.length) return [];
  if (a.preview) return rows.map((r) => ({ id: `preview-${Math.random().toString(36).slice(2)}`, ...r }));
  const out = [];
  for (let i = 0; i < rows.length; i += 5000) {
    const { data, error } = await store.from(table).insert(rows.slice(i, i + 5000)).select("*");
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
  }
  return out;
};
const insertOne = async (table, row) => (await insert(table, [row]))[0];

async function ensureSeries() {
  const series = await all("v2_series");
  let s = series.find((x) => same(x.name, SERIES.name) || same(x.short_name, SERIES.short_name));
  if (!s) s = await insertOne("v2_series", { name: SERIES.name, short_name: SERIES.short_name });
  const aliases = (await all("v2_series_aliases")).filter((x) => x.series_id === s.id);
  const missing = SERIES.aliases.filter((al) => !aliases.some((x) => same(x.alias, al)));
  await insert("v2_series_aliases", missing.map((alias) => ({ series_id: s.id, alias })));
  return s;
}

async function ensureSeason(seriesId, year) {
  let s = (await all("v2_seasons")).find((x) => x.series_id === seriesId && Number(x.year) === Number(year));
  if (!s) s = await insertOne("v2_seasons", { series_id: seriesId, year: Number(year), cdm: null, is_multiclass: false, is_spec_series: false, spec_car_id: null });
  return s;
}

async function ensureVenue(trackName) {
  const v = VENUES[trackName];
  if (!v) throw new Error(`unknown INDYCAR track "${trackName}": add it to VENUES in scripts/import-indycar.mjs`);
  let circuit = (await all("v2_circuits")).find((c) => same(c.name, v.circuit));
  if (!circuit) {
    if (!v.newCircuit) throw new Error(`circuit "${v.circuit}" not found`);
    circuit = await insertOne("v2_circuits", { name: v.circuit, ...v.newCircuit, layout_image_url: null, length_km: null });
  }
  let layout = (await all("v2_circuit_layouts")).find((l) => l.circuit_id === circuit.id && same(l.name, v.layout));
  if (!layout) {
    if (!v.newLayout) throw new Error(`layout "${v.layout}" of "${v.circuit}" not found`);
    layout = await insertOne("v2_circuit_layouts", {
      circuit_id: circuit.id,
      name: v.layout,
      layout_image_url: null,
      total_straight_length_km: null,
      total_elevation_change_m: null,
      heavy_braking_corners: null,
      ...v.newLayout,
    });
  }
  return { circuit, layout, short: v.short };
}

/* entity resolution (drivers, teams, cars), cached for the run */
const cache = { drivers: null, teams: null, cars: null, aliases: null, tsc: null };
async function loadEntities() {
  cache.drivers = await all("v2_drivers");
  cache.teams = await all("v2_teams");
  cache.cars = await all("v2_cars");
  cache.aliases = (await all("search_aliases")).filter((x) => x.entity_type === "driver");
  cache.tsc = await all("v2_team_season_cars");
}
const driverPages = new Map();
async function driverProfile(url) {
  if (!url) return {};
  if (driverPages.has(url)) return driverPages.get(url);
  let info = {};
  try {
    const html = (await src.media(`https://www.indycar.com${url}`))?.toString("utf8") || "";
    const text = html.replace(/<[^>]+>/g, "\n").replace(/\n\s*\n+/g, "\n");
    const born = text.match(/Birthdate\s*\n\s*([A-Z][a-z]+ \d{1,2}, \d{4})/);
    const flag = html.match(/driver-detail-content-card-nationality-flag"\s*alt="([^"]+?) flag"/) || html.match(/alt="([^"]+?) flag"\s*class="driver-detail/);
    info = {
      date_of_birth: born ? new Date(`${born[1]} 12:00:00 UTC`).toISOString().slice(0, 10) : null,
      nationality: flag ? COUNTRY[flag[1]] || flag[1] : null,
    };
  } catch (e) {
    log(`  driver page ${url}: ${e.message}`);
  }
  driverPages.set(url, info);
  return info;
}
async function driverId(rec) {
  const name = `${String(rec.FirstName || "").trim()} ${String(rec.LastName || "").trim()}`.trim() || String(rec.DriverName || "").trim();
  const wanted = DRIVER_ALIASES[name.toLowerCase()] || name;
  let d = cache.drivers.find((x) => same(x.full_name, wanted));
  if (!d) {
    const al = cache.aliases.find((x) => same(x.alias, wanted));
    if (al) d = cache.drivers.find((x) => same(x.full_name, al.canonical));
  }
  if (!d) {
    const prof = await driverProfile(rec.DriverUrl || `/Drivers/${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 -]/g, "").trim().replace(/\s+/g, "-")}`);
    d = await insertOne("v2_drivers", { full_name: wanted, short_name: null, nationality: prof.nationality ?? NATIONALITY_FALLBACK[wanted] ?? null, date_of_birth: prof.date_of_birth ?? null });
    cache.drivers.push(d);
    log(`  + driver ${wanted}${prof.nationality ? ` (${prof.nationality})` : ""}`);
  }
  return d.id;
}
async function teamId(entrant) {
  const name = teamNameOf(entrant);
  let t = cache.teams.find((x) => same(x.full_name, name));
  if (!t) {
    t = await insertOne("v2_teams", { full_name: name, short_name: null, nationality: null });
    cache.teams.push(t);
    log(`  + team ${name}`);
  }
  return t.id;
}
async function carId(engineLetter) {
  const engine = ENGINES[engineLetter];
  if (!engine) return null;
  const want = CAR_MODEL(engine);
  let c = cache.cars.find((x) => same(x.manufacturer, want.manufacturer) && same(x.model_name, want.model_name));
  if (!c) {
    c = await insertOne("v2_cars", want);
    cache.cars.push(c);
  }
  return c.id;
}
async function linkTeamCar(seasonId, team, car) {
  if (!team || !car) return;
  if (cache.tsc.some((x) => x.season_id === seasonId && x.team_id === team && x.car_id === car)) return;
  const row = await insertOne("v2_team_season_cars", { team_id: team, car_id: car, season_id: seasonId });
  cache.tsc.push(row);
}

async function deleteEventSessions(eventId) {
  const sessions = (await all("v2_sessions")).filter((s) => s.event_id === eventId);
  const ids = sessions.map((s) => s.id);
  if (!ids.length) return 0;
  const sections = (await all("v2_annotation_sections")).filter((s) => ids.includes(s.session_id)).map((s) => s.id);
  if (sections.length) await store.from("v2_annotation_items").delete().in("section_id", sections);
  for (const t of ["v2_annotation_sections", "v2_race_results", "v2_qualifying_results", "v2_practice_results", "v2_lap_times", "v2_pit_stops", "v2_stints", "v2_flag_segments", "v2_session_weather", "v2_session_summaries"]) {
    await store.from(t).delete().in("session_id", ids);
  }
  await store.from("v2_sessions").delete().in("id", ids);
  return ids.length;
}

/* ── Import one event ────────────────────────────────────────────────── */

async function importEvent({ season, year, ev, round, engineByCar }) {
  const picked = pickSessions(ev.Sessions || []);
  const raceRef = picked.find((s) => s.type === "race");
  const raceApi = await src.session(raceRef.EventsSessionID);
  const reportUrl = (api, type) => api?.SessionReports?.find((r) => r.DocumentType === type)?.Url;
  const resultsTxt = reportUrl(raceApi, "Results") ? await src.pdfText(reportUrl(raceApi, "Results")) : null;
  const header = resultsTxt ? parseReportHeader(resultsTxt) : {};
  const pdf = resultsTxt ? parseRaceResultsPdf(resultsTxt) : { engines: {}, cautions: [], penalties: [], red: [] };
  for (const [car, e] of Object.entries(pdf.engines)) engineByCar.set(car, e.engine);
  const venue = await ensureVenue(header.track || "");

  // session payloads
  const apis = new Map();
  for (const s of picked) {
    apis.set(s.EventsSessionID, s === raceRef ? raceApi : await src.session(s.EventsSessionID));
    if (s.segments) for (const seg of Object.values(s.segments)) if (seg) apis.set(seg.EventsSessionID, await src.session(seg.EventsSessionID));
  }
  const dates = picked.map((s) => isoDate(apis.get(s.EventsSessionID).SessionDate)).sort();
  const name = /Indianapolis 500/.test(ev.EventName) ? `${year} Indianapolis 500` : `${year} ${ev.EventName.trim()}`;
  const raceNo = ev.EventName.match(/Race (\d)/)?.[1] || picked.find((s) => s.type === "qualifying")?.SessionName.match(/Race (\d)/)?.[1];
  const shortName = venue.short + (raceNo && ["Iowa", "Milwaukee"].includes(venue.short) ? ` Race ${raceNo}` : "");

  const seasonEvents = (await all("v2_events")).filter((e) => e.season_id === season.id);
  let event = seasonEvents.find((e) => same(e.name, name));
  if (event && !a.preview) {
    const n = (await all("v2_sessions")).filter((s) => s.event_id === event.id).length;
    if (n && !a.replace) {
      log(`skip  ${name}: already has ${n} sessions (use --replace)`);
      return null;
    }
    if (n) log(`  replaced: deleted ${await deleteEventSessions(event.id)} sessions`);
    await store.from("v2_events").update({ round_number: String(round), start_date: dates[0], end_date: dates[dates.length - 1], circuit_id: venue.circuit.id, layout_id: venue.layout.id, short_name: shortName }).eq("id", event.id);
  } else if (!event) {
    event = await insertOne("v2_events", {
      season_id: season.id,
      circuit_id: venue.circuit.id,
      layout_id: venue.layout.id,
      name,
      short_name: shortName,
      round_number: String(round),
      start_date: dates[0],
      end_date: dates[dates.length - 1],
      description: null,
      status: "published",
    });
  }
  log(`event ${name} (round ${round}, ${header.track}, ${picked.length} sessions)`);

  // chronological order: API lists newest first; keep practice/qualifying/race order within a day
  const typeRank = { practice: 0, qualifying: 1, race: 2 };
  const ordered = picked
    .map((s, i) => ({ s, i, date: isoDate(apis.get(s.EventsSessionID).SessionDate) }))
    .sort((x, y) => x.date.localeCompare(y.date) || (x.s.type === "practice" && y.s.type === "practice" ? y.i - x.i : typeRank[x.s.type] - typeRank[y.s.type] || y.i - x.i));
  const counts = { sessions: 0, race: 0, qualifying: 0, practice: 0, laps: 0, pits: 0, flags: 0, notes: 0 };
  const engineOf = (car) => engineByCar.get(String(car)) || null;

  for (const [k, { s, date }] of ordered.entries()) {
    const api = apis.get(s.EventsSessionID);
    const session = await insertOne("v2_sessions", {
      event_id: event.id,
      name: s.name,
      session_type: s.type,
      status: "published",
      sort_order: k,
      source_document_url: `https://www.indycar.com/api/results/EventsSessionDetails?id=${s.EventsSessionID}`,
      date: `${date}T00:00:00+00:00`,
      start_time: null,
      layout_id: venue.layout.id,
      parent_session_id: null,
    });
    counts.sessions++;
    const base = async (r) => {
      const entrant = String(r.TeamName || "").trim();
      const team = await teamId(entrant);
      const car = await carId(engineOf(r.CarNumber));
      await linkTeamCar(season.id, team, car);
      return { session_id: session.id, driver_id: await driverId(r), team_id: team, car_id: car, car_number: String(r.CarNumber).trim(), entrant, engine: ENGINES[engineOf(r.CarNumber)] || null };
    };
    const recs = (api.records || []).filter((r) => !r.IsDeleted && r.PositionFinish != null).sort((x, y) => x.PositionFinish - y.PositionFinish);
    if (recs.some((r) => !engineOf(String(r.CarNumber).trim())) && reportUrl(api, "Results")) {
      // cars that did not race (e.g. Indianapolis 500 non-qualifiers): engine from this session's results PDF
      const txt = await src.pdfText(reportUrl(api, "Results"));
      for (const [car, e] of Object.entries(txt ? parseEngines(txt) : {})) if (!engineByCar.has(car)) engineByCar.set(car, e.engine);
    }

    if (s.type === "practice") {
      const p1 = secs(recs[0]?.BestLapTime);
      const rows = [];
      for (const r of recs) {
        const b = await base(r);
        const best = secs(r.BestLapTime);
        rows.push({
          session_id: b.session_id, driver_id: b.driver_id, team_id: b.team_id, car_id: b.car_id, car_number: b.car_number,
          position: r.PositionFinish,
          best_lap_time: fmt(best),
          gap_to_p1: best && p1 && r.PositionFinish > 1 ? gap(best - p1) : null,
          laps_run: num(r.LapsComplete),
          extra_data: { entrant: b.entrant, engine: b.engine, best_speed_mph: num(r.BestSpeed), best_lap_number: num(r.InLap) },
        });
      }
      counts.practice += (await insert("v2_practice_results", rows)).length;
      continue;
    }

    if (s.type === "qualifying") {
      let list = recs.map((r) => ({ r, segment: null }));
      if (s.segments) {
        // Indianapolis 500 (2024): Fast 6 → 1-6, Top 12 → 7-12, Day 1 → 13-30, Last Chance → 31-33, then non-qualifiers.
        const seg = (k) => (s.segments[k] ? (apis.get(s.segments[k].EventsSessionID).records || []).filter((r) => r.PositionFinish != null).sort((x, y) => x.PositionFinish - y.PositionFinish) : []);
        const placed = new Map();
        const add = (rows, label, filter = () => true) => rows.filter(filter).forEach((r) => placed.has(r.CarNumber) || placed.set(r.CarNumber, { r, segment: label }));
        add(seg("fast6"), "Firestone Fast 6");
        add(seg("top12"), "Top 12");
        add(seg("day1"), "Day 1", (r) => r.PositionFinish <= 30);
        add(seg("last"), "Last Chance");
        add(seg("day1"), "Day 1 (did not qualify)");
        // the segment reports' own order is not always the speed order: the official
        // starting grid settles positions; non-qualifiers follow in Day 1 order
        const grid = new Map((raceApi.records || []).map((r) => [String(r.CarNumber).trim(), num(r.PositionStart)]));
        list = [...placed.values()]
          .map((x, i) => ({ ...x, k: grid.get(String(x.r.CarNumber).trim()) ?? 1000 + i }))
          .sort((p, q) => p.k - q.k);
      }
      const oval = (raceApi.TrackType || "") === "O" || (raceApi.TrackType || "") === "I";
      const timeOf = (r) => (oval ? secs(r.ElapsedTime) : secs(r.BestLapTime));
      const pole = timeOf(list[0]?.r);
      const rows = [];
      for (const [i, { r, segment }] of list.entries()) {
        const b = await base(r);
        const t = timeOf(r);
        const laps = [r.QualLap1, r.QualLap2, r.QualLap3, r.QualLap4].map((x) => num(String(x ?? "").trim())).filter((x) => x && x > 0);
        const status = String(r.Status || "").trim();
        rows.push({
          session_id: b.session_id, driver_id: b.driver_id, team_id: b.team_id, car_id: b.car_id, car_number: b.car_number,
          position: s.segments ? i + 1 : r.PositionFinish,
          best_time: fmt(t),
          gap_to_pole: t && pole && i > 0 ? gap(t - pole) : null,
          laps_run: num(r.LapsComplete) ?? (laps.length || null),
          points: null, // INDYCAR's race points already include pole and Indianapolis 500 qualifying points
          extra_data: {
            entrant: b.entrant,
            engine: b.engine,
            ...(oval ? { qualifying_laps: laps, avg_speed_mph: num(r.SpeedAvg), time_is: `${laps.length || (raceApi.TrackType === "I" ? 4 : 2)}-lap total` } : { best_speed_mph: num(r.BestSpeed) }),
            ...(segment ? { segment } : {}),
            ...(status && !s.segments ? { round: status } : {}),
          },
        });
      }
      counts.qualifying += (await insert("v2_qualifying_results", rows)).length;
      continue;
    }

    /* race */
    const sections = reportUrl(api, "Section Results") ? parseSectionResults((await src.pdfText(reportUrl(api, "Section Results"))) || "") : {};
    const leaderTime = secs(recs[0]?.ElapsedTime);
    const rows = [];
    const lapRows = [];
    const pitRows = [];
    const elapsedByCar = new Map();
    const stoppages = new Map();
    const prep = [];
    for (const r of recs) {
      const b = await base(r);
      const st = String(r.Status || "").trim();
      const status = /^running$/i.test(st) ? "finished" : /^dns$/i.test(st) ? "dns" : /^dsq$/i.test(st) ? "dsq" : "dnf";
      const lapsDown = num(r.LapsDown) || 0;
      const total = secs(r.ElapsedTime);
      const diff = secs(r.Difference);
      // lap-by-lap elapsed from the section report; lap 1 includes the time from the leader's start to this car's start
      const sec = sections[b.car_number];
      if (sec && sec.laps.size) {
        // since mid-2025 the report also times the lap after the chequered flag: keep the laps the car completed
        const maxLap = num(r.LapsComplete) || Math.max(...sec.laps.keys());
        const missing = [];
        for (let l = 1; l <= maxLap; l++) if (!sec.laps.has(l)) missing.push(l);
        // more than a few holes is not a timing gap: keep only the laps up to the first hole
        const lastLap = missing.length > 3 ? missing[0] - 1 : maxLap;
        const times = [];
        for (let l = 1; l <= lastLap; l++) times[l] = sec.laps.get(l) ?? null;
        let sum = times.reduce((acc, x) => acc + (x ?? 0), 0);
        const holes = missing.filter((l) => l <= lastLap);
        // a lap the report has no time for: share out the difference to the official time,
        // or repeat the previous lap when that is not usable
        const diff0 = total != null ? total - sum : null;
        const fill = holes.length && diff0 != null && diff0 > 0 && diff0 / holes.length < 600 ? diff0 / holes.length : null;
        for (const l of holes) times[l] = fill ?? times[l - 1] ?? null;
        sum = times.reduce((acc, x) => acc + (x ?? 0), 0);
        // INDYCAR's elapsed times exclude red-flag stoppages, the lap times include them. The
        // replay keeps a red flag in real time (as a RED period), except a suspension of more
        // than two hours (e.g. a race finished the next day), which is taken out of the longest lap(s).
        const sorted = times.filter((x) => x != null).sort((p, q) => p - q);
        const median = sorted[Math.floor(sorted.length / 2)] || 0;
        const stopped = [];
        if (total != null && sum - total > 7200) {
          let excess = sum - total - 1;
          const order = times.map((x, l) => [l, x]).filter(([l, x]) => l > 0 && x != null && x > 7200).sort((p, q) => q[1] - p[1]);
          for (const [l, x] of order) {
            if (excess <= 0) break;
            const cut = Math.min(excess, x - 2 * median);
            if (cut <= 0) break;
            times[l] = x - cut;
            excess -= cut;
            stopped.push({ lap: l, seconds: cut });
          }
          sum = times.reduce((acc, x) => acc + (x ?? 0), 0);
        }
        stoppages.set(b.car_number, stopped);
        if (holes.length) log(`  car ${b.car_number}: no time for lap(s) ${holes.join(",")} in the section report (${fill != null ? "filled from the official elapsed time" : "previous lap repeated"})`);
        if (lastLap < maxLap) log(`  car ${b.car_number}: section report stops at lap ${lastLap} of ${maxLap}`);
        prep.push({ b, sec, times, lastLap, sum, total, status, median, grid: num(r.PositionStart) });
      }
      const best = secs(r.BestLapTime);
      rows.push({
        session_id: b.session_id, driver_id: b.driver_id, team_id: b.team_id, car_id: b.car_id, car_number: b.car_number,
        position: r.PositionFinish,
        laps_completed: num(r.LapsComplete),
        gap_to_leader: r.PositionFinish === 1 ? null : lapsDown > 0 ? `${lapsDown} Lap${lapsDown > 1 ? "s" : ""}` : diff != null ? gap(diff) : total != null && leaderTime != null ? gap(total - leaderTime) : null,
        fastest_lap_time: fmt(best),
        total_time: fmt(total),
        pit_stops: num(r.PitStops),
        points: num(r.PointsEarned),
        status,
        dnf_reason: status === "dnf" ? st : null,
        extra_data: {
          entrant: b.entrant,
          engine: b.engine,
          grid: num(r.PositionStart),
          laps_led: num(r.LapsLed) ?? 0,
          times_led: num(r.TimesLed) ?? 0,
          avg_speed_mph: num(r.SpeedAvg),
          best_lap_speed_mph: num(r.BestSpeed),
          ...(status !== "finished" ? { status_text: st } : {}),
        },
      });
    }
    // Lap 1 of a car further back starts after the race clock: for finishers that is the
    // difference to the official elapsed time; others (whose official time is the moment they
    // retired, or which ran through a red flag) take the offset of the finisher nearest to them
    // on the grid, or about 0.15 s per grid place when no finisher gives one.
    const startOffsets = prep
      .filter((p) => p.status === "finished" && p.total != null && p.total - p.sum >= -0.05 && p.total - p.sum < 90)
      .map((p) => ({ grid: p.grid, off: Math.max(0, p.total - p.sum) }));
    for (const p of prep) {
      const own = p.status === "finished" ? startOffsets.find((o) => o.grid === p.grid) : null;
      const near = [...startOffsets].sort((x, y) => Math.abs((x.grid ?? 99) - (p.grid ?? 99)) - Math.abs((y.grid ?? 99) - (p.grid ?? 99)))[0];
      let t = own ? own.off : near ? near.off : 0.15 * Math.max(0, (p.grid ?? 1) - 1);
      const { b, sec, times, lastLap } = p;
      const elapsed = new Map();
      for (let l = 1; l <= lastLap; l++) {
        if (times[l] == null) continue;
        t += times[l];
        elapsed.set(l, t);
        lapRows.push({ session_id: session.id, car_number: b.car_number, lap_number: l, elapsed: r3(t) });
      }
      elapsedByCar.set(b.car_number, elapsed);
      for (const [l, sfToPi] of sec.sfToPi) {
        if (l > lastLap) continue;
        const before = l === 1 ? 0 : elapsed.get(l - 1);
        if (before == null) continue;
        const pitIn = Math.min(before + sfToPi, elapsed.get(l) ?? Infinity);
        const dur = sec.piToPo.get(l + 1) ?? sec.piToPo.get(l) ?? null;
        pitRows.push({
          session_id: session.id,
          car_number: b.car_number,
          driver_id: b.driver_id,
          lap_number: l,
          stop_duration: dur != null ? fmt(dur) : null,
          total_pit_time: null,
          pit_in_elapsed: r3(pitIn),
          pit_out_elapsed: dur != null ? r3(Math.min(pitIn + dur, elapsed.get(l + 1) ?? Infinity)) : null,
          flag_status: pdf.cautions.some((c) => l >= c.from && l <= c.to) ? "Yellow" : "Green",
        });
      }
    }
    counts.race += (await insert("v2_race_results", rows)).length;
    counts.laps += (await insert("v2_lap_times", lapRows)).length;
    counts.pits += (await insert("v2_pit_stops", pitRows)).length;

    // flags from the caution summary, placed on the leader's lap times
    const lapEnd = new Map();
    for (const el of elapsedByCar.values()) for (const [l, t] of el) if (!lapEnd.has(l) || t < lapEnd.get(l)) lapEnd.set(l, t);
    const maxLap = Math.max(0, ...lapEnd.keys());
    const at = (l) => (l <= 0 ? 0 : lapEnd.get(l) ?? null);
    const raceEnd = at(maxLap) ?? 0;
    const notes = [];
    const yellow = [];
    for (const c of [...pdf.cautions].sort((x, y) => x.from - y.from)) {
      const start = at(c.from - 1);
      const end = at(Math.min(c.to, maxLap));
      if (start == null || end == null || end <= start) continue;
      yellow.push([start, end]);
      notes.push({ t: start, text: `[Lap ${c.from}] (${offsetStr(start)}) CAUTION ${c.no}${c.reason ? `: ${c.reason}` : ""}`, color: "#eab308" });
      if (c.to < maxLap) notes.push({ t: end, text: `[Lap ${c.to + 1}] (${offsetStr(end)}) GREEN FLAG`, color: "#22c55e" });
    }
    // red flags: laps of the winner far longer than racing or caution laps
    const red = [];
    const win = prep.find((p) => p.b.car_number === String(recs[0]?.CarNumber).trim());
    if (win) {
      for (let l = 1; l <= win.lastLap; l++) {
        const x = win.times[l];
        if (x == null || x < Math.max(3 * win.median, win.median + 120)) continue;
        const s0 = (at(l - 1) ?? 0) + 0.5 * win.median;
        const e0 = (at(l) ?? s0) - 0.5 * win.median;
        if (e0 - s0 < 60) continue;
        red.push([s0, e0]);
        notes.push({ t: s0, text: `[Lap ${l}] (${offsetStr(s0)}) RED FLAG - race stopped for about ${Math.round((e0 - s0) / 60)} min`, color: "#ef4444" });
      }
      for (const st of stoppages.get(win.b.car_number) || []) {
        const t = at(st.lap - 1) ?? 0;
        notes.push({ t, text: `[Lap ${st.lap}] (${offsetStr(t)}) RED FLAG - race suspended for about ${Math.round(st.seconds / 3600)} hours (not shown in the replay)`, color: "#ef4444" });
      }
    }
    // one timeline: RED over CAUTION over GREEN, then CHEQUERED until the last car is in
    const cuts = [...new Set([0, raceEnd, ...yellow.flat(), ...red.flat()].filter((x) => x >= 0 && x <= raceEnd))].sort((x, y) => x - y);
    const flags = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const [s0, e0] = [cuts[i], cuts[i + 1]];
      const mid = (s0 + e0) / 2;
      const state = red.some(([x, y]) => mid >= x && mid <= y) ? "RED" : yellow.some(([x, y]) => mid >= x && mid <= y) ? "YELLOW" : "GREEN";
      const prev = flags[flags.length - 1];
      if (prev && prev.flag_state === state) prev.end_elapsed = r3(e0);
      else flags.push({ session_id: session.id, flag_state: state, start_elapsed: r3(s0), end_elapsed: r3(e0) });
    }
    const lastIn = Math.max(0, ...prep.filter((p) => p.status === "finished").map((p) => elapsedByCar.get(p.b.car_number)?.get(p.lastLap) ?? 0));
    if (maxLap && lastIn > raceEnd) flags.push({ session_id: session.id, flag_state: "CHEQUERED", start_elapsed: r3(raceEnd), end_elapsed: r3(lastIn) });
    if (maxLap) notes.unshift({ t: 0, text: `[Lap 1] (${offsetStr(0)}) GREEN FLAG`, color: "#22c55e" });
    for (const p of pdf.penalties) {
      const t = at(p.lap - 1) ?? 0;
      notes.push({ t, text: `[Lap ${p.lap}] (${offsetStr(t)}) Car ${p.car}: Penalty - ${p.reason} - ${p.penalty}`, color: "#a855f7" });
    }
    if (maxLap) notes.push({ t: raceEnd, text: `[Lap ${maxLap}] (${offsetStr(raceEnd)}) CHEQUERED FLAG`, color: "#3b82f6" });
    counts.flags += (await insert("v2_flag_segments", flags)).length;
    if (notes.length) {
      const sectionRow = await insertOne("v2_annotation_sections", { session_id: session.id, title: "Race Control", sort_order: 0 });
      notes.sort((x, y) => x.t - y.t);
      counts.notes += (await insert("v2_annotation_items", notes.map((n, i) => ({ section_id: sectionRow.id, description: n.text, color: n.color, sort_order: i })))).length;
    }
    if (!Object.keys(sections).length) log(`  ! no section results for ${name}: no lap times / pit stops`);
  }
  log(`  ${JSON.stringify(counts)}`);
  return counts;
}

/* ── Main ────────────────────────────────────────────────────────────── */

const seasonsApi = await src.seasons();
if (!a.list) await loadEntities();
const series = a.list || a.preview ? null : await ensureSeries();
const totals = {};
for (const year of years) {
  const sy = seasonsApi.find((s) => String(s.Year) === String(year));
  if (!sy) throw new Error(`no ${year} season on indycar.com`);
  // championship races only (the 2024 $1 Million Challenge has no "Race" session)
  const events = [];
  for (const ev of sy.Events) {
    const race = (ev.Sessions || []).find((s) => s.SessionName === "Race");
    if (!race) continue;
    const api = await src.session(race.EventsSessionID);
    const raceNo = Number((ev.Sessions || []).map((s) => s.SessionName.match(/Race (\d)/)?.[1]).find(Boolean) || 0);
    events.push({ ev, date: isoDate(api.SessionDate), raceNo });
  }
  events.sort((x, y) => x.date.localeCompare(y.date) || x.raceNo - y.raceNo);
  if (a.list) {
    events.forEach((e, i) => console.log(`${year} R${String(i + 1).padStart(2)}  ${e.ev.EventID}  ${e.date}  ${e.ev.EventName}`));
    continue;
  }
  const season = a.preview ? { id: "preview" } : await ensureSeason(series.id, year);
  const engineByCar = new Map();
  for (const [i, e] of events.entries()) {
    if (a.event && String(e.ev.EventID) !== String(a.event)) {
      // still learn engines (cars appearing only in practice) from earlier races
      continue;
    }
    const c = await importEvent({ season, year, ev: e.ev, round: i + 1, engineByCar });
    if (c) for (const [k, v] of Object.entries(c)) totals[k] = (totals[k] || 0) + v;
  }
}
if (!a.list && !a.preview) {
  for (const [full_name, nationality] of Object.entries(NATIONALITY_FALLBACK)) {
    const d = cache.drivers.find((x) => same(x.full_name, full_name));
    if (d && !d.nationality) await store.from("v2_drivers").update({ nationality }).eq("id", d.id);
  }
}
if (!a.list) {
  log(`totals ${JSON.stringify(totals)}  (${JSON.stringify(src.stats())})`);
  if (!a.preview) await store.flush();
}
