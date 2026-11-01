#!/usr/bin/env node
/**
 * Create (or find) the series, season, season classes, circuit and event an
 * import needs, in the repo data store, and print the event id.
 *
 *   node --experimental-strip-types scripts/add-event.mjs \
 *     --series "IMSA WeatherTech SportsCar Championship" --year 2025 \
 *     --event "2025 Acura Grand Prix of Long Beach" --round 3 \
 *     --start 2025-04-11 --end 2025-04-12 --circuit "Long Beach Street Circuit" \
 *     [--short-name "Long Beach GP"] [--classes GTP,LMP2,GTDPRO,GTD] \
 *     [--series-short IMSA] [--location "Long Beach, California" --country "United States" --lat 33.77 --lon -118.19] \
 *     [--dry-run]
 *
 * Existing rows are matched case-insensitively: the series by name, short name
 * or a v2_series_aliases alias; the season by series + year; classes by name;
 * the circuit by name; the event by season + name, or season + round + start
 * date. Only what is missing is created. New events are 'published'.
 * Then import results with scripts/import-event.mjs --event <id> --url <Al Kamel URL>.
 */
import { parseArgs } from "node:util";
import { openStore } from "./lib/local-store.mjs";

const { values: a } = parseArgs({
  options: {
    series: { type: "string" },
    "series-short": { type: "string" },
    year: { type: "string" },
    event: { type: "string" },
    "short-name": { type: "string" },
    round: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    circuit: { type: "string" },
    location: { type: "string" },
    country: { type: "string" },
    lat: { type: "string" },
    lon: { type: "string" },
    classes: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const usage = () => {
  console.error("usage: scripts/add-event.mjs --series <name> --year <yyyy> --event <name> --circuit <name> [--round N] [--start yyyy-mm-dd] [--end yyyy-mm-dd] [--short-name s] [--classes A,B] [--dry-run]");
  process.exit(a.help ? 0 : 2);
};
if (a.help || !a.series || !a.year || !a.event || !a.circuit) usage();
for (const k of ["start", "end"]) if (a[k] && !/^\d{4}-\d{2}-\d{2}$/.test(a[k])) throw new Error(`--${k} must be yyyy-mm-dd`);
const year = Number(a.year);
if (!Number.isInteger(year)) throw new Error("--year must be a number");

const store = openStore({ writable: true });
const all = async (t, q = (x) => x) => {
  const { data, error } = await q(store.from(t).select("*"));
  if (error) throw new Error(`${t}: ${error.message}`);
  return data || [];
};
const same = (x, y) => String(x ?? "").trim().toLowerCase() === String(y ?? "").trim().toLowerCase();
const insert = async (table, row) => {
  const { data, error } = await store.from(table).insert(row).select("*").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
};
const report = [];
const note = (what, row, created) => report.push(`${created ? "created" : "found  "} ${what.padEnd(8)} ${row.id}  ${row.name ?? row.class_name ?? row.year ?? ""}`);

/* series */
const seriesRows = await all("v2_series");
let series = seriesRows.filter((s) => same(s.name, a.series));
if (series.length === 0) series = seriesRows.filter((s) => same(s.short_name, a.series));
if (series.length === 0) {
  const aliases = (await all("v2_series_aliases")).filter((x) => same(x.alias, a.series));
  series = seriesRows.filter((s) => aliases.some((x) => x.series_id === s.id));
}
if (series.length > 1) throw new Error(`"${a.series}" matches several series: ${series.map((s) => s.name).join(", ")}. Use the full name.`);
let seriesRow = series[0];
if (seriesRow) note("series", seriesRow, false);
else {
  seriesRow = await insert("v2_series", { name: a.series.trim(), short_name: a["series-short"] || null });
  note("series", seriesRow, true);
}

/* season */
const classes = (a.classes || "").split(",").map((c) => c.trim()).filter(Boolean);
let season = (await all("v2_seasons", (q) => q.eq("series_id", seriesRow.id).eq("year", year)))[0];
if (season) note("season", season, false);
else {
  season = await insert("v2_seasons", { series_id: seriesRow.id, year, cdm: null, is_multiclass: classes.length > 1, is_spec_series: false, spec_car_id: null });
  note("season", season, true);
}

/* season classes (colour copied from the same class in another season) */
if (classes.length) {
  const allClasses = await all("v2_season_classes");
  const mine = allClasses.filter((c) => c.season_id === season.id);
  for (const [i, name] of classes.entries()) {
    const found = mine.find((c) => same(c.class_name, name));
    if (found) {
      note("class", found, false);
      continue;
    }
    const template = allClasses.filter((c) => same(c.class_name, name)).sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))[0];
    const row = await insert("v2_season_classes", { season_id: season.id, class_name: name, sort_order: i, color: template?.color ?? null, cdm: template?.cdm ?? null });
    note("class", row, true);
  }
}

/* circuit (+ its layout when it has exactly one) */
let circuit = (await all("v2_circuits")).find((c) => same(c.name, a.circuit));
if (circuit) note("circuit", circuit, false);
else {
  circuit = await insert("v2_circuits", {
    name: a.circuit.trim(),
    location: a.location || null,
    country: a.country || null,
    layout_image_url: null,
    length_km: null,
    latitude: a.lat != null ? Number(a.lat) : null,
    longitude: a.lon != null ? Number(a.lon) : null,
  });
  note("circuit", circuit, true);
}
const layouts = await all("v2_circuit_layouts", (q) => q.eq("circuit_id", circuit.id));

/* event */
const seasonEvents = await all("v2_events", (q) => q.eq("season_id", season.id));
let event =
  seasonEvents.find((e) => same(e.name, a.event)) ||
  (a.round && a.start ? seasonEvents.find((e) => String(e.round_number) === String(a.round) && e.start_date === a.start) : undefined);
if (event) note("event", event, false);
else {
  event = await insert("v2_events", {
    season_id: season.id,
    circuit_id: circuit.id,
    name: a.event.trim(),
    short_name: a["short-name"] || null,
    round_number: a.round ?? null,
    start_date: a.start || null,
    end_date: a.end || a.start || null,
    description: null,
    status: "published",
    layout_id: layouts.length === 1 ? layouts[0].id : null,
  });
  note("event", event, true);
}

console.error(report.join("\n"));
if (a["dry-run"]) console.error("dry run: nothing written");
else await store.flush();
console.log(event.id);
