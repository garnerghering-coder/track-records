#!/usr/bin/env node
/**
 * Import results for any series from a normalized JSON file into the repo data store.
 *
 * Series whose official sites publish classifications but no public timing feed (Formula E,
 * FIA F2/F3, WEC, Supercars, Super Formula, WRC) are scraped by small per-series scripts in
 * scripts/scrapers/ (run in a browser on the official site) that all emit this one format.
 * This script does the entity work once: series, season, circuit + layout, event, sessions,
 * drivers / teams / cars (matched to existing rows accent- and case-insensitively and through
 * search_aliases, so careers join up across series), and the result rows.
 *
 *   node --experimental-strip-types scripts/import-normalized.mjs --file feed.json[.gz] \
 *     [--replace] [--preview] [--season 2026] [--event "2026 London E-Prix"]
 *
 * Format (all keys optional unless marked *):
 * {
 *   "series": { "name"*, "short_name"*, "aliases": [] },
 *   "seasons": [{ "year"*, "is_multiclass", "classes": [{ "name", "color" }],
 *     "events": [{ "name"*, "short_name", "round", "start_date", "end_date", "description",
 *       "circuit": { "name"*, "aliases": [], "location", "country", "latitude", "longitude",
 *                    "layout": { "name", "length_km", "turns" } },
 *       "sessions": [{ "name"*, "type"* (race|sprint_race|endurance_race|qualifying|practice),
 *         "date", "start_time", "end_time", "source_url",
 *         "results": [{ "position", "position_text", "status" (finished|classified|dnf|dns|dsq),
 *           "dnf_reason", "car_number", "driver"*: { "name"*, "nationality", "date_of_birth" },
 *           "drivers": [ ...co-drivers, same shape (endurance) ], "team", "car": { "manufacturer", "model" },
 *           "laps", "total_time", "gap", "best_lap", "grid", "points", "class", "class_position",
 *           "extra": {} }] }] }] }]
 * }
 * Endurance entries with several drivers get one row per driver (same position), as the
 * IMSA importer stores them.
 */
import fs from "node:fs";
import zlib from "node:zlib";
import { parseArgs } from "node:util";
import { openStore } from "./lib/local-store.mjs";

const { values: a } = parseArgs({
  options: {
    file: { type: "string", multiple: true },
    replace: { type: "boolean", default: false },
    preview: { type: "boolean", default: false },
    season: { type: "string" },
    event: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});
if (a.help || !a.file?.length) {
  console.error("usage: scripts/import-normalized.mjs --file <feed.json[.gz]> [--file …] [--replace] [--preview] [--season YYYY] [--event NAME]");
  process.exit(a.help ? 0 : 2);
}
const log = (...m) => console.error(...m);

export const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`.]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const same = (x, y) => norm(x) === norm(y) && norm(x) !== "";

const store = openStore({ writable: !a.preview });
const all = async (t) => {
  const { data, error } = await store.from(t).select("*");
  if (error) throw new Error(`${t}: ${error.message}`);
  return data || [];
};
let fakeId = 0;
const insert = async (table, rows) => {
  if (!rows.length) return [];
  if (a.preview) return rows.map((r) => ({ id: `preview-${++fakeId}`, ...r }));
  const out = [];
  for (let i = 0; i < rows.length; i += 5000) {
    const { data, error } = await store.from(table).insert(rows.slice(i, i + 5000)).select("*");
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
  }
  return out;
};
const insertOne = async (table, row) => (await insert(table, [row]))[0];
const update = async (table, id, patch) => {
  if (a.preview) return;
  const { error } = await store.from(table).update(patch).eq("id", id);
  if (error) throw new Error(`${table}: ${error.message}`);
};

const stats = { events_created: 0, events_updated: 0, events_skipped: 0, sessions: 0, drivers_created: [], teams_created: [], cars_created: [], circuits_created: [], rows: {} };
const bump = (t, n) => (stats.rows[t] = (stats.rows[t] || 0) + n);

/* ── cached entities ── */
const C = {};
async function load() {
  for (const t of ["v2_series", "v2_series_aliases", "v2_seasons", "v2_season_classes", "v2_circuits", "v2_circuit_layouts", "v2_events", "v2_sessions", "v2_drivers", "v2_teams", "v2_cars", "v2_team_season_cars", "search_aliases"]) C[t] = await all(t);
}
const aliasTarget = (type, name) => {
  const al = C.search_aliases.find((x) => x.entity_type === type && same(x.alias, name));
  return al ? al.canonical : null;
};

async function ensureSeries(s) {
  let row =
    C.v2_series.find((x) => same(x.name, s.name)) ||
    C.v2_series.find((x) => C.v2_series_aliases.some((al) => al.series_id === x.id && (same(al.alias, s.name) || (s.aliases || []).some((y) => same(al.alias, y)))));
  if (!row) {
    row = await insertOne("v2_series", { name: s.name, short_name: s.short_name });
    C.v2_series.push(row);
    log(`+ series ${s.name}`);
  }
  const have = C.v2_series_aliases.filter((x) => x.series_id === row.id);
  const add = (s.aliases || []).filter((al) => !have.some((x) => same(x.alias, al))).map((alias) => ({ series_id: row.id, alias }));
  C.v2_series_aliases.push(...(await insert("v2_series_aliases", add)));
  return row;
}

async function ensureSeason(series, s) {
  let row = C.v2_seasons.find((x) => x.series_id === series.id && Number(x.year) === Number(s.year));
  const multi = !!s.is_multiclass || (s.classes || []).length > 1;
  if (!row) {
    row = await insertOne("v2_seasons", { series_id: series.id, year: Number(s.year), cdm: null, is_multiclass: multi, is_spec_series: !!s.is_spec_series, spec_car_id: null });
    C.v2_seasons.push(row);
    log(`+ season ${series.short_name} ${s.year}`);
  } else if (multi && !row.is_multiclass) await update("v2_seasons", row.id, { is_multiclass: true });
  const have = C.v2_season_classes.filter((x) => x.season_id === row.id);
  const add = (s.classes || [])
    .map((c, i) => ({ season_id: row.id, class_name: c.name, sort_order: i + 1, color: c.color || null, cdm: null }))
    .filter((c) => !have.some((x) => same(x.class_name, c.class_name)));
  C.v2_season_classes.push(...(await insert("v2_season_classes", add)));
  return row;
}

async function ensureCircuit(c) {
  const names = [c.name, ...(c.aliases || [])];
  let circuit = C.v2_circuits.find((x) => names.some((n) => same(x.name, n)));
  if (!circuit) {
    circuit = await insertOne("v2_circuits", {
      name: c.name, location: c.location ?? null, country: c.country ?? null, layout_image_url: null, length_km: c.layout?.length_km ?? null,
      latitude: c.latitude ?? null, longitude: c.longitude ?? null,
    });
    C.v2_circuits.push(circuit);
    stats.circuits_created.push(c.name);
  }
  const mine = C.v2_circuit_layouts.filter((l) => l.circuit_id === circuit.id);
  const want = c.layout?.name;
  let layout = want ? mine.find((l) => same(l.name, want)) : null;
  if (!layout && !want && mine.length === 1) layout = mine[0];
  if (!layout && want && mine.length === 1 && !c.layout?.strict && (!c.layout.length_km || !mine[0].length_km || Math.abs(mine[0].length_km - c.layout.length_km) < 0.05)) layout = mine[0];
  if (!layout) {
    layout = await insertOne("v2_circuit_layouts", {
      circuit_id: circuit.id, name: want || "Circuit", length_km: c.layout?.length_km ?? null, turns: c.layout?.turns ?? null,
      total_straight_length_km: null, total_elevation_change_m: null, heavy_braking_corners: null, layout_image_url: null, sort_order: mine.length + 1,
    });
    C.v2_circuit_layouts.push(layout);
    log(`  + layout ${circuit.name} / ${layout.name}`);
  }
  return { circuit, layout };
}

async function driverId(d) {
  if (!d?.name) return null;
  const name = d.name.trim();
  let row = C.v2_drivers.find((x) => same(x.full_name, name));
  if (!row) {
    const t = aliasTarget("driver", name);
    if (t) row = C.v2_drivers.find((x) => x.id === t || same(x.full_name, t));
  }
  if (!row) {
    row = await insertOne("v2_drivers", { full_name: name, short_name: null, nationality: d.nationality ?? null, date_of_birth: d.date_of_birth ?? null });
    C.v2_drivers.push(row);
    stats.drivers_created.push(name);
  } else if ((!row.nationality && d.nationality) || (!row.date_of_birth && d.date_of_birth)) {
    const patch = {};
    if (!row.nationality && d.nationality) patch.nationality = d.nationality;
    if (!row.date_of_birth && d.date_of_birth) patch.date_of_birth = d.date_of_birth;
    await update("v2_drivers", row.id, patch);
    Object.assign(row, patch);
  }
  return row.id;
}

async function teamId(name) {
  if (!name) return null;
  let row = C.v2_teams.find((x) => same(x.full_name, name));
  if (!row) {
    const t = aliasTarget("team", name);
    if (t) row = C.v2_teams.find((x) => x.id === t || same(x.full_name, t));
  }
  if (!row) {
    row = await insertOne("v2_teams", { full_name: name });
    C.v2_teams.push(row);
    stats.teams_created.push(name);
  }
  return row.id;
}

async function carId(car) {
  if (!car?.manufacturer && !car?.model) return null;
  let row = C.v2_cars.find((x) => same(x.manufacturer, car.manufacturer) && same(x.model_name, car.model));
  if (!row) {
    row = await insertOne("v2_cars", { manufacturer: car.manufacturer ?? null, model_name: car.model ?? null });
    C.v2_cars.push(row);
    stats.cars_created.push(`${car.manufacturer ?? ""} ${car.model ?? ""}`.trim());
  }
  return row.id;
}

async function linkTeamCar(seasonId, team, car) {
  if (!team || !car || C.v2_team_season_cars.some((x) => x.season_id === seasonId && x.team_id === team && x.car_id === car)) return;
  C.v2_team_season_cars.push(await insertOne("v2_team_season_cars", { team_id: team, car_id: car, season_id: seasonId }));
}

async function deleteEventSessions(eventId) {
  if (a.preview) return 0;
  const ids = C.v2_sessions.filter((s) => s.event_id === eventId).map((s) => s.id);
  if (!ids.length) return 0;
  const sections = (await all("v2_annotation_sections")).filter((s) => ids.includes(s.session_id)).map((s) => s.id);
  if (sections.length) await store.from("v2_annotation_items").delete().in("section_id", sections);
  for (const t of ["v2_annotation_sections", "v2_race_results", "v2_qualifying_results", "v2_practice_results", "v2_lap_times", "v2_pit_stops", "v2_stints", "v2_flag_segments", "v2_session_weather", "v2_session_summaries"])
    await store.from(t).delete().in("session_id", ids);
  await store.from("v2_sessions").delete().in("id", ids);
  C.v2_sessions = C.v2_sessions.filter((s) => !ids.includes(s.id));
  return ids.length;
}

const RACE_TYPES = new Set(["race", "sprint_race", "endurance_race"]);
const STATUS = new Set(["finished", "classified", "dnf", "dns", "dsq"]);
const num = (x) => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));

async function importSession(event, season, s, sortOrder) {
  if (!["race", "sprint_race", "endurance_race", "qualifying", "practice"].includes(s.type)) throw new Error(`${event.name} / ${s.name}: bad type ${s.type}`);
  const session = await insertOne("v2_sessions", {
    event_id: event.id, name: s.name, session_type: s.type, status: "published", sort_order: sortOrder,
    source_document_url: s.source_url ?? null, date: s.date ? `${s.date}T00:00:00+00:00` : null, start_time: s.start_time ?? null, end_time: s.end_time ?? null,
    layout_id: event.layout_id, parent_session_id: null,
  });
  C.v2_sessions.push(session);
  stats.sessions++;
  const rows = [];
  for (const r of s.results || []) {
    const team = await teamId(r.team);
    const car = await carId(r.car);
    await linkTeamCar(season.id, team, car);
    const extra = { ...(r.extra || {}) };
    if (r.class) extra.Class = r.class;
    if (r.class_position != null) extra.PIC = num(r.class_position);
    else if (r.position != null && !r.class) extra.PIC = num(r.position);
    if (r.grid != null && RACE_TYPES.has(s.type)) extra.grid = num(r.grid);
    if (r.position_text) extra.position_text = String(r.position_text);
    const base = { session_id: session.id, position: num(r.position), team_id: team, car_id: car, car_number: r.car_number != null ? String(r.car_number) : null };
    for (const d of [r.driver, ...(r.drivers || [])].filter(Boolean)) {
      const did = await driverId(d);
      if (RACE_TYPES.has(s.type)) {
        const status = STATUS.has(r.status) ? r.status : "finished";
        rows.push({
          ...base, driver_id: did, points: num(r.points), status, laps_completed: num(r.laps), gap_to_leader: r.gap ?? null, pit_stops: num(r.pit_stops),
          fastest_lap_time: r.best_lap ?? null, total_time: r.total_time ?? null, dnf_reason: status === "finished" || status === "classified" ? null : r.dnf_reason ?? null, extra_data: extra,
        });
      } else if (s.type === "qualifying") {
        rows.push({ ...base, driver_id: did, best_time: r.best_lap ?? r.total_time ?? null, gap_to_pole: r.gap ?? null, laps_run: num(r.laps), points: num(r.points), extra_data: extra });
      } else {
        rows.push({ ...base, driver_id: did, best_lap_time: r.best_lap ?? r.total_time ?? null, gap_to_p1: r.gap ?? null, laps_run: num(r.laps), points: null, extra_data: extra });
      }
    }
  }
  const table = RACE_TYPES.has(s.type) ? "v2_race_results" : s.type === "qualifying" ? "v2_qualifying_results" : "v2_practice_results";
  await insert(table, rows);
  bump(table, rows.length);
  return rows.length;
}

/* ── run ── */
await load();
for (const file of a.file) {
  const buf = fs.readFileSync(file);
  const feed = JSON.parse((file.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8"));
  const series = await ensureSeries(feed.series);
  for (const s of feed.seasons) {
    if (a.season && String(s.year) !== a.season) continue;
    const season = await ensureSeason(series, s);
    for (const e of s.events) {
      if (a.event && !same(e.name, a.event)) continue;
      if (!(e.sessions || []).some((x) => (x.results || []).length)) {
        log(`skip ${e.name}: no results`);
        continue;
      }
      const { circuit, layout } = await ensureCircuit(e.circuit);
      let event = C.v2_events.find((x) => x.season_id === season.id && (same(x.name, e.name) || (e.round != null && String(x.round_number) === String(e.round) && x.circuit_id === circuit.id)));
      const fields = {
        season_id: season.id, circuit_id: circuit.id, layout_id: layout.id, name: e.name, short_name: e.short_name ?? null, round_number: e.round != null ? String(e.round) : null,
        start_date: e.start_date ?? null, end_date: e.end_date ?? e.start_date ?? null, description: e.description ?? null, status: "published",
      };
      if (event) {
        const has = C.v2_sessions.some((x) => x.event_id === event.id);
        if (has && !a.replace) {
          stats.events_skipped++;
          continue;
        }
        if (has) log(`  replace ${e.name}: deleted ${await deleteEventSessions(event.id)} session(s)`);
        await update("v2_events", event.id, fields);
        Object.assign(event, fields);
        stats.events_updated++;
      } else {
        event = await insertOne("v2_events", fields);
        C.v2_events.push(event);
        stats.events_created++;
      }
      let n = 0;
      const counts = [];
      for (const [i, x] of (e.sessions || []).entries()) {
        if (!(x.results || []).length) continue;
        counts.push(`${x.name} ${await importSession(event, season, x, i)}`);
        n++;
      }
      log(`${e.name} (${circuit.name}): ${counts.join(", ")}`);
    }
  }
}
if (!a.preview) await store.flush();
const short = (l) => (l.length > 25 ? `${l.slice(0, 25).join(", ")} … (+${l.length - 25})` : l.join(", "));
log(`\n${a.preview ? "preview: nothing written. " : ""}events: +${stats.events_created} created, ${stats.events_updated} replaced, ${stats.events_skipped} already there; sessions +${stats.sessions}`);
log(`rows: ${JSON.stringify(stats.rows)}`);
for (const k of ["drivers_created", "teams_created", "cars_created", "circuits_created"]) if (stats[k].length) log(`${k} (${stats[k].length}): ${short(stats[k])}`);
