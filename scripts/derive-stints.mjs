#!/usr/bin/env node
/**
 * Derive v2_stints for single-driver races that have lap times and pit stops
 * but no stint data (NASCAR, INDYCAR): one stint per run between pit visits,
 * driven by the car's (only) driver.
 *   node --experimental-strip-types scripts/derive-stints.mjs
 */
import { openStore } from "./lib/local-store.mjs";

const store = openStore({ writable: true });
const all = async (t, sel = "*") => (await store.from(t).select(sel)).data || [];
const sessions = (await all("v2_sessions")).filter((s) => !s.parent_session_id && ["race", "sprint_race", "endurance_race"].includes(s.session_type));
const schema = await store.db.schema();
const hasStints = new Set(schema.tables.v2_stints?.partitions || []);
const hasLaps = new Set(schema.tables.v2_lap_times?.partitions || []);
const hasPits = new Set(schema.tables.v2_pit_stops?.partitions || []);

let made = 0, races = 0;
const rows = [];
for (const s of sessions) {
  if (hasStints.has(s.id) || !hasLaps.has(s.id) || !hasPits.has(s.id)) continue;
  const results = (await store.from("v2_race_results").select("car_number, driver_id").eq("session_id", s.id)).data || [];
  const drivers = new Map();
  for (const r of results) {
    const k = String(r.car_number);
    if (!drivers.has(k)) drivers.set(k, new Set());
    if (r.driver_id) drivers.get(k).add(r.driver_id);
  }
  // only single-driver cars: multi-driver races need real stint data
  if ([...drivers.values()].some((d) => d.size > 1)) continue;
  const laps = (await store.from("v2_lap_times").select("car_number, lap_number, elapsed").eq("session_id", s.id)).data || [];
  const pits = (await store.from("v2_pit_stops").select("car_number, lap_number, pit_in_elapsed, pit_out_elapsed").eq("session_id", s.id)).data || [];
  const lapsBy = new Map();
  for (const l of laps) {
    const k = String(l.car_number);
    if (!lapsBy.has(k)) lapsBy.set(k, []);
    lapsBy.get(k).push(l);
  }
  races++;
  for (const [car, ls] of lapsBy) {
    ls.sort((a, b) => a.lap_number - b.lap_number);
    const driver = [...(drivers.get(car) || [])][0] || null;
    const finish = ls[ls.length - 1];
    const stops = pits
      .filter((p) => String(p.car_number) === car && p.pit_in_elapsed != null)
      .sort((a, b) => a.pit_in_elapsed - b.pit_in_elapsed)
      .filter((p, i, arr) => i === 0 || Math.abs(p.pit_in_elapsed - arr[i - 1].pit_in_elapsed) > 5);
    let start = 0, startLap = 1;
    for (const p of stops) {
      if (p.pit_in_elapsed <= start) continue;
      rows.push({ session_id: s.id, car_number: car, driver_id: driver, start_elapsed: start, end_elapsed: p.pit_in_elapsed, start_lap: startLap, end_lap: p.lap_number ?? null });
      start = p.pit_out_elapsed ?? p.pit_in_elapsed;
      startLap = (p.lap_number ?? startLap) + 1;
    }
    if (finish && finish.elapsed > start)
      rows.push({ session_id: s.id, car_number: car, driver_id: driver, start_elapsed: start, end_elapsed: finish.elapsed, start_lap: startLap, end_lap: finish.lap_number });
  }
}
for (let i = 0; i < rows.length; i += 2000) {
  await store.from("v2_stints").insert(rows.slice(i, i + 2000));
  made += Math.min(2000, rows.length - i);
}
await store.flush();
console.log(`stints: ${made} derived across ${races} races`);
