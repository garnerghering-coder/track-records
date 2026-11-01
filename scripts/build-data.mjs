#!/usr/bin/env node
/**
 * Prepare the repo data store (data/) for the static site:
 *   public/data/<table>.json, public/data/<table>/<session_id>.json (JSON arrays)
 *   public/data/_schema.json  — table list, partitions and foreign keys
 * Foreign keys are read from the generated Supabase types so nested
 * selects like `v2_events(v2_seasons(year))` resolve the same way.
 * Runs automatically before `vite` dev/build.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "data");
const OUT = path.join(ROOT, "public", "data");

export function readSchema() {
  const types = fs.readFileSync(path.join(ROOT, "src/integrations/supabase/types.ts"), "utf8");
  const block = types.slice(types.indexOf("Tables: {"), types.indexOf("Views: {"));
  const relationships = [];
  const tableRe = /^      ([a-z0-9_]+): \{$/gm;
  const starts = [...block.matchAll(tableRe)];
  starts.forEach((m, i) => {
    const body = block.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : block.length);
    const relBlock = body.slice(body.indexOf("Relationships: ["));
    for (const r of relBlock.matchAll(/columns: \[([^\]]*)\][\s\S]*?referencedRelation: "([a-z0-9_]+)"\s*referencedColumns: \[([^\]]*)\]/g)) {
      const cols = r[1].match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) || [];
      const refCols = r[3].match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) || [];
      relationships.push({ table: m[1], columns: cols, ref: r[2], refColumns: refCols });
    }
  });
  const tables = {};
  for (const entry of fs.readdirSync(SRC, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".ndjson")) tables[entry.name.replace(/\.ndjson$/, "")] = {};
    if (entry.isDirectory())
      tables[entry.name] = {
        partitionKey: "session_id",
        partitions: fs.readdirSync(path.join(SRC, entry.name)).filter((f) => f.endsWith(".ndjson")).map((f) => f.replace(/\.ndjson$/, "")).sort(),
      };
  }
  return { tables, relationships };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fs.rmSync(OUT, { recursive: true, force: true });
  // Publish each table as a JSON array (.json): static hosts such as GitHub Pages
  // gzip application/json (~5x smaller) but serve .ndjson uncompressed.
  const publish = (from, to) => {
    const lines = fs.readFileSync(from, "utf8").split("\n").filter(Boolean);
    fs.writeFileSync(to, `[${lines.join(",")}]`);
  };
  // Lap times are the bulk of the data (a 24-hour race or a 400-lap oval race has
  // tens of thousands of rows): publish only what the site reads. The browser
  // loader restores session_id from the partition name.
  const LAP_KEEP = ["car_number", "lap_number", "elapsed", "lap_time", "driver_id", "position", "class_position"];
  const publishLaps = (from, to) => {
    const rows = fs.readFileSync(from, "utf8").split("\n").filter(Boolean).map((l) => {
      const r = JSON.parse(l);
      const o = {};
      for (const k of LAP_KEEP) if (r[k] != null) o[k] = r[k];
      for (const k of Object.keys(r)) if (!(k in o) && !["id", "created_at", "updated_at", "session_id"].includes(k) && r[k] != null) o[k] = r[k];
      return JSON.stringify(o);
    });
    fs.writeFileSync(to, `[${rows.join(",")}]`);
  };
  fs.mkdirSync(OUT, { recursive: true });
  const schema = readSchema();
  // The site reads results, weather, flags and race control one session at a time:
  // publish them split per session (per section for race control items) so a race
  // page downloads its own rows, not every row of every race.
  const SPLIT = {
    v2_race_results: "session_id",
    v2_qualifying_results: "session_id",
    v2_practice_results: "session_id",
    v2_session_weather: "session_id",
    v2_flag_segments: "session_id",
    v2_annotation_items: "section_id",
  };
  const writeIndex = (table, parts) => fs.writeFileSync(path.join(OUT, table, "_index.json"), JSON.stringify(parts));
  for (const entry of fs.readdirSync(SRC, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".ndjson")) {
      const table = entry.name.replace(/\.ndjson$/, "");
      const key = SPLIT[table];
      if (!key) {
        publish(path.join(SRC, entry.name), path.join(OUT, `${table}.json`));
        continue;
      }
      const groups = new Map();
      for (const line of fs.readFileSync(path.join(SRC, entry.name), "utf8").split("\n")) {
        if (!line) continue;
        const k = String(JSON.parse(line)[key] ?? "_none");
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(line);
      }
      fs.mkdirSync(path.join(OUT, table), { recursive: true });
      for (const [k, lines] of groups) fs.writeFileSync(path.join(OUT, table, `${k}.json`), `[${lines.join(",")}]`);
      writeIndex(table, [...groups.keys()].sort());
      schema.tables[table] = { partitionKey: key };
    }
    if (entry.isDirectory()) {
      fs.mkdirSync(path.join(OUT, entry.name), { recursive: true });
      for (const f of fs.readdirSync(path.join(SRC, entry.name)))
        if (f.endsWith(".ndjson")) (entry.name === "v2_lap_times" ? publishLaps : publish)(path.join(SRC, entry.name, f), path.join(OUT, entry.name, f.replace(/\.ndjson$/, ".json")));
      // Partition lists live in <table>/_index.json, not in the schema every page loads.
      writeIndex(entry.name, schema.tables[entry.name]?.partitions || []);
      schema.tables[entry.name] = { partitionKey: schema.tables[entry.name]?.partitionKey || "session_id" };
    }
  }
  fs.writeFileSync(path.join(OUT, "_schema.json"), JSON.stringify(schema));
  console.log(`data: ${Object.keys(schema.tables).length} tables, ${schema.relationships.length} relationships → public/data`);
}
