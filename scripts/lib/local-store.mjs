/**
 * Node access to the repo data store through the same LocalDB engine the site
 * uses. `openStore({ writable: true })` lets scripts insert/update rows and
 * `store.flush()` writes them back to data/*.ndjson.
 * Requires Node 22.6+ (run scripts with --experimental-strip-types).
 */
import fs from "node:fs";
import path from "node:path";
import { LocalDB, parseNdjson } from "../../src/integrations/supabase/local-db.ts";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const DATA = path.join(ROOT, "data");

const sortRows = (rows) =>
  [...rows].sort((a, b) => String(a.id ?? JSON.stringify(a)).localeCompare(String(b.id ?? JSON.stringify(b))));
const toNdjson = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");

export function fileLoader() {
  return {
    async schema() {
      const { readSchema } = await import("../build-data.mjs");
      return readSchema();
    },
    async load(table, partitions) {
      const file = partitions ? path.join(DATA, table, `${partitions[0]}.ndjson`) : path.join(DATA, `${table}.ndjson`);
      return fs.existsSync(file) ? parseNdjson(fs.readFileSync(file, "utf8")) : [];
    },
    async save(table, rows, schema) {
      const meta = schema.tables[table] || {};
      if (meta.partitionKey) {
        const dir = path.join(DATA, table);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        const groups = new Map();
        for (const r of rows) {
          const k = String(r[meta.partitionKey] ?? "_none");
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(r);
        }
        for (const [k, list] of groups) fs.writeFileSync(path.join(dir, `${k}.ndjson`), toNdjson(sortRows(list)));
      } else {
        fs.writeFileSync(path.join(DATA, `${table}.ndjson`), toNdjson(sortRows(rows)));
      }
    },
  };
}

export function openStore(opts = {}) {
  const db = new LocalDB(fileLoader(), { writable: !!opts.writable });
  return { db, from: (t) => db.from(t), flush: () => db.flush() };
}
