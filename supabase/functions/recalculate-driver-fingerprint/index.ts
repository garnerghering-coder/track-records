import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// All scoring logic is pure and lives in ../_shared/driver-fingerprint.ts + ../_shared/fingerprint-math.ts
// (unit-tested in src/test/; also run by Node against the data/*.ndjson export). This function only loads rows.
import {
  type EventRow,
  type FingerprintTables,
  type LapRow,
  type LayoutRow,
  recomputeDriverFingerprints,
  type ResultRow,
  type SeasonClassRow,
  type SeasonRow,
  type SessionRow,
  type StintRow,
  type WeatherRow,
} from "../_shared/driver-fingerprint.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Admin only (or an internal service-role call): this function writes with the service-role key.
  const auth = await requireAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    let driverIds: string[] = body.driver_ids || (body.driver_id ? [body.driver_id] : []);

    // Batch mode: recalculate all drivers who have results
    if (body.all === true && driverIds.length === 0) {
      // Every driver with a race, qualifying or practice result (paginated: a plain select stops at 1000 rows).
      const uniqueIds = await allDriverIdsWithResults(supabase);
      const offset = body.offset || 0;
      const limit = body.limit || 15;
      driverIds = (uniqueIds as string[]).slice(offset, offset + limit);
      const total = uniqueIds.length;
      console.log(`Batch mode: recalculating ${driverIds.length} drivers (offset=${offset}, total=${total})`);

      // Self-chain: process this chunk, then invoke self for the next chunk
      if (offset + limit < total) {
        const selfUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/recalculate-driver-fingerprint`;
        const nextBody = JSON.stringify({ all: true, offset: offset + limit, limit });
        fetch(selfUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
          },
          body: nextBody,
        }).catch((e) => console.error("Self-chain error:", e));
        console.log(`Queued next chunk at offset ${offset + limit}`);
      }
    }

    if (driverIds.length === 0) {
      return new Response(JSON.stringify({ error: "driver_id, driver_ids, or all:true required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, any> = {};

    const ctx = createCalcContext();
    for (const driverId of driverIds) {
      const fp = await calculateFingerprint(supabase, driverId, ctx);
      results[driverId] = fp;
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Data access helpers ───────────────────────────────────────
const PAGE_SIZE = 1000;

/** Fetch every row of a query (PostgREST caps a response at 1000 rows). `make` must build a fresh, ordered query. */
async function fetchAll<T = any>(make: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await make().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message || String(error));
    out.push(...((data || []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return out;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Fetch rows WHERE column IN (ids), chunked and paginated. */
async function fetchIn<T = any>(supabase: any, table: string, cols: string, column: string, ids: string[], size = 100): Promise<T[]> {
  const out: T[] = [];
  for (const c of chunks([...new Set(ids)].filter(Boolean), size)) {
    out.push(...(await fetchAll<T>(() => supabase.from(table).select(cols).in(column, c).order("id"))));
  }
  return out;
}

/** Every driver id that has at least one result row, sorted so batch offsets are stable. */
async function allDriverIdsWithResults(supabase: any): Promise<string[]> {
  const ids = new Set<string>();
  for (const t of ["v2_race_results", "v2_qualifying_results", "v2_practice_results"]) {
    const rows = await fetchAll<{ driver_id: string }>(() =>
      supabase.from(t).select("driver_id").not("driver_id", "is", null).order("id"),
    );
    for (const r of rows) ids.add(r.driver_id);
  }
  return [...ids].sort();
}

/** Per-request cache of lap rows per session, shared by every driver recalculated in one invocation. */
interface CalcContext {
  laps: Map<string, LapRow[]>;
}
function createCalcContext(): CalcContext {
  return { laps: new Map() };
}

const RESULT_COLS = {
  race: "id, position, status, dnf_reason, car_number, session_id, driver_id, extra_data",
  other: "id, position, car_number, session_id, driver_id, extra_data",
};
const LAYOUT_COLS =
  "id, circuit_id, sort_order, length_km, turns, total_straight_length_km, total_elevation_change_m, heavy_braking_corners";

/**
 * Load the rows one driver's fingerprint depends on, then hand them to the pure calculation in
 * ../_shared/driver-fingerprint.ts (the same code the Node recalculation runs on data/*.ndjson).
 */
async function calculateFingerprint(supabase: any, driverId: string, ctx: CalcContext = createCalcContext()) {
  const ownRace = await fetchAll<ResultRow>(() => supabase.from("v2_race_results").select(RESULT_COLS.race).eq("driver_id", driverId).order("id"));
  const ownQual = await fetchAll<ResultRow>(() => supabase.from("v2_qualifying_results").select(RESULT_COLS.other).eq("driver_id", driverId).order("id"));
  const ownPrac = await fetchAll<ResultRow>(() => supabase.from("v2_practice_results").select(RESULT_COLS.other).eq("driver_id", driverId).order("id"));
  const ownStints = await fetchAll<StintRow>(() =>
    supabase
      .from("v2_stints")
      .select("id, session_id, driver_id, car_number, start_elapsed, end_elapsed, start_lap, end_lap")
      .eq("driver_id", driverId)
      .order("id"),
  );

  const touchedSessionIds = [...new Set([...ownRace, ...ownQual, ...ownPrac, ...ownStints].map((r) => r.session_id))];
  const touched = await fetchIn<SessionRow>(supabase, "v2_sessions", "id, event_id", "id", touchedSessionIds);
  const eventIds = [...new Set(touched.map((s) => s.event_id).filter(Boolean))];
  const sessions = await fetchIn<SessionRow>(supabase, "v2_sessions", "id, event_id, session_type, parent_session_id", "event_id", eventIds);
  const topLevelIds = sessions.filter((s) => !s.parent_session_id).map((s) => s.id);

  // Every result of the top-level sessions (field sizes, co-driver credit, teammates)
  const race_results = await fetchIn<ResultRow>(supabase, "v2_race_results", RESULT_COLS.race, "session_id", topLevelIds);
  const qualifying_results = await fetchIn<ResultRow>(supabase, "v2_qualifying_results", RESULT_COLS.other, "session_id", topLevelIds);
  const practice_results = await fetchIn<ResultRow>(supabase, "v2_practice_results", RESULT_COLS.other, "session_id", topLevelIds);

  const events = await fetchIn<EventRow>(supabase, "v2_events", "id, season_id, layout_id, circuit_id", "id", eventIds);
  const seasonIds = [...new Set(events.map((e) => e.season_id).filter(Boolean) as string[])];
  const seasons = await fetchIn<SeasonRow>(supabase, "v2_seasons", "id, cdm, is_spec_series", "id", seasonIds);
  const season_classes = await fetchIn<SeasonClassRow>(supabase, "v2_season_classes", "id, season_id, class_name, cdm", "season_id", seasonIds);
  const circuit_layouts = [
    ...(await fetchIn<LayoutRow>(supabase, "v2_circuit_layouts", LAYOUT_COLS, "id", events.map((e) => e.layout_id as string))),
    ...(await fetchIn<LayoutRow>(
      supabase, "v2_circuit_layouts", LAYOUT_COLS, "circuit_id",
      events.filter((e) => !e.layout_id).map((e) => e.circuit_id as string),
    )),
  ];
  const session_weather = await fetchIn<WeatherRow>(
    supabase, "v2_session_weather", "id, session_id, rain_mm, condition_summary", "session_id", sessions.map((s) => s.id),
  );

  // Lap times only for race sessions where this driver has stints (cached across drivers).
  const parentOf = new Map(sessions.map((s) => [s.id, s.parent_session_id || s.id]));
  const lapSessions = [...new Set(ownStints.map((s) => parentOf.get(s.session_id)).filter(Boolean) as string[])];
  for (const sid of lapSessions) {
    if (!ctx.laps.has(sid)) {
      ctx.laps.set(
        sid,
        await fetchAll<LapRow>(() => supabase.from("v2_lap_times").select("id, car_number, lap_number, elapsed").eq("session_id", sid).order("id")),
      );
    }
  }

  const tables: FingerprintTables = {
    race_results,
    qualifying_results,
    practice_results,
    sessions,
    events,
    seasons,
    season_classes,
    circuit_layouts,
    session_weather,
    stints: ownStints,
    lap_times: (sid: string) => ctx.laps.get(sid) || [],
  };
  const [row] = recomputeDriverFingerprints(tables, { driverIds: [driverId] });

  // driver_id is UNIQUE (v2_driver_fingerprints_driver_unique)
  const { error } = await supabase.from("v2_driver_fingerprints").upsert(row, { onConflict: "driver_id" });
  if (error) throw new Error(`upsert fingerprint ${driverId}: ${error.message}`);
  return row;
}
