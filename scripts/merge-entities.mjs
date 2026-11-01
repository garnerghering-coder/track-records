#!/usr/bin/env node
/**
 * Merge duplicate drivers or teams in the repo data store.
 *   node --experimental-strip-types scripts/merge-entities.mjs team  <keepId> <dropId> [--name "Canonical name"]
 *   node --experimental-strip-types scripts/merge-entities.mjs driver <keepId> <dropId> [--name "Canonical name"]
 *   node --experimental-strip-types scripts/merge-entities.mjs circuit <keepId> <dropId>
 *   node --experimental-strip-types scripts/merge-entities.mjs layout <keepId> <dropId>
 * Re-points every reference, records the dropped name as a search alias,
 * deletes the dropped row. Run recompute-fingerprints afterwards for drivers.
 */
import { openStore } from "./lib/local-store.mjs";

const [kind, keepId, dropId] = process.argv.slice(2);
const nameIdx = process.argv.indexOf("--name");
const newName = nameIdx > 0 ? process.argv[nameIdx + 1] : null;
const KINDS = {
  team: { table: "v2_teams", col: "team_id", refs: ["v2_race_results", "v2_qualifying_results", "v2_practice_results", "v2_team_season_cars", "v2_team_season_names"], label: "full_name" },
  driver: { table: "v2_drivers", col: "driver_id", refs: ["v2_race_results", "v2_qualifying_results", "v2_practice_results", "v2_stints", "v2_pit_stops"], label: "full_name" },
  circuit: { table: "v2_circuits", col: "circuit_id", refs: ["v2_events", "v2_circuit_layouts"], label: "name" },
  layout: { table: "v2_circuit_layouts", col: "layout_id", refs: ["v2_events", "v2_sessions"], label: "name" },
};
if (!KINDS[kind] || !keepId || !dropId) {
  console.error("usage: merge-entities.mjs team|driver|circuit|layout <keepId> <dropId> [--name …]");
  process.exit(1);
}
const { table, col, refs: refTables, label } = KINDS[kind];

const store = openStore({ writable: true });
const keep = (await store.from(table).select("*").eq("id", keepId).maybeSingle()).data;
const drop = (await store.from(table).select("*").eq("id", dropId).maybeSingle()).data;
if (!keep || !drop) throw new Error(`not found: keep=${!!keep} drop=${!!drop}`);

let moved = 0;
for (const t of refTables) {
  const { data } = await store.from(t).update({ [col]: keepId }).eq(col, dropId).select("id");
  moved += data?.length || 0;
}
if (kind === "driver") await store.from("v2_driver_fingerprints").delete().eq("driver_id", dropId);
// fill gaps in the kept row from the dropped one
const patch = {};
for (const [k, v] of Object.entries(drop)) if (keep[k] == null && v != null && !["id", "created_at"].includes(k)) patch[k] = v;
const oldNames = kind === "team" || kind === "driver" ? [drop[label], newName && keep[label] !== newName ? keep[label] : null].filter(Boolean) : [];
if (newName) patch[label] = newName;
if (Object.keys(patch).length) await store.from(table).update(patch).eq("id", keepId);
for (const alias of oldNames) {
  const exists = (await store.from("search_aliases").select("id").eq("alias", alias).eq("entity_type", kind).maybeSingle()).data;
  if (!exists) await store.from("search_aliases").insert({ alias, canonical: keepId, entity_type: kind });
}
await store.from("search_aliases").update({ canonical: keepId }).eq("canonical", dropId);
await store.from(table).delete().eq("id", dropId);
await store.flush();
console.log(`${kind}: "${drop[label]}" → "${newName || keep[label]}" (${moved} references moved)`);
