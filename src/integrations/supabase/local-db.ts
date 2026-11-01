/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LocalDB — a small, dependency-free implementation of the subset of the
 * supabase-js / PostgREST query API this site uses, running over plain row
 * arrays. The site's data lives in the repo (data/*.ndjson); in the browser
 * rows are fetched lazily from /data, in Node scripts they are read from disk.
 *
 * Supported:
 *   select("a, b, alias:c, rel(x, nested(*)), rel!inner(*)", { count, head })
 *   eq neq gt gte lt lte like ilike in is not(col, op, val) or("a.eq.1,b.ilike.%x%", { referencedTable })
 *   order(col, { ascending, nullsFirst }) limit range single maybeSingle
 *   insert update upsert delete (only when the loader allows writes)
 *   JSON paths in filters: extra_data->>PIC
 */

export type Row = Record<string, any>;

export interface Relationship {
  table: string;
  columns: string[];
  ref: string;
  refColumns: string[];
}

export interface Schema {
  tables: Record<string, { partitionKey?: string; partitions?: string[] }>;
  relationships: Relationship[];
}

export interface Loader {
  schema(): Promise<Schema>;
  /** Load a table, or only some partitions of a partitioned table. */
  load(table: string, partitions?: string[]): Promise<Row[]>;
  /** Persist changes (Node only). */
  save?(table: string, rows: Row[], schema: Schema): Promise<void>;
}

type PgError = { message: string; code?: string; details?: string; hint?: string };
type Result = { data: any; error: PgError | null; count: number | null; status: number; statusText: string };

/* ── Select parsing ───────────────────────────────────────────── */

interface SelectNode {
  kind: "star" | "col" | "embed";
  name: string; // column or relation name
  alias?: string;
  inner?: boolean;
  children?: SelectNode[];
}

function splitTopLevel(s: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = false;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && s[i - 1] !== "\\") quote = !quote;
    if (!quote) {
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === sep && depth === 0) {
        out.push(cur);
        cur = "";
        continue;
      }
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function parseSelect(sel: string): SelectNode[] {
  return splitTopLevel(sel.replace(/\s+/g, " ")).map((part) => {
    if (part === "*") return { kind: "star", name: "*" };
    const paren = part.indexOf("(");
    let head = paren === -1 ? part : part.slice(0, paren);
    let alias: string | undefined;
    const colon = head.indexOf(":");
    if (colon !== -1 && head[colon + 1] !== ":") {
      alias = head.slice(0, colon).trim();
      head = head.slice(colon + 1);
    }
    head = head.replace(/::\w+$/, "").trim();
    if (paren === -1) return { kind: "col", name: head, alias };
    const [name, ...hints] = head.split("!");
    return {
      kind: "embed",
      name: name.trim(),
      alias,
      inner: hints.includes("inner"),
      children: parseSelect(part.slice(paren + 1, part.lastIndexOf(")"))),
    };
  });
}

/* ── Value helpers ────────────────────────────────────────────── */

function getPath(row: Row, col: string): any {
  // extra_data->>PIC (text) / extra_data->foo (json)
  if (!col.includes("->")) return row[col];
  const tokens = col.split(/(->>|->)/);
  let v: any = row[tokens[0]];
  let lastOp = "->";
  for (let i = 1; i < tokens.length; i += 2) {
    lastOp = tokens[i];
    v = v == null ? undefined : v[tokens[i + 1]];
  }
  if (v == null) return null;
  return lastOp === "->>" ? (typeof v === "object" ? JSON.stringify(v) : String(v)) : v;
}

function cmp(a: any, b: any): number {
  if (a === b) return 0;
  if (a == null) return b == null ? 0 : -1;
  if (b == null) return 1;
  const na = typeof a === "number" ? a : typeof a === "string" && a.trim() !== "" && !isNaN(Number(a)) ? Number(a) : NaN;
  const nb = typeof b === "number" ? b : typeof b === "string" && b.trim() !== "" && !isNaN(Number(b)) ? Number(b) : NaN;
  if (!isNaN(na) && !isNaN(nb) && (typeof a === "number" || typeof b === "number")) return na - nb;
  if (typeof a === "boolean" || typeof b === "boolean") return String(a) === String(b) ? 0 : String(a) < String(b) ? -1 : 1;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

const eqLoose = (a: any, b: any) => (a == null || b == null ? false : cmp(a, b) === 0);

function likeToRegex(pattern: string, insensitive: boolean): RegExp {
  let re = "";
  for (const ch of String(pattern)) {
    if (ch === "%" || ch === "*") re += ".*";
    else if (ch === "_") re += ".";
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, insensitive ? "is" : "s");
}

function parseLiteral(v: string): any {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/\\(.)/g, "$1");
  return v;
}

/* ── Filters ──────────────────────────────────────────────────── */

type Pred = (row: Row) => boolean;

function makePred(col: string, op: string, value: any): Pred {
  switch (op) {
    case "eq":
      return (r) => eqLoose(getPath(r, col), value);
    case "neq":
      return (r) => getPath(r, col) != null && !eqLoose(getPath(r, col), value);
    case "gt":
      return (r) => getPath(r, col) != null && cmp(getPath(r, col), value) > 0;
    case "gte":
      return (r) => getPath(r, col) != null && cmp(getPath(r, col), value) >= 0;
    case "lt":
      return (r) => getPath(r, col) != null && cmp(getPath(r, col), value) < 0;
    case "lte":
      return (r) => getPath(r, col) != null && cmp(getPath(r, col), value) <= 0;
    case "like":
    case "ilike": {
      const re = likeToRegex(value, op === "ilike");
      return (r) => {
        const v = getPath(r, col);
        return v != null && re.test(String(v));
      };
    }
    case "in": {
      const list = (Array.isArray(value) ? value : []).map((x) => x);
      return (r) => list.some((x) => eqLoose(getPath(r, col), x));
    }
    case "is":
      return (r) => {
        const v = getPath(r, col);
        if (value === null || value === "null") return v == null;
        if (value === true || value === "true") return v === true;
        if (value === false || value === "false") return v === false;
        return false;
      };
    case "cs": // contains (arrays/json)
      return (r) => {
        const v = getPath(r, col);
        if (Array.isArray(v)) return (Array.isArray(value) ? value : [value]).every((x: any) => v.includes(x));
        if (v && typeof v === "object") return Object.entries(value || {}).every(([k, x]) => eqLoose(v[k], x));
        return false;
      };
    default:
      throw new Error(`LocalDB: unsupported operator "${op}"`);
  }
}

/** Parse a PostgREST logic string: `a.eq.1,b.ilike."%x%",c.in.(1,2),and(d.gt.3,e.is.null)` */
function parseOr(expr: string): Pred {
  const preds = splitTopLevel(expr).map(parseCondition);
  return (r) => preds.some((p) => p(r));
}
function parseCondition(cond: string): Pred {
  const m = cond.match(/^(and|or)\((.*)\)$/s);
  if (m) {
    const inner = splitTopLevel(m[2]).map(parseCondition);
    return m[1] === "and" ? (r) => inner.every((p) => p(r)) : (r) => inner.some((p) => p(r));
  }
  // col may contain "->" / "->>"; operators are simple words
  const re = /^(.+?)\.(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|in|is|cs)\.(.*)$/s;
  const mm = cond.match(re);
  if (!mm) throw new Error(`LocalDB: cannot parse filter "${cond}"`);
  const [, col, not, op, raw] = mm;
  let value: any;
  if (op === "in") value = splitTopLevel(raw.replace(/^\(|\)$/g, "")).map(parseLiteral);
  else value = parseLiteral(raw);
  const p = makePred(col, op, value);
  return not ? (r) => !p(r) : p;
}

/* ── The database ─────────────────────────────────────────────── */

export class LocalDB {
  private schemaP: Promise<Schema> | null = null;
  private full = new Map<string, Promise<Row[]>>();
  private parts = new Map<string, Promise<Row[]>>(); // `${table}/${partition}`
  readonly writable: boolean;
  private loader: Loader;

  constructor(loader: Loader, opts: { writable?: boolean } = {}) {
    this.loader = loader;
    this.writable = !!opts.writable;
  }

  schema() {
    return (this.schemaP ??= this.loader.schema());
  }

  /** Rows of a table; for partitioned tables only the requested partitions when given. */
  async rows(table: string, partitions?: string[]): Promise<Row[]> {
    const schema = await this.schema();
    const meta = schema.tables[table];
    if (!meta) return [];
    if (!meta.partitionKey || !partitions) {
      if (!this.full.has(table)) {
        if (meta.partitionKey) {
          const all = meta.partitions || [];
          this.full.set(table, Promise.all(all.map((p) => this.partition(table, p))).then((x) => x.flat()));
        } else this.full.set(table, this.loader.load(table));
      }
      return this.full.get(table)!;
    }
    const known = new Set(meta.partitions || []);
    const lists = await Promise.all(partitions.filter((p) => known.has(String(p))).map((p) => this.partition(table, String(p))));
    return lists.flat();
  }

  private partition(table: string, p: string) {
    const key = `${table}/${p}`;
    if (!this.parts.has(key)) this.parts.set(key, this.loader.load(table, [p]));
    return this.parts.get(key)!;
  }

  from(table: string) {
    return new QueryBuilder(this, table);
  }

  /* writes (Node) */
  async mutate(table: string, fn: (rows: Row[]) => Row[]): Promise<void> {
    if (!this.writable) throw new Error("read-only");
    const schema = await this.schema();
    if (!schema.tables[table]) {
      schema.tables[table] = {};
      this.full.set(table, Promise.resolve([]));
    }
    const current = await this.rows(table);
    const next = fn(current);
    this.full.set(table, Promise.resolve(next));
    // invalidate partitions so reads see the new data
    for (const k of [...this.parts.keys()]) if (k.startsWith(table + "/")) this.parts.delete(k);
    const meta = schema.tables[table];
    if (meta.partitionKey) {
      const keys = new Set(next.map((r) => String(r[meta.partitionKey!] ?? "_none")));
      meta.partitions = [...keys].sort();
      for (const p of meta.partitions) this.parts.set(`${table}/${p}`, Promise.resolve(next.filter((r) => String(r[meta.partitionKey!] ?? "_none") === p)));
    }
    this.dirty.add(table);
  }
  readonly dirty = new Set<string>();

  async flush() {
    if (!this.loader.save) throw new Error("loader cannot save");
    const schema = await this.schema();
    for (const t of this.dirty) await this.loader.save(t, await this.rows(t), schema);
    this.dirty.clear();
  }
}

/* ── Query builder ────────────────────────────────────────────── */

type Op = "select" | "insert" | "update" | "upsert" | "delete";

class QueryBuilder implements PromiseLike<Result> {
  private op: Op = "select";
  private selectStr = "*";
  private returning = false;
  private countMode: string | null = null;
  private head = false;
  private filters: { col: string; pred: Pred; partitionValues?: any[] }[] = [];
  private embedFilters: { path: string; pred: Pred }[] = [];
  private orders: { col: string; asc: boolean; nullsFirst: boolean; referencedTable?: string }[] = [];
  private lim: number | null = null;
  private offset = 0;
  private mode: "many" | "single" | "maybe" = "many";
  private payload: Row[] = [];
  private patch: Row = {};
  private onConflict?: string;

  private db: LocalDB;
  private table: string;

  constructor(db: LocalDB, table: string) {
    this.db = db;
    this.table = table;
  }

  select(columns = "*", opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.selectStr = columns;
      this.countMode = opts?.count ?? null;
      this.head = !!opts?.head;
    } else {
      this.returning = true;
      this.selectStr = columns;
    }
    return this;
  }

  /* filters */
  private add(col: string, op: string, value: any) {
    const ref = col.includes(".") && !col.includes("->") ? col.split(".") : null;
    if (ref) {
      this.embedFilters.push({ path: ref.slice(0, -1).join("."), pred: makePred(ref[ref.length - 1], op, value) });
    } else {
      const partitionValues = op === "eq" ? [value] : op === "in" ? value : undefined;
      this.filters.push({ col, pred: makePred(col, op, value), partitionValues });
    }
    return this;
  }
  eq(c: string, v: any) { return this.add(c, "eq", v); }
  neq(c: string, v: any) { return this.add(c, "neq", v); }
  gt(c: string, v: any) { return this.add(c, "gt", v); }
  gte(c: string, v: any) { return this.add(c, "gte", v); }
  lt(c: string, v: any) { return this.add(c, "lt", v); }
  lte(c: string, v: any) { return this.add(c, "lte", v); }
  like(c: string, v: any) { return this.add(c, "like", v); }
  ilike(c: string, v: any) { return this.add(c, "ilike", v); }
  in(c: string, v: any[]) { return this.add(c, "in", v); }
  is(c: string, v: any) { return this.add(c, "is", v); }
  contains(c: string, v: any) { return this.add(c, "cs", v); }
  match(obj: Row) {
    for (const [k, v] of Object.entries(obj)) this.add(k, "eq", v);
    return this;
  }
  not(c: string, op: string, v: any) {
    const val = op === "in" && typeof v === "string" ? splitTopLevel(v.replace(/^\(|\)$/g, "")).map(parseLiteral) : v;
    const p = makePred(c, op, val);
    this.filters.push({ col: c, pred: (r) => !p(r) });
    return this;
  }
  filter(c: string, op: string, v: any) {
    if (op.startsWith("not.")) return this.not(c, op.slice(4), v);
    return this.add(c, op, op === "in" && typeof v === "string" ? splitTopLevel(v.replace(/^\(|\)$/g, "")).map(parseLiteral) : v);
  }
  or(expr: string, opts?: { referencedTable?: string; foreignTable?: string }) {
    const ref = opts?.referencedTable || opts?.foreignTable;
    const pred = parseOr(expr);
    if (ref) this.embedFilters.push({ path: ref, pred });
    else this.filters.push({ col: "", pred });
    return this;
  }

  /* modifiers */
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string; foreignTable?: string }) {
    const asc = opts?.ascending ?? true;
    this.orders.push({ col, asc, nullsFirst: opts?.nullsFirst ?? !asc, referencedTable: opts?.referencedTable || opts?.foreignTable });
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  range(from: number, to: number) {
    this.offset = from;
    this.lim = to - from + 1;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }
  abortSignal() {
    return this;
  }
  returns() {
    return this;
  }

  /* writes */
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.onConflict = opts?.onConflict;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  then<T1 = Result, T2 = never>(ok?: ((v: Result) => T1 | PromiseLike<T1>) | null, err?: ((e: any) => T2 | PromiseLike<T2>) | null) {
    return this.execute().then(ok, err);
  }

  private result(data: any, count: number | null = null, error: PgError | null = null): Result {
    return { data, error, count, status: error ? 400 : 200, statusText: error ? "Bad Request" : "OK" };
  }

  private async execute(): Promise<Result> {
    try {
      if (this.op !== "select") return await this.executeWrite();
      return await this.executeSelect();
    } catch (e: any) {
      return this.result(null, null, { message: e?.message || String(e) });
    }
  }

  private partitionHint(): string[] | undefined {
    const f = this.filters.find((x) => x.col === "session_id" && x.partitionValues);
    return f?.partitionValues?.map(String);
  }

  private async executeSelect(): Promise<Result> {
    const schema = await this.db.schema();
    if (!schema.tables[this.table]) {
      // Unknown or private table → behave like an empty table
      if (this.mode === "single") return this.result(null, null, { message: "No rows", code: "PGRST116" });
      return this.result(this.head ? null : this.mode === "maybe" ? null : [], this.countMode ? 0 : null);
    }
    let rows = await this.db.rows(this.table, this.partitionHint());
    for (const f of this.filters) rows = rows.filter(f.pred);

    const tree = parseSelect(this.selectStr);
    // Shape rows (with embeds); parents whose !inner embeds are empty are dropped
    let pairs: { o: Row; base: Row }[] = [];
    for (const r of rows) {
      const shaped = await this.shape(r, this.table, tree, schema, "");
      if (shaped) pairs.push({ o: shaped.row, base: r });
    }
    const top = this.orders.filter((o) => !o.referencedTable);
    if (top.length) {
      pairs = pairs.sort((a, b) => {
        for (const o of top) {
          const va = getPath(a.base, o.col);
          const vb = getPath(b.base, o.col);
          if (va == null || vb == null) {
            if (va == null && vb == null) continue;
            return (va == null) === o.nullsFirst ? -1 : 1;
          }
          const c = cmp(va, vb);
          if (c !== 0) return o.asc ? c : -c;
        }
        return 0;
      });
    }
    let out = pairs.map((p) => p.o);
    const count = this.countMode ? out.length : null;
    if (this.offset || this.lim != null) out = out.slice(this.offset, this.lim != null ? this.offset + this.lim : undefined);
    if (this.head) return this.result(null, count);
    if (this.mode === "single") {
      if (out.length !== 1) return this.result(null, count, { message: `JSON object requested, multiple (or no) rows returned`, code: "PGRST116" });
      return this.result(out[0], count);
    }
    if (this.mode === "maybe") {
      if (out.length > 1) return this.result(null, count, { message: "multiple rows returned", code: "PGRST116" });
      return this.result(out[0] ?? null, count);
    }
    return this.result(out, count);
  }

  /** Project a row through a select tree; returns null if an !inner embed is empty. */
  private async shape(row: Row, table: string, tree: SelectNode[], schema: Schema, path: string): Promise<{ row: Row } | null> {
    // Keep `rows` aligned with output for ordering: shape returns null only for !inner drops,
    // so we pre-filter base rows the same way below.
    const out: Row = {};
    for (const n of tree) {
      if (n.kind === "star") Object.assign(out, row);
      else if (n.kind === "col") out[n.alias || n.name] = getPath(row, n.name);
    }
    for (const n of tree) {
      if (n.kind !== "embed") continue;
      const key = n.alias || n.name;
      const subPath = path ? `${path}.${n.name}` : n.name;
      const rel = resolveRelation(schema, table, n.name);
      if (!rel) {
        out[key] = null;
        continue;
      }
      const target = await this.db.rows(n.name);
      const efs = this.embedFilters.filter((f) => f.path === subPath);
      if (rel.kind === "one") {
        let match = target.find((t) => rel.pairs.every(([a, b]) => row[a] != null && eqLoose(row[a], t[b]))) || null;
        if (match && efs.length && !efs.every((f) => f.pred(match!))) match = null;
        if (!match) {
          if (n.inner) return null;
          out[key] = null;
        } else {
          const s = await this.shape(match, n.name, n.children!, schema, subPath);
          if (!s && n.inner) return null;
          out[key] = s ? s.row : null;
        }
      } else {
        let matches = target.filter((t) => rel.pairs.every(([a, b]) => row[a] != null && eqLoose(row[a], t[b])));
        for (const f of efs) matches = matches.filter(f.pred);
        const orders = this.orders.filter((o) => o.referencedTable === subPath || o.referencedTable === n.name);
        if (orders.length)
          matches = [...matches].sort((a, b) => {
            for (const o of orders) {
              const c = cmp(getPath(a, o.col), getPath(b, o.col));
              if (c !== 0) return o.asc ? c : -c;
            }
            return 0;
          });
        const shaped: Row[] = [];
        for (const m of matches) {
          const s = await this.shape(m, n.name, n.children!, schema, subPath);
          if (s) shaped.push(s.row);
        }
        if (n.inner && shaped.length === 0) return null;
        out[key] = shaped;
      }
    }
    return { row: out };
  }

  private async executeWrite(): Promise<Result> {
    if (!this.db.writable) return this.result(null, null, { message: "Track Records data is read-only in the browser.", code: "READ_ONLY" });
    const now = new Date().toISOString();
    let affected: Row[] = [];
    if (this.op === "insert" || this.op === "upsert") {
      const keyCols = (this.onConflict || "id").split(",").map((s) => s.trim());
      await this.db.mutate(this.table, (rows) => {
        const next = [...rows];
        for (const p of this.payload) {
          const row: Row = { ...p };
          if (row.id == null && (rows.length === 0 || "id" in rows[0] || keyCols.includes("id"))) row.id = uuid();
          if (row.created_at === undefined && (rows.length === 0 || "created_at" in rows[0])) row.created_at = now;
          if (this.op === "upsert") {
            const i = next.findIndex((r) => keyCols.every((k) => eqLoose(r[k], row[k])));
            if (i !== -1) {
              next[i] = { ...next[i], ...p, id: next[i].id, updated_at: next[i].updated_at !== undefined ? now : undefined };
              if (next[i].updated_at === undefined) delete next[i].updated_at;
              affected.push(next[i]);
              continue;
            }
          }
          next.push(row);
          affected.push(row);
        }
        return next;
      });
    } else if (this.op === "update") {
      await this.db.mutate(this.table, (rows) =>
        rows.map((r) => {
          if (!this.filters.every((f) => f.pred(r))) return r;
          const u = { ...r, ...this.patch };
          if ("updated_at" in r && !("updated_at" in this.patch)) u.updated_at = now;
          affected.push(u);
          return u;
        }),
      );
    } else if (this.op === "delete") {
      await this.db.mutate(this.table, (rows) =>
        rows.filter((r) => {
          const hit = this.filters.length > 0 && this.filters.every((f) => f.pred(r));
          if (hit) affected.push(r);
          return !hit;
        }),
      );
    }
    if (!this.returning) return this.result(null);
    const schema = await this.db.schema();
    const tree = parseSelect(this.selectStr);
    const shaped: Row[] = [];
    for (const r of affected) {
      const s = await this.shape(r, this.table, tree, schema, "");
      if (s) shaped.push(s.row);
    }
    if (this.mode === "single") return shaped.length === 1 ? this.result(shaped[0]) : this.result(null, null, { message: "expected one row", code: "PGRST116" });
    if (this.mode === "maybe") return this.result(shaped[0] ?? null);
    return this.result(shaped);
  }
}

/* ── Relationship resolution ──────────────────────────────────── */

function resolveRelation(schema: Schema, from: string, to: string): { kind: "one" | "many"; pairs: [string, string][] } | null {
  // many-to-one: from.fk → to.pk
  const out = schema.relationships.filter((r) => r.table === from && r.ref === to);
  if (out.length >= 1) return { kind: "one", pairs: out[0].columns.map((c, i) => [c, out[0].refColumns[i]]) };
  // one-to-many: to.fk → from.pk
  const inc = schema.relationships.filter((r) => r.table === to && r.ref === from);
  if (inc.length >= 1) return { kind: "many", pairs: inc[0].refColumns.map((c, i) => [c, inc[0].columns[i]]) };
  return null;
}

export function uuid(): string {
  const g: any = globalThis as any;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function parseNdjson(text: string): Row[] {
  const out: Row[] = [];
  for (const line of text.split("\n")) if (line) out.push(JSON.parse(line));
  return out;
}
