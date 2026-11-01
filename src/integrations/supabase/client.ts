/**
 * Track Records data client.
 *
 * The site no longer talks to a hosted database: all data lives in the repo
 * (data/*.ndjson) and is served as static files from /data. `supabase` keeps
 * the supabase-js query interface (and its generated types) so pages are
 * unchanged, but queries run in the browser over those files.
 *
 * Accounts, edge functions and uploads are not available on the static site;
 * those calls resolve with an error instead of throwing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { LocalDB, type Loader, type Schema } from "./local-db";

const BASE = `${import.meta.env.BASE_URL || "/"}data/`.replace(/\/{2,}/g, "/");

const browserLoader: Loader = {
  async schema() {
    const res = await fetch(`${BASE}_schema.json`);
    if (!res.ok) throw new Error(`Could not load data schema (${res.status})`);
    return (await res.json()) as Schema;
  },
  async load(table, partitions) {
    const url = partitions ? `${BASE}${table}/${encodeURIComponent(partitions[0])}.json` : `${BASE}${table}.json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return (await res.json()) as Record<string, unknown>[];
  },
};

export const localDb = new LocalDB(browserLoader);

const unavailable = (what: string) => ({ message: `${what} is not available on this site.`, code: "UNAVAILABLE" });

const auth = {
  getSession: async () => ({ data: { session: null }, error: null }),
  getUser: async () => ({ data: { user: null }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  signInWithPassword: async () => ({ data: { user: null, session: null }, error: unavailable("Signing in") }),
  signUp: async () => ({ data: { user: null, session: null }, error: unavailable("Creating an account") }),
  signOut: async () => ({ error: null }),
  resetPasswordForEmail: async () => ({ data: null, error: unavailable("Password reset") }),
};

const functions = {
  invoke: async () => ({ data: null, error: unavailable("This action") }),
};

const storage = {
  from: (bucket: string) => ({
    getPublicUrl: (path: string) => ({ data: { publicUrl: `${import.meta.env.BASE_URL || "/"}media/${bucket}/${path}`.replace(/\/{2,}/g, "/") } }),
    upload: async () => ({ data: null, error: unavailable("Uploading") }),
    remove: async () => ({ data: null, error: unavailable("Deleting files") }),
    list: async () => ({ data: [], error: null }),
  }),
};

const client = {
  from: (table: string) => localDb.from(table),
  auth,
  functions,
  storage,
  rpc: async () => ({ data: null, error: unavailable("This action") }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: () => {},
};

// Same compile-time API as before, so existing typed queries keep compiling.
export const supabase = client as unknown as SupabaseClient<Database>;
