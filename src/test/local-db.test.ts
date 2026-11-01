import { describe, expect, it } from "vitest";
import { LocalDB, type Loader, type Row, type Schema } from "@/integrations/supabase/local-db";

/** In-memory loader: tables are plain arrays, `saved` records what flush() wrote. */
function memoryDb(tables: Record<string, Row[]>, partitioned: string[] = []) {
  const saved: Record<string, Row[]> = {};
  const schema: Schema = {
    tables: Object.fromEntries(
      Object.keys(tables).map((t) => [
        t,
        partitioned.includes(t)
          ? { partitionKey: "session_id", partitions: [...new Set(tables[t].map((r) => String(r.session_id)))].sort() }
          : {},
      ]),
    ),
    relationships: [
      { table: "results", columns: ["session_id"], ref: "sessions", refColumns: ["id"] },
      { table: "laps", columns: ["session_id"], ref: "sessions", refColumns: ["id"] },
    ],
  };
  const loader: Loader = {
    async schema() {
      return schema;
    },
    async load(table, partitions) {
      const rows = tables[table] || [];
      return partitions ? rows.filter((r) => partitions.includes(String(r.session_id))) : rows;
    },
    async save(table, rows) {
      saved[table] = rows;
    },
  };
  return { db: new LocalDB(loader, { writable: true }), saved };
}

describe("LocalDB writes", () => {
  it("applies concurrent writes to one table in call order without losing any", async () => {
    const { db } = memoryDb({ drivers: [{ id: "d1", full_name: "A", nationality: null, created_at: "x", updated_at: "x" }] });
    await Promise.all([
      db.from("drivers").insert([{ full_name: "B" }, { full_name: "C" }]),
      db.from("drivers").update({ nationality: "FR" }).eq("id", "d1").is("nationality", null),
      db.from("drivers").insert({ full_name: "D" }),
      db.from("drivers").update({ nationality: "DE" }).eq("id", "d1").is("nationality", null),
    ]);
    const { data } = await db.from("drivers").select("full_name, nationality").order("full_name");
    expect(data).toEqual([
      { full_name: "A", nationality: "FR" },
      { full_name: "B", nationality: undefined },
      { full_name: "C", nationality: undefined },
      { full_name: "D", nationality: undefined },
    ]);
  });

  it("fills id, created_at and updated_at like the database defaults", async () => {
    const { db } = memoryDb({ drivers: [{ id: "d1", full_name: "A", created_at: "x", updated_at: "x" }], tags: [{ id: "t1", name: "x" }] });
    const { data: d } = await db.from("drivers").insert({ full_name: "B" }).select("id, full_name, created_at, updated_at").single();
    expect(d.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(d.created_at).toBeTruthy();
    expect(d.updated_at).toBe(d.created_at);
    // tables without timestamps get none
    const { data: t } = await db.from("tags").insert({ name: "y" }).select("*").single();
    expect(t).not.toHaveProperty("updated_at");
    expect(t).not.toHaveProperty("created_at");
  });

  it("returns inserted rows in order, and upserts on a conflict column", async () => {
    const { db } = memoryDb({ weather: [{ id: "w1", session_id: "s1", rain: 0 }] });
    const { data: ins } = await db.from("weather").insert([{ session_id: "s2", rain: 1 }, { session_id: "s3", rain: 2 }]).select("id, session_id");
    expect(ins.map((r: Row) => r.session_id)).toEqual(["s2", "s3"]);
    await db.from("weather").upsert({ session_id: "s1", rain: 5 }, { onConflict: "session_id" });
    const { data } = await db.from("weather").select("id, session_id, rain").order("session_id");
    expect(data).toEqual([
      { id: "w1", session_id: "s1", rain: 5 },
      { id: ins[0].id, session_id: "s2", rain: 1 },
      { id: ins[1].id, session_id: "s3", rain: 2 },
    ]);
  });

  it("keeps partitions of a partitioned table in step with writes and saves only changed tables", async () => {
    const { db, saved } = memoryDb(
      {
        sessions: [{ id: "s1" }, { id: "s2" }],
        laps: [
          { id: "l1", session_id: "s1", lap: 1 },
          { id: "l2", session_id: "s2", lap: 1 },
        ],
      },
      ["laps"],
    );
    await Promise.all([
      db.from("laps").delete().eq("session_id", "s1"),
      db.from("laps").insert([{ session_id: "s3", lap: 1 }, { session_id: "s3", lap: 2 }]),
    ]);
    expect((await db.from("laps").select("lap").eq("session_id", "s1")).data).toEqual([]);
    expect((await db.from("laps").select("lap").eq("session_id", "s3").order("lap")).data).toEqual([{ lap: 1 }, { lap: 2 }]);
    expect((await db.schema()).tables.laps.partitions).toEqual(["s2", "s3"]);
    await db.flush();
    expect(Object.keys(saved)).toEqual(["laps"]);
    expect(saved.laps.map((r) => r.session_id).sort()).toEqual(["s2", "s3", "s3"]);
  });

  it("refuses writes when read-only", async () => {
    const { db } = memoryDb({ drivers: [] });
    const ro = new LocalDB({ schema: () => db.schema(), load: async () => [] });
    const { error } = await ro.from("drivers").insert({ full_name: "X" });
    expect(error?.code).toBe("READ_ONLY");
  });
});
