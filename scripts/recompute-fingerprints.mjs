#!/usr/bin/env node
/**
 * Recompute driver fingerprints from the repo data store and write them to
 * data/v2_driver_fingerprints.ndjson (merged by driver_id, ids preserved).
 *
 *   node --experimental-strip-types scripts/recompute-fingerprints.mjs [driverId…]
 */
import { openStore } from "./lib/local-store.mjs";
import { recomputeDriverFingerprints } from "../supabase/functions/_shared/driver-fingerprint.ts";

const store = openStore({ writable: true });
const all = async (t) => (await store.from(t).select("*")).data || [];

const [race, quali, practice, sessions, events, seasons, classes, layouts, weather, stints] = await Promise.all(
  ["v2_race_results", "v2_qualifying_results", "v2_practice_results", "v2_sessions", "v2_events", "v2_seasons", "v2_season_classes", "v2_circuit_layouts", "v2_session_weather", "v2_stints"].map(all),
);
const lapCache = new Map();
const laps = await Promise.all(sessions.map(async (s) => [s.id, (await store.from("v2_lap_times").select("*").eq("session_id", s.id)).data || []]));
for (const [id, rows] of laps) lapCache.set(id, rows);

const driverIds = process.argv.slice(2);
const now = new Date().toISOString();
const rows = recomputeDriverFingerprints(
  {
    race_results: race, qualifying_results: quali, practice_results: practice, sessions, events, seasons,
    season_classes: classes, circuit_layouts: layouts, session_weather: weather, stints,
    lap_times: (sessionId) => lapCache.get(sessionId) || [],
  },
  { driverIds: driverIds.length ? driverIds : undefined, now },
);

let updated = 0, inserted = 0;
for (const r of rows) {
  const existing = (await store.from("v2_driver_fingerprints").select("id").eq("driver_id", r.driver_id).maybeSingle()).data;
  if (existing) {
    await store.from("v2_driver_fingerprints").update({ ...r, updated_at: now }).eq("driver_id", r.driver_id);
    updated++;
  } else {
    await store.from("v2_driver_fingerprints").insert({ ...r, created_at: now, updated_at: now });
    inserted++;
  }
}
await store.flush();
console.log(`fingerprints: ${updated} updated, ${inserted} inserted (${rows.length} drivers)`);
