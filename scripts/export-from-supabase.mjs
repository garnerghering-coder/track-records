#!/usr/bin/env node
/**
 * One-time (re-runnable) export of every publicly readable table from the
 * Lovable/Supabase backend into the repo's data store (data/), plus the
 * storage images those rows reference (public/media/).
 *
 * Layout:
 *   data/<table>.ndjson                  one JSON row per line, sorted by id
 *   data/<table>/<session_id>.ndjson     large per-session tables, partitioned
 *
 * Usage: node scripts/export-from-supabase.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n").filter(Boolean)
    .map((l) => { const [k, ...v] = l.split("="); return [k, v.join("=").replace(/^"|"$/g, "")]; }),
);
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const STORAGE_PREFIX = `${env.VITE_SUPABASE_URL}/storage/v1/object/public/`;

const DATA = path.join(ROOT, "data");
const MEDIA = path.join(ROOT, "public", "media");
// Large tables that are only ever read one session at a time.
const PARTITIONED = new Set(["v2_lap_times", "v2_stints", "v2_pit_stops"]);

// Every table in the generated types; private ones simply return 0 rows.
const typesSrc = fs.readFileSync(path.join(ROOT, "src/integrations/supabase/types.ts"), "utf8");
const tablesBlock = typesSrc.slice(typesSrc.indexOf("Tables: {"), typesSrc.indexOf("Views: {"));
const tables = [...tablesBlock.matchAll(/^      ([a-z0-9_]+): \{$/gm)].map((m) => m[1]);

async function fetchAll(table) {
  const rows = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = supabase.from(table).select("*").range(from, from + page - 1);
    q = q.order("id", { ascending: true });
    let { data, error } = await q;
    if (error && /id/.test(error.message)) ({ data, error } = await supabase.from(table).select("*").range(from, from + page - 1));
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < page) break;
  }
  return rows;
}

const mediaUrls = new Set();
function collectMedia(value) {
  if (typeof value === "string") {
    if (value.startsWith(STORAGE_PREFIX)) mediaUrls.add(value);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectMedia(v);
  }
}
const localMediaPath = (url) => "/media/" + decodeURIComponent(url.slice(STORAGE_PREFIX.length).split("?")[0]);
function rewriteMedia(value) {
  if (typeof value === "string") return value.startsWith(STORAGE_PREFIX) ? localMediaPath(value) : value;
  if (Array.isArray(value)) return value.map(rewriteMedia);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteMedia(v)]));
  return value;
}

const toNdjson = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");

fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });
const manifest = { exported_at: new Date().toISOString(), source: env.VITE_SUPABASE_URL, tables: {} };

for (const table of tables) {
  const rows = await fetchAll(table);
  if (rows.length === 0) continue;
  rows.forEach(collectMedia);
  const clean = rows.map(rewriteMedia);
  if (PARTITIONED.has(table)) {
    const groups = new Map();
    for (const r of clean) {
      const k = r.session_id ?? "_none";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    fs.mkdirSync(path.join(DATA, table), { recursive: true });
    for (const [k, list] of groups) fs.writeFileSync(path.join(DATA, table, `${k}.ndjson`), toNdjson(list));
    manifest.tables[table] = { rows: rows.length, partitionedBy: "session_id", partitions: groups.size };
  } else {
    fs.writeFileSync(path.join(DATA, `${table}.ndjson`), toNdjson(clean));
    manifest.tables[table] = { rows: rows.length };
  }
  console.log(`${table.padEnd(32)} ${String(rows.length).padStart(6)}${manifest.tables[table].partitionedBy ? "  (partitioned)" : ""}`);
}

// Download referenced storage objects
let ok = 0, failed = [];
for (const url of mediaUrls) {
  const dest = path.join(ROOT, "public", localMediaPath(url));
  if (fs.existsSync(dest)) { ok++; continue; }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    ok++;
  } catch (e) {
    failed.push(`${url} (${e.message})`);
  }
}
manifest.media = { downloaded: ok, failed: failed.length };
fs.writeFileSync(path.join(DATA, "_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`media: ${ok} downloaded, ${failed.length} failed`);
failed.slice(0, 10).forEach((f) => console.log("  failed:", f));
