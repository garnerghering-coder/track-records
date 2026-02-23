import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Band helpers ──────────────────────────────────────────────
function dpsBand(v: number): string {
  if (v >= 80) return "Elite";
  if (v >= 65) return "Competitive";
  if (v >= 50) return "Midfield";
  if (v >= 35) return "Below Average";
  return "Developing";
}
function dcsBand(v: number): string {
  if (v >= 80) return "Rock Solid";
  if (v >= 60) return "Consistent";
  if (v >= 40) return "Variable";
  return "Unpredictable";
}
function dasBand(v: number): string {
  if (v >= 80) return "All-Rounder";
  if (v >= 60) return "Versatile";
  if (v >= 40) return "Specialist";
  return "Type-Dependent";
}
function dwsBand(v: number): string {
  if (v >= 75) return "Wet Weather Specialist";
  if (v >= 55) return "Wet-Favoured";
  if (v >= 45) return "Weather Neutral";
  if (v >= 25) return "Dry-Favoured";
  return "Dry Weather Dependent";
}

// ── Circuit character bands for DAS ───────────────────────────
function tcsBandLabel(v: number): string {
  if (v <= 41) return "Low";
  if (v <= 60) return "Mid";
  return "High";
}
function eiBandLabel(v: number): string {
  if (v <= 25) return "Low";
  if (v <= 55) return "Mid";
  return "High";
}
function csiBandLabel(v: number): string {
  if (v <= 33) return "Low";
  if (v <= 66) return "Mid";
  return "High";
}

// ── Math helpers ──────────────────────────────────────────────
function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

// ── NPS ───────────────────────────────────────────────────────
function computeNPS(position: number, totalCars: number): number {
  if (totalCars <= 1) return 1.0;
  return 1 - (position - 1) / (totalCars - 1);
}

// Session type weights
const WEIGHTS: Record<string, { nps: number; crs: number }> = {
  race: { nps: 5, crs: 3 },
  endurance_race: { nps: 5, crs: 3 },
  sprint_race: { nps: 5, crs: 3 },
  qualifying: { nps: 3, crs: 4 },
  practice: { nps: 1, crs: 1 },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    let driverIds: string[] = body.driver_ids || (body.driver_id ? [body.driver_id] : []);

    // Batch mode: recalculate all drivers who have results
    if (body.all === true && driverIds.length === 0) {
      const { data: drivers } = await supabase
        .from("v2_race_results")
        .select("driver_id")
        .not("driver_id", "is", null);
      const uniqueIds = [...new Set((drivers || []).map((d: any) => d.driver_id))];
      const offset = body.offset || 0;
      const limit = body.limit || 15;
      driverIds = (uniqueIds as string[]).slice(offset, offset + limit);
      const total = uniqueIds.length;
      console.log(`Batch mode: recalculating ${driverIds.length} drivers (offset=${offset}, total=${total})`);

      // Self-chain: process this chunk, then invoke self for the next chunk
      if (offset + limit < total) {
        const selfUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/recalculate-driver-fingerprint`;
        const nextBody = JSON.stringify({ all: true, offset: offset + limit, limit });
        // Fire-and-forget: don't await
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

    for (const driverId of driverIds) {
      const fp = await calculateFingerprint(supabase, driverId);
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

async function calculateFingerprint(supabase: any, driverId: string) {
  // ── 1. Fetch all results for this driver ────────────────────
  const [raceRes, qualRes, pracRes] = await Promise.all([
    supabase
      .from("v2_race_results")
      .select("id, position, status, dnf_reason, car_number, session_id, driver_id, v2_sessions(id, event_id, session_type, parent_session_id, name)")
      .eq("driver_id", driverId)
      .limit(500),
    supabase
      .from("v2_qualifying_results")
      .select("id, position, car_number, session_id, driver_id, v2_sessions(id, event_id, session_type, parent_session_id, name)")
      .eq("driver_id", driverId)
      .limit(500),
    supabase
      .from("v2_practice_results")
      .select("id, position, car_number, session_id, driver_id, v2_sessions(id, event_id, session_type, parent_session_id, name)")
      .eq("driver_id", driverId)
      .limit(500),
  ]);

  // Combine all results
  interface ResultRow {
    id: string;
    position: number | null;
    status?: string | null;
    dnf_reason?: string | null;
    car_number: string | null;
    session_id: string;
    driver_id: string;
    session_type: string;
    event_id: string;
    parent_session_id: string | null;
    source: string;
  }

  function mapRows(rows: any[], source: string): ResultRow[] {
    return (rows || [])
      .filter((r: any) => r.v2_sessions && !r.v2_sessions.parent_session_id)
      .map((r: any) => ({
        id: r.id,
        position: r.position,
        status: r.status || null,
        dnf_reason: r.dnf_reason || null,
        car_number: r.car_number,
        session_id: r.session_id,
        driver_id: r.driver_id,
        session_type: r.v2_sessions.session_type,
        event_id: r.v2_sessions.event_id,
        parent_session_id: r.v2_sessions.parent_session_id,
        source,
      }));
  }

  const allResults: ResultRow[] = [
    ...mapRows(raceRes.data, "race"),
    ...mapRows(qualRes.data, "qualifying"),
    ...mapRows(pracRes.data, "practice"),
  ];

  if (allResults.length === 0) {
    await upsertFingerprint(supabase, driverId, null, null, null, null, 0, 0, 0, {});
    return { dps: null, dcs: null, das: null, dws: null };
  }

  // ── 2. Get total cars per session (count distinct results) ──
  const sessionIds = [...new Set(allResults.map((r) => r.session_id))];

  // Fetch all results for these sessions to get field sizes and teammate data
  const sessionChunks: string[][] = [];
  for (let i = 0; i < sessionIds.length; i += 50) {
    sessionChunks.push(sessionIds.slice(i, i + 50));
  }

  const allSessionResults: any[] = [];
  for (const chunk of sessionChunks) {
    const [rr, qr, pr] = await Promise.all([
      supabase.from("v2_race_results").select("id, position, status, dnf_reason, car_number, session_id, driver_id").in("session_id", chunk),
      supabase.from("v2_qualifying_results").select("id, position, car_number, session_id, driver_id").in("session_id", chunk),
      supabase.from("v2_practice_results").select("id, position, car_number, session_id, driver_id").in("session_id", chunk),
    ]);
    for (const r of (rr.data || [])) allSessionResults.push({ ...r, _src: "race" });
    for (const r of (qr.data || [])) allSessionResults.push({ ...r, _src: "qualifying" });
    for (const r of (pr.data || [])) allSessionResults.push({ ...r, _src: "practice" });
  }

  // Build session field sizes (count results with non-null position)
  const sessionFieldSize: Record<string, number> = {};
  const sessionResultsByCarNumber: Record<string, Record<string, any[]>> = {};
  for (const r of allSessionResults) {
    if (r.position != null) {
      sessionFieldSize[r.session_id] = (sessionFieldSize[r.session_id] || 0) + 1;
    }
    // Group by session_id + car_number for CRS
    const key = r.session_id;
    if (!sessionResultsByCarNumber[key]) sessionResultsByCarNumber[key] = {};
    const cn = r.car_number || r.id; // fallback if no car_number
    if (!sessionResultsByCarNumber[key][cn]) sessionResultsByCarNumber[key][cn] = [];
    sessionResultsByCarNumber[key][cn].push(r);
  }

  // ── 3. Classify results and compute NPS ─────────────────────
  interface ScoredResult {
    resultRow: ResultRow;
    nps: number | null; // null = excluded
    excluded: boolean;
    sessionType: string;
    eventId: string;
    sessionId: string;
  }

  const scoredResults: ScoredResult[] = [];

  for (const r of allResults) {
    const totalCars = sessionFieldSize[r.session_id] || 1;
    let nps: number | null = null;
    let excluded = false;

    if (r.source === "race") {
      const status = (r.status || "finished").toLowerCase();
      const reason = (r.dnf_reason || "").toLowerCase();

      if (status === "dnf" || status === "retired") {
        if (reason.includes("mechanical") || reason.includes("engine") || reason.includes("gearbox") || reason.includes("hydraulic") || reason.includes("suspension") || reason.includes("electrical") || reason.includes("brake failure") || reason.includes("puncture")) {
          excluded = true;
        } else if (reason.includes("technical") || reason.includes("floor damage") || reason.includes("overheating") || reason.includes("debris") || reason.includes("cooling") || reason.includes("bodywork")) {
          excluded = true;
        } else if (reason.includes("not at fault") || reason.includes("contact")) {
          excluded = true;
        } else if (reason.includes("penali") || reason.includes("at fault") && reason.includes("penal")) {
          nps = 0.10; // Severe floor
        } else if (reason.includes("self-inflicted") || reason.includes("self inflicted") || reason.includes("loss of control") || reason.includes("spin") || reason.includes("crash") || reason.includes("accident")) {
          nps = 0.25; // Error floor
        } else {
          // Unknown DNF reason — exclude to be safe
          excluded = true;
        }
      } else if (status === "dsq" || status === "disqualified") {
        if (reason.includes("technical") || reason.includes("underweight") || reason.includes("illegal parts") || reason.includes("fuel")) {
          // Technical DSQ — use on-road NPS
          if (r.position != null) {
            nps = computeNPS(r.position, totalCars);
          } else {
            excluded = true;
          }
        } else {
          // Driving conduct DSQ
          nps = 0.10;
        }
      } else {
        // Finished / classified
        if (r.position != null) {
          nps = computeNPS(r.position, totalCars);
        } else {
          excluded = true;
        }
      }
    } else {
      // Qualifying / practice — no DNF classification
      if (r.position != null) {
        const totalCarsForSession = sessionFieldSize[r.session_id] || 1;
        nps = computeNPS(r.position, totalCarsForSession);
      } else {
        excluded = true;
      }
    }

    scoredResults.push({
      resultRow: r,
      nps: excluded ? null : nps,
      excluded,
      sessionType: r.session_type || r.source,
      eventId: r.event_id,
      sessionId: r.session_id,
    });
  }

  // ── 4. Compute CRS for each included result ─────────────────
  interface EnrichedResult extends ScoredResult {
    crs: number;
    sessionScore: number;
  }

  const enriched: EnrichedResult[] = [];

  for (const sr of scoredResults) {
    if (sr.excluded || sr.nps == null) continue;

    const r = sr.resultRow;
    const sessionPeers = sessionResultsByCarNumber[r.session_id] || {};
    const carNumber = r.car_number || r.id;
    const teammates = (sessionPeers[carNumber] || []).filter(
      (t: any) => t.driver_id !== driverId && t.position != null
    );

    let crs = 0;
    let hasCRS = false;
    const totalCars = sessionFieldSize[r.session_id] || 1;

    if (teammates.length > 0) {
      const teammateNPSValues = teammates.map((t: any) => computeNPS(t.position, totalCars));
      const carAvgNPS = mean(teammateNPSValues);
      crs = sr.nps - carAvgNPS;
      hasCRS = true;
    }

    // Session score = NPS*w_nps + CRS*w_crs
    const sessionTypeKey = sr.sessionType.includes("race") ? "race" :
      sr.sessionType === "qualifying" ? "qualifying" : "practice";
    const w = WEIGHTS[sessionTypeKey] || WEIGHTS.practice;

    let sessionScore: number;
    if (hasCRS) {
      sessionScore = (w.nps * sr.nps + w.crs * crs) / (w.nps + w.crs);
    } else {
      // Skip CRS weight — only use NPS
      sessionScore = sr.nps;
    }

    enriched.push({ ...sr, crs, sessionScore });
  }

  // ── 5. Group by event → compute SWDS per event ─────────────
  const eventSessions: Record<string, EnrichedResult[]> = {};
  for (const e of enriched) {
    if (!eventSessions[e.eventId]) eventSessions[e.eventId] = [];
    eventSessions[e.eventId].push(e);
  }

  interface EventSWDS {
    eventId: string;
    swds: number;
    sessionIds: string[];
  }

  const eventSWDSList: EventSWDS[] = [];
  for (const [eventId, results] of Object.entries(eventSessions)) {
    // Weighted average of session scores within the event
    let totalWeight = 0;
    let weightedSum = 0;
    for (const r of results) {
      const sessionTypeKey = r.sessionType.includes("race") ? "race" :
        r.sessionType === "qualifying" ? "qualifying" : "practice";
      const w = WEIGHTS[sessionTypeKey] || WEIGHTS.practice;
      const weight = w.nps + w.crs;
      totalWeight += weight;
      weightedSum += r.sessionScore * weight;
    }
    const swds = totalWeight > 0 ? weightedSum / totalWeight : 0;
    eventSWDSList.push({
      eventId,
      swds,
      sessionIds: [...new Set(results.map((r) => r.sessionId))],
    });
  }

  const eventsIncluded = eventSWDSList.length;

  // ── 6. DPS ──────────────────────────────────────────────────
  let dps: number | null = null;
  let dps_band: string | null = null;
  if (eventsIncluded >= 5) {
    const swdsValues = eventSWDSList.map((e) => e.swds);
    dps = clamp(mean(swdsValues) * 100, 0, 100);
    dps = Math.round(dps * 10) / 10;
    dps_band = dpsBand(dps);
  }

  // ── 7. DCS ──────────────────────────────────────────────────
  let dcs: number | null = null;
  let dcs_band: string | null = null;
  if (eventsIncluded >= 8) {
    const swdsValues = eventSWDSList.map((e) => e.swds);
    const sigma = stddev(swdsValues);
    dcs = clamp((1 - sigma / 0.4) * 100, 0, 100);
    dcs = Math.round(dcs * 10) / 10;
    dcs_band = dcsBand(dcs);
  }

  // ── 8. DAS — needs circuit layout data ──────────────────────
  let das: number | null = null;
  let das_band: string | null = null;

  // Fetch event → circuit → layout data
  const eventIds = eventSWDSList.map((e) => e.eventId);
  const eventChunks: string[][] = [];
  for (let i = 0; i < eventIds.length; i += 50) {
    eventChunks.push(eventIds.slice(i, i + 50));
  }

  interface EventCircuitData {
    eventId: string;
    tcs100: number | null;
    ei: number | null;
    csi: number | null;
  }

  const eventCircuitData: EventCircuitData[] = [];

  for (const chunk of eventChunks) {
    const { data: events } = await supabase
      .from("v2_events")
      .select("id, layout_id, circuit_id")
      .in("id", chunk);

    if (!events) continue;

    // Get layout IDs and circuit IDs
    const layoutIds = events.filter((e: any) => e.layout_id).map((e: any) => e.layout_id);
    const circuitIds = events.filter((e: any) => e.circuit_id && !e.layout_id).map((e: any) => e.circuit_id);

    const [layoutsRes, circuitsRes] = await Promise.all([
      layoutIds.length > 0
        ? supabase.from("v2_circuit_layouts").select("id, length_km, turns, total_straight_length_km, total_elevation_change_m, heavy_braking_corners").in("id", layoutIds)
        : { data: [] },
      circuitIds.length > 0
        ? supabase.from("v2_circuit_layouts").select("id, circuit_id, length_km, turns, total_straight_length_km, total_elevation_change_m, heavy_braking_corners, sort_order").in("circuit_id", circuitIds).order("sort_order")
        : { data: [] },
    ]);

    const layoutMap: Record<string, any> = {};
    for (const l of (layoutsRes.data || [])) layoutMap[l.id] = l;

    // For circuits without explicit layout_id, use first layout
    const circuitFirstLayout: Record<string, any> = {};
    for (const l of (circuitsRes.data || [])) {
      if (!circuitFirstLayout[l.circuit_id]) circuitFirstLayout[l.circuit_id] = l;
    }

    for (const ev of events) {
      let layout = ev.layout_id ? layoutMap[ev.layout_id] : null;
      if (!layout && ev.circuit_id) layout = circuitFirstLayout[ev.circuit_id];
      if (!layout) continue;

      const lengthKm = layout.length_km ? Number(layout.length_km) : null;
      const turns = layout.turns;
      const straightKm = layout.total_straight_length_km ? Number(layout.total_straight_length_km) : null;
      const elevM = layout.total_elevation_change_m ? Number(layout.total_elevation_change_m) : null;
      const heavyBraking = layout.heavy_braking_corners;

      let tcs100: number | null = null;
      let ei: number | null = null;
      let csi: number | null = null;

      if (lengthKm && lengthKm > 0 && turns && turns > 0) {
        if (straightKm != null) {
          const td = turns / lengthKm;
          const sr = straightKm / lengthKm;
          const tdNorm = Math.max(0, Math.min(1, (td - 1.5) / 4.3));
          const tcs = sr - tdNorm;
          tcs100 = Math.round(Math.max(0, Math.min(100, ((tcs + 1.0) / 2.0) * 100)) * 10) / 10;
        }
        if (elevM != null) {
          ei = Math.round(Math.max(0, Math.min(100, elevM / (lengthKm / 10))) * 10) / 10;
        }
        if (heavyBraking != null) {
          csi = Math.round(Math.max(0, Math.min(100, (heavyBraking / turns) * 100)) * 10) / 10;
        }
      }

      eventCircuitData.push({ eventId: ev.id, tcs100, ei, csi });
    }
  }

  // Build event → circuit map
  const circuitDataMap: Record<string, EventCircuitData> = {};
  for (const ecd of eventCircuitData) circuitDataMap[ecd.eventId] = ecd;

  // DAS calculation — evaluate each dimension independently
  // A dimension is "sufficient" if the driver has events in ≥2 bands for that dimension
  // DAS calculates if at least 2 of 3 dimensions have sufficient spread
  const dimensionVariances: number[] = [];
  let sufficientDimensions = 0;

  for (const dim of ["tcs", "ei", "csi"] as const) {
    const bandGroups: Record<string, number[]> = { Low: [], Mid: [], High: [] };

    for (const ev of eventSWDSList) {
      const cd = circuitDataMap[ev.eventId];
      if (!cd) continue;
      const val = dim === "tcs" ? cd.tcs100 : dim === "ei" ? cd.ei : cd.csi;
      if (val == null) continue;

      const band = dim === "tcs" ? tcsBandLabel(val) : dim === "ei" ? eiBandLabel(val) : csiBandLabel(val);
      bandGroups[band].push(ev.swds);
    }

    const populatedBands = Object.values(bandGroups).filter((g) => g.length > 0);
    if (populatedBands.length >= 2) {
      // This dimension has sufficient spread
      sufficientDimensions++;
      const bandMeans = populatedBands.map((g) => mean(g));
      dimensionVariances.push(variance(bandMeans));
    }
    // If < 2 bands, skip this dimension (insufficient data) but don't block others
  }

  if (sufficientDimensions >= 2 && eventsIncluded >= 3) {
    const vTotal = mean(dimensionVariances);
    das = clamp((1 - vTotal / 0.05) * 100, 0, 100);
    das = Math.round(das * 10) / 10;
    das_band = dasBand(das);
  }

  // ── 9. DWS — needs weather data ────────────────────────────
  let dws: number | null = null;
  let dws_band: string | null = null;

  // Collect all session IDs from included events
  const allIncludedSessionIds = eventSWDSList.flatMap((e) => e.sessionIds);
  const weatherChunks: string[][] = [];
  for (let i = 0; i < allIncludedSessionIds.length; i += 50) {
    weatherChunks.push(allIncludedSessionIds.slice(i, i + 50));
  }

  interface WeatherInfo {
    sessionId: string;
    isWet: boolean;
  }

  const weatherMap: Record<string, WeatherInfo> = {};
  for (const chunk of weatherChunks) {
    const { data: weatherData } = await supabase
      .from("v2_session_weather")
      .select("session_id, rain_mm, condition_summary")
      .in("session_id", chunk);

    for (const w of (weatherData || [])) {
      const isWet = (w.rain_mm != null && w.rain_mm > 0.5) ||
        (w.condition_summary || "").toLowerCase().match(/rain|wet|damp|shower/) != null;
      weatherMap[w.session_id] = { sessionId: w.session_id, isWet };
    }
  }

  // For each event, classify as wet if any race session was wet
  const wetEventSWDS: number[] = [];
  const dryEventSWDS: number[] = [];

  for (const ev of eventSWDSList) {
    const anyWet = ev.sessionIds.some((sid) => weatherMap[sid]?.isWet);
    if (anyWet) {
      wetEventSWDS.push(ev.swds);
    } else {
      dryEventSWDS.push(ev.swds);
    }
  }

  const wetSessions = wetEventSWDS.length;
  const drySessions = dryEventSWDS.length;

  if (wetSessions >= 2 && drySessions >= 4) {
    const delta = mean(wetEventSWDS) - mean(dryEventSWDS);
    dws = clamp(50 + delta * 200, 0, 100);
    dws = Math.round(dws * 10) / 10;
    dws_band = dwsBand(dws);
  }

  // ── 10. Upsert ─────────────────────────────────────────────
  await upsertFingerprint(supabase, driverId, dps, dcs, das, dws, eventsIncluded, wetSessions, drySessions, {
    dps_band,
    dcs_band,
    das_band,
    dws_band,
  });

  return { dps, dps_band, dcs, dcs_band, das, das_band, dws, dws_band, events_included: eventsIncluded };
}

async function upsertFingerprint(
  supabase: any,
  driverId: string,
  dps: number | null,
  dcs: number | null,
  das: number | null,
  dws: number | null,
  eventsIncluded: number,
  wetSessions: number,
  drySessions: number,
  bands: Record<string, string | null>
) {
  const row = {
    driver_id: driverId,
    dps,
    dps_band: bands.dps_band || null,
    dcs,
    dcs_band: bands.dcs_band || null,
    das,
    das_band: bands.das_band || null,
    dws,
    dws_band: bands.dws_band || null,
    events_included: eventsIncluded,
    wet_sessions: wetSessions,
    dry_sessions: drySessions,
    last_calculated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("v2_driver_fingerprints")
    .select("id")
    .eq("driver_id", driverId)
    .maybeSingle();

  if (existing) {
    await supabase.from("v2_driver_fingerprints").update(row).eq("driver_id", driverId);
  } else {
    await supabase.from("v2_driver_fingerprints").insert(row);
  }
}
