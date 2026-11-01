#!/usr/bin/env node
/**
 * Import an Al Kamel results page (IMSA and other Al Kamel hosts) into the
 * repo data store, with the same importer the import-imsa-results edge
 * function uses (supabase/functions/import-imsa-results/core.ts).
 *
 *   node --experimental-strip-types scripts/import-event.mjs \
 *     --event <v2_events.id> --url "<Al Kamel event page URL>" \
 *     [--preview] [--replace] [--weather] [--draft] [--cache <dir>] [--quiet]
 *
 *   --preview  fetch and count what would be imported; writes nothing
 *   --replace  first delete the event's sessions and all their rows (results,
 *              lap times, stints, pit stops, flags, weather, race control),
 *              since the importer skips sessions the event already has
 *   --weather  afterwards, fill Open-Meteo weather for sessions that got no
 *              weather from the Al Kamel weather file
 *   --draft    create sessions as 'draft' (default: 'published')
 *   --cache    keep downloaded Al Kamel files in <dir> and reuse them on reruns
 *
 * Event URLs for every importable event are in docs/DATA-SOURCES.md; create
 * the event first with scripts/add-event.mjs. Afterwards run
 *   node --experimental-strip-types scripts/recompute-fingerprints.mjs
 * and review `git diff --stat data/` before committing.
 *
 * The optional Flags Analysis PDF OCR step only runs when LOVABLE_API_KEY is
 * set; without it, flags come from the Flags JSON or the time cards.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ROOT, openStore } from "./lib/local-store.mjs";
import { ImportError, importEvent } from "../supabase/functions/import-imsa-results/core.ts";
import { fetchSessionWeather } from "../supabase/functions/fetch-session-weather/core.ts";

const { values: a } = parseArgs({
  options: {
    event: { type: "string" },
    url: { type: "string" },
    preview: { type: "boolean", default: false },
    replace: { type: "boolean", default: false },
    weather: { type: "boolean", default: false },
    draft: { type: "boolean", default: false },
    cache: { type: "string" },
    quiet: { type: "boolean", short: "q", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});
if (a.help || !a.event || !a.url) {
  console.error('usage: scripts/import-event.mjs --event <id> --url "<Al Kamel event URL>" [--preview] [--replace] [--weather] [--draft] [--cache <dir>]');
  process.exit(a.help ? 0 : 2);
}

/* ── polite fetch: at most 4 requests at a time, optional on-disk cache ── */
let active = 0;
let requests = 0;
let cacheHits = 0;
const waiting = [];
async function limited(fn) {
  if (active >= 4) await new Promise((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}
if (a.cache) fs.mkdirSync(a.cache, { recursive: true });
async function politeFetch(input, init) {
  const url = typeof input === "string" ? input : input.url;
  const cacheable = a.cache && (!init?.method || init.method === "GET");
  const file = cacheable ? path.join(a.cache, crypto.createHash("sha1").update(url).digest("hex")) : null;
  if (file && fs.existsSync(file)) {
    cacheHits++;
    return new Response(fs.readFileSync(file), { status: 200 });
  }
  return limited(async () => {
    requests++;
    const res = await fetch(input, init);
    if (!file || !res.ok) return res;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(file, buf);
    return new Response(buf, { status: res.status, headers: res.headers });
  });
}

/* ── store helpers ── */
const store = openStore({ writable: true });
const schema = await store.db.schema();
const exists = (t) => !!schema.tables[t];
const SESSION_TABLES = [
  "v2_race_results", "v2_qualifying_results", "v2_practice_results", "v2_lap_times", "v2_stints", "v2_pit_stops",
  "v2_flag_segments", "v2_session_weather", "v2_session_summaries", "v2_fastest_laps", "v2_incidents",
];
const COUNTED = ["v2_sessions", ...SESSION_TABLES.filter(exists), "v2_annotation_sections", "v2_annotation_items", "v2_drivers", "v2_teams", "v2_cars", "v2_team_season_cars"];
const counts = async () => Object.fromEntries(await Promise.all(COUNTED.filter(exists).map(async (t) => [t, (await store.db.rows(t)).length])));
const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

/** Delete an event's sessions and every row that hangs off them. */
async function deleteEventSessions(eventId) {
  const ids = (must(await store.from("v2_sessions").select("id").eq("event_id", eventId), "sessions") || []).map((s) => s.id);
  if (ids.length === 0) return 0;
  const sections = must(await store.from("v2_annotation_sections").select("id").in("session_id", ids), "sections") || [];
  if (sections.length) must(await store.from("v2_annotation_items").delete().in("section_id", sections.map((s) => s.id)), "items");
  for (const t of [...SESSION_TABLES, "v2_annotation_sections"].filter(exists)) must(await store.from(t).delete().in("session_id", ids), t);
  must(await store.from("v2_sessions").update({ qualifying_session_id: null }).in("qualifying_session_id", ids), "sessions");
  must(await store.from("v2_sessions").delete().in("id", ids), "sessions");
  return ids.length;
}

function dirSize(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}

/* ── run ── */
const { data: event } = await store.from("v2_events").select("id, name").eq("id", a.event).maybeSingle();
if (!event) {
  console.error(`event ${a.event} not found (create it with scripts/add-event.mjs)`);
  process.exit(1);
}
const log = a.quiet ? () => {} : (...m) => console.error(...m);
const dataDir = path.join(ROOT, "data");
const sizeBefore = dirSize(dataDir);
const before = await counts();

if (a.replace) {
  const n = await deleteEventSessions(a.event);
  console.error(`replace: deleted ${n} existing session(s) of "${event.name}" and their rows${a.preview ? " (preview: not saved)" : ""}`);
}

let summary;
try {
  summary = await importEvent({ url: a.url, event_id: a.event, mode: a.preview ? "preview" : undefined }, store, {
    fetch: politeFetch,
    log,
    logError: (...m) => console.error(...m),
    aiKey: process.env.LOVABLE_API_KEY || null,
    sessionStatus: a.draft ? "draft" : "published",
  });
} catch (e) {
  if (e instanceof ImportError) {
    console.error(JSON.stringify(e.body, null, 2));
    process.exit(1);
  }
  throw e;
}

if (a.weather && !a.preview) {
  const sessions = must(await store.from("v2_sessions").select("id, name").eq("event_id", a.event), "sessions") || [];
  const have = new Set((must(await store.from("v2_session_weather").select("session_id").in("session_id", sessions.map((s) => s.id)), "weather") || []).map((w) => w.session_id));
  for (const s of sessions.filter((s) => !have.has(s.id))) {
    try {
      const w = await fetchSessionWeather(s.id, store, { fetch: politeFetch });
      console.error(`weather (Open-Meteo) ${s.name}: ${w.condition_emoji} ${w.condition_summary}`);
    } catch (e) {
      console.error(`weather (Open-Meteo) ${s.name}: ${e.message}`);
    }
  }
}

const after = await counts();
console.log(JSON.stringify(summary, null, 2));
console.error("\nrows (before -> after):");
for (const t of Object.keys(after)) if (after[t] !== before[t]) console.error(`  ${t.padEnd(24)} ${before[t] ?? 0} -> ${after[t]} (${after[t] - (before[t] ?? 0) >= 0 ? "+" : ""}${after[t] - (before[t] ?? 0)})`);
console.error(`requests: ${requests}${a.cache ? `, cache hits: ${cacheHits}` : ""}`);

if (a.preview) {
  console.error("preview: nothing written");
} else {
  await store.flush();
  const growth = dirSize(dataDir) - sizeBefore;
  console.error(`saved. data/ ${growth >= 0 ? "+" : ""}${(growth / 1048576).toFixed(2)} MB`);
  console.error("next: node --experimental-strip-types scripts/recompute-fingerprints.mjs");
}
