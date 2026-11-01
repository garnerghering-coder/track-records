#!/usr/bin/env node
/**
 * Derived data computed from data/ at build time:
 *   public/data/derived/digests.json  — per-event race digests (winners, podiums, insights, stats)
 *   public/data/derived/standings/<seasonId>.json — each season's championship (drivers + teams per
 *     class, points per round), so pages need not download the full results tables
 *   public/data/derived/records/{drivers,teams,cars}/<id>.json — one entity's record (every race
 *     entry, names it references, driver poles, fingerprint and championship places)
 *   public/data/derived/records/index.json — compact directory for /drivers, /teams, /cars, Compare
 *   public/data/credits.md — docs/CREDITS.md for the /credits page
 * Run after build-data.mjs (npm scripts do this automatically).
 * Requires: node --experimental-strip-types
 */
import fs from "node:fs";
import path from "node:path";
import { openStore, ROOT } from "./lib/local-store.mjs";
import { digestEvent } from "../src/lib/insights.ts";
import { buildChampionship, loadSeasonStandingsInput } from "../src/lib/season-standings.ts";
import { buildRecordBook, buildRecordIndex, loadRecordTables, sliceRecordBook } from "../src/lib/record-book.ts";

// Credits page (/credits) reads docs/CREDITS.md, published as public/data/credits.md.
{
  const src = path.join(ROOT, "docs", "CREDITS.md");
  const dest = path.join(ROOT, "public", "data", "credits.md");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  else fs.rmSync(dest, { force: true });
}

const store = openStore();
const all = async (t) => (await store.from(t).select("*")).data || [];
const [events, sessions, race, quali, stints, pits, flags, layouts, liveries, classes, drivers, teams, cars] = await Promise.all(
  ["v2_events", "v2_sessions", "v2_race_results", "v2_qualifying_results", "v2_stints", "v2_pit_stops", "v2_flag_segments", "v2_circuit_layouts", "v2_car_liveries", "v2_season_classes", "v2_drivers", "v2_teams", "v2_cars"].map(all),
);
const lapCache = new Map();
const laps = async (sid) => {
  if (!lapCache.has(sid)) lapCache.set(sid, (await store.from("v2_lap_times").select("session_id, car_number, lap_number, elapsed").eq("session_id", sid)).data || []);
  return lapCache.get(sid);
};
const names = {
  drivers: Object.fromEntries(drivers.map((d) => [d.id, d.full_name])),
  teams: Object.fromEntries(teams.map((t) => [t.id, t.full_name])),
  cars: Object.fromEntries(cars.map((c) => [c.id, c.model_name])),
};
const out = {};
for (const ev of events.filter((e) => e.status === "published")) {
  const evSessions = sessions.filter((s) => s.event_id === ev.id);
  const ids = new Set(evSessions.map((s) => s.id));
  for (const s of evSessions) await laps(s.id);
  const layout = layouts.find((l) => l.id === ev.layout_id) || layouts.filter((l) => l.circuit_id === ev.circuit_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
  out[ev.id] = digestEvent({
    event: ev,
    sessions: evSessions,
    raceResults: race.filter((r) => ids.has(r.session_id)),
    qualifyingResults: quali.filter((r) => ids.has(r.session_id)),
    laps: (sid) => lapCache.get(sid) || [],
    stints: stints.filter((r) => ids.has(r.session_id)),
    pitStops: pits.filter((r) => ids.has(r.session_id)),
    flags: flags.filter((r) => ids.has(r.session_id)),
    layoutLengthKm: layout?.length_km ?? null,
    liveries: Object.fromEntries(liveries.filter((l) => l.season_id === ev.season_id).map((l) => [String(l.car_number), l.image_url])),
    classColors: Object.fromEntries(classes.filter((c) => c.season_id === ev.season_id && c.color).map((c) => [c.class_name, c.color])),
    names,
  });
}
const dir = path.join(ROOT, "public", "data", "derived");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "digests.json"), JSON.stringify(out));
const n = Object.values(out).reduce((a, d) => a + d.races.length, 0);
console.log(`derived: ${Object.keys(out).length} event digests, ${n} races`);

const standingsDir = path.join(dir, "standings");
fs.rmSync(standingsDir, { recursive: true, force: true });
fs.mkdirSync(standingsDir, { recursive: true });
const seasons = await all("v2_seasons");
let bytes = 0;
/** driverId → seasonId → [{ className, position, totalPoints }] */
const champPlaces = new Map();
for (const season of seasons) {
  const champ = buildChampionship(await loadSeasonStandingsInput(store, season.id));
  const json = JSON.stringify(champ);
  bytes += json.length;
  fs.writeFileSync(path.join(standingsDir, `${season.id}.json`), json);
  for (const [className, list] of Object.entries(champ.drivers))
    for (const e of list) {
      if (e.totalPoints <= 0) continue;
      const id = e.driverIds[0];
      if (!champPlaces.has(id)) champPlaces.set(id, {});
      (champPlaces.get(id)[season.id] ??= []).push({ className, position: e.position, totalPoints: e.totalPoints });
    }
}
console.log(`derived: ${seasons.length} season standings (${Math.round(bytes / 1024)} KB)`);

// Per-entity records, so record pages need not download the full results tables.
const recordsDir = path.join(dir, "records");
fs.rmSync(recordsDir, { recursive: true, force: true });
const book = buildRecordBook(await loadRecordTables(store));
let recBytes = 0;
let recMax = { bytes: 0, file: "" };
let recCount = 0;
for (const [kind, map, all] of [
  ["drivers", book.byDriver, Object.keys(book.drivers)],
  ["teams", book.byTeam, Object.keys(book.teams)],
  ["cars", book.byCar, Object.keys(book.cars)],
]) {
  fs.mkdirSync(path.join(recordsDir, kind), { recursive: true });
  for (const id of new Set([...all, ...map.keys()])) {
    const slice = sliceRecordBook(book, kind, id, kind === "drivers" ? champPlaces.get(id) || {} : undefined);
    const json = JSON.stringify(slice);
    recBytes += json.length;
    recCount++;
    if (json.length > recMax.bytes) recMax = { bytes: json.length, file: `${kind}/${id}` };
    fs.writeFileSync(path.join(recordsDir, kind, `${id}.json`), json);
  }
}
const indexJson = JSON.stringify(buildRecordIndex(book));
fs.writeFileSync(path.join(recordsDir, "index.json"), indexJson);
console.log(
  `derived: ${recCount} entity records (${Math.round(recBytes / 1024)} KB, largest ${Math.round(recMax.bytes / 1024)} KB ${recMax.file}), index ${Math.round(indexJson.length / 1024)} KB`,
);
