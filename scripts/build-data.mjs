#!/usr/bin/env node
/**
 * Prepare the repo data store (data/) for the static site:
 *   public/data/<table>.ndjson, public/data/<table>/<session_id>.ndjson
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
  fs.cpSync(SRC, OUT, { recursive: true, filter: (p) => !p.endsWith("_manifest.json") });
  const schema = readSchema();
  fs.writeFileSync(path.join(OUT, "_schema.json"), JSON.stringify(schema));
  console.log(`data: ${Object.keys(schema.tables).length} tables, ${schema.relationships.length} relationships → public/data`);
}
