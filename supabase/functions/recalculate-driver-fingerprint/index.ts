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
      .select("id, position, status, dnf_reason, car_number, session_id, driver_id, extra_data, v2_sessions(id, event_id, session_type, parent_session_id, name)")
      .eq("driver_id", driverId)
      .limit(500),
    supabase
      .from("v2_qualifying_results")
      .select("id, position, car_number, session_id, driver_id, extra_data, v2_sessions(id, event_id, session_type, parent_session_id, name)")
      .eq("driver_id", driverId)
      .limit(500),
    supabase
      .from("v2_practice_results")
      .select("id, position, car_number, session_id, driver_id, extra_data, v2_sessions(id, event_id, session_type, parent_session_id, name)")
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
    extra_data: any;
    isHourSubSession: boolean;
  }

  function mapRows(rows: any[], source: string): ResultRow[] {
    return (rows || [])
      .filter((r: any) => r.v2_sessions)
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
        extra_data: r.extra_data || null,
        isHourSubSession: !!r.v2_sessions.parent_session_id,
      }));
  }

  let allResults: ResultRow[] = [
    ...mapRows(raceRes.data, "race"),
    ...mapRows(qualRes.data, "qualifying"),
    ...mapRows(pracRes.data, "practice"),
  ];

  // ── 1a. Find co-driver endurance race results ───────────────
  // For endurance races, the parent session result may have a different driver_id.
  // Find events where this driver has practice/qualifying/hour results and add the
  // parent endurance_race result as a co-driver credit.
  const driverEventCarNumbers = new Map<string, Set<string>>();
  for (const r of allResults) {
    if (r.car_number) {
      if (!driverEventCarNumbers.has(r.event_id)) driverEventCarNumbers.set(r.event_id, new Set());
      driverEventCarNumbers.get(r.event_id)!.add(r.car_number);
    }
  }

  // Check which events already have a parent-level race/endurance_race result
  const eventsWithParentRace = new Set<string>();
  for (const r of allResults) {
    if (!r.isHourSubSession && (r.session_type === "race" || r.session_type === "endurance_race" || r.session_type === "sprint_race")) {
      eventsWithParentRace.add(r.event_id);
    }
  }

  // Find events where driver participated but has no parent race result
  const missingRaceEventIds = [...driverEventCarNumbers.keys()].filter(eid => !eventsWithParentRace.has(eid));
  
  if (missingRaceEventIds.length > 0) {
    for (let i = 0; i < missingRaceEventIds.length; i += 50) {
      const chunk = missingRaceEventIds.slice(i, i + 50);
      // Find parent race sessions for these events
      const { data: raceSessions } = await supabase
        .from("v2_sessions")
        .select("id, event_id, session_type, parent_session_id")
        .in("event_id", chunk)
        .is("parent_session_id", null)
        .in("session_type", ["race", "endurance_race", "sprint_race"]);
      
      if (raceSessions && raceSessions.length > 0) {
        const raceSessionIds = raceSessions.map((s: any) => s.id);
        const carNumbers = new Set<string>();
        for (const eid of chunk) {
          const cars = driverEventCarNumbers.get(eid);
          if (cars) cars.forEach(c => carNumbers.add(c));
        }
        
        const { data: coDriverRaceResults } = await supabase
          .from("v2_race_results")
          .select("id, position, status, dnf_reason, car_number, session_id, driver_id, extra_data, v2_sessions(id, event_id, session_type, parent_session_id, name)")
          .in("session_id", raceSessionIds)
          .in("car_number", [...carNumbers]);
        
        if (coDriverRaceResults) {
          for (const r of coDriverRaceResults) {
            if (!r.v2_sessions) continue;
            const eventId = r.v2_sessions.event_id;
            const cars = driverEventCarNumbers.get(eventId);
            if (cars && cars.has(r.car_number)) {
              allResults.push({
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
                source: "race",
                extra_data: r.extra_data || null,
                isHourSubSession: false,
              });
            }
          }
        }
      }
    }
  }

  // For endurance events, if we have hour sub-sessions, exclude the parent endurance_race
  // result to avoid double-counting — hour sub-sessions give per-driver granularity
  const eventsWithHourSubs = new Set<string>();
  for (const r of allResults) {
    if (r.isHourSubSession) eventsWithHourSubs.add(r.event_id);
  }
  
  // Remove parent endurance_race results for events that have hour sub-sessions
  // (hour sub-sessions are more granular and per-driver)
  allResults = allResults.filter(r => {
    if (r.session_type === "endurance_race" && !r.isHourSubSession && eventsWithHourSubs.has(r.event_id)) {
      return false; // Skip parent result, use hour sub-sessions instead
    }
    return true;
  });

  if (allResults.length === 0) {
    await upsertFingerprint(supabase, driverId, null, null, null, null, null, 0, 0, 0, {});
    return { dps: null, dcs: null, das: null, dws: null, adps: null };
  }

  // ── 1b. Fetch season multiclass info for events ─────────────
  const eventIds = [...new Set(allResults.map((r) => r.event_id))];
  const eventChunksForSeasons: string[][] = [];
  for (let i = 0; i < eventIds.length; i += 50) {
    eventChunksForSeasons.push(eventIds.slice(i, i + 50));
  }

  // event_id → { is_multiclass, cdm (season-level), season_id }
  interface SeasonInfo {
    is_multiclass: boolean;
    cdm: number | null;
    season_id: string;
  }
  const eventSeasonMap: Record<string, SeasonInfo> = {};

  for (const chunk of eventChunksForSeasons) {
    const { data: events } = await supabase
      .from("v2_events")
      .select("id, season_id, v2_seasons(id, is_multiclass, cdm)")
      .in("id", chunk);
    for (const ev of (events || [])) {
      const season = ev.v2_seasons;
      if (season) {
        eventSeasonMap[ev.id] = {
          is_multiclass: !!season.is_multiclass,
          cdm: season.cdm != null ? Number(season.cdm) : null,
          season_id: season.id,
        };
      }
    }
  }

  // Fetch class-level CDMs for multiclass seasons
  const multiclassSeasonIds = [...new Set(
    Object.values(eventSeasonMap).filter((s) => s.is_multiclass).map((s) => s.season_id)
  )];
  // class_name → cdm, keyed by season_id
  const classCdmMap: Record<string, Record<string, number>> = {};
  if (multiclassSeasonIds.length > 0) {
    const { data: classes } = await supabase
      .from("v2_season_classes")
      .select("season_id, class_name, cdm")
      .in("season_id", multiclassSeasonIds);
    for (const c of (classes || [])) {
      if (!classCdmMap[c.season_id]) classCdmMap[c.season_id] = {};
      if (c.cdm != null) classCdmMap[c.season_id][c.class_name] = Number(c.cdm);
    }
  }

  // ── 2. Get total cars per session (count distinct results) ──
  const sessionIds = [...new Set(allResults.map((r) => r.session_id))];

  const sessionChunks: string[][] = [];
  for (let i = 0; i < sessionIds.length; i += 50) {
    sessionChunks.push(sessionIds.slice(i, i + 50));
  }

  const allSessionResults: any[] = [];
  for (const chunk of sessionChunks) {
    const [rr, qr, pr] = await Promise.all([
      supabase.from("v2_race_results").select("id, position, status, dnf_reason, car_number, session_id, driver_id, extra_data").in("session_id", chunk),
      supabase.from("v2_qualifying_results").select("id, position, car_number, session_id, driver_id, extra_data").in("session_id", chunk),
      supabase.from("v2_practice_results").select("id, position, car_number, session_id, driver_id, extra_data").in("session_id", chunk),
    ]);
    for (const r of (rr.data || [])) allSessionResults.push({ ...r, _src: "race" });
    for (const r of (qr.data || [])) allSessionResults.push({ ...r, _src: "qualifying" });
    for (const r of (pr.data || [])) allSessionResults.push({ ...r, _src: "practice" });
  }

  // Build session field sizes (count results with non-null position)
  const sessionFieldSize: Record<string, number> = {};
  const sessionResultsByCarNumber: Record<string, Record<string, any[]>> = {};
  // For multiclass: count classified finishers per class per session
  const sessionClassFieldSize: Record<string, Record<string, number>> = {};

  for (const r of allSessionResults) {
    if (r.position != null) {
      sessionFieldSize[r.session_id] = (sessionFieldSize[r.session_id] || 0) + 1;

      // Track class field sizes
      const cls = r.extra_data?.Class;
      if (cls) {
        if (!sessionClassFieldSize[r.session_id]) sessionClassFieldSize[r.session_id] = {};
        sessionClassFieldSize[r.session_id][cls] = (sessionClassFieldSize[r.session_id][cls] || 0) + 1;
      }
    }
    // Group by session_id + car_number for CRS
    const key = r.session_id;
    if (!sessionResultsByCarNumber[key]) sessionResultsByCarNumber[key] = {};
    const cn = r.car_number || r.id;
    if (!sessionResultsByCarNumber[key][cn]) sessionResultsByCarNumber[key][cn] = [];
    sessionResultsByCarNumber[key][cn].push(r);
  }

  // ── 3. Classify results and compute NPS ─────────────────────
  // We need to know which event each session belongs to, for multiclass check
  // Build session → event map from allResults
  const sessionEventMap: Record<string, string> = {};
  for (const r of allResults) {
    sessionEventMap[r.session_id] = r.event_id;
  }

  interface ScoredResult {
    resultRow: ResultRow;
    nps: number | null;
    excluded: boolean;
    sessionType: string;
    eventId: string;
    sessionId: string;
  }

  const scoredResults: ScoredResult[] = [];

  for (const r of allResults) {
    const seasonInfo = eventSeasonMap[r.event_id];
    const isMulticlass = seasonInfo?.is_multiclass || false;
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
        } else if (reason.includes("penali") || (reason.includes("at fault") && reason.includes("penal"))) {
          nps = 0.10;
        } else if (reason.includes("self-inflicted") || reason.includes("self inflicted") || reason.includes("loss of control") || reason.includes("spin") || reason.includes("crash") || reason.includes("accident")) {
          nps = 0.25;
        } else {
          excluded = true;
        }
      } else if (status === "dsq" || status === "disqualified") {
        if (reason.includes("technical") || reason.includes("underweight") || reason.includes("illegal parts") || reason.includes("fuel")) {
          if (r.position != null) {
            nps = computeNPSForResult(r, isMulticlass, sessionFieldSize, sessionClassFieldSize);
          } else {
            excluded = true;
          }
        } else {
          nps = 0.10;
        }
      } else {
        // Finished / classified
        if (r.position != null) {
          nps = computeNPSForResult(r, isMulticlass, sessionFieldSize, sessionClassFieldSize);
        } else {
          excluded = true;
        }
      }
    } else {
      // Qualifying / practice — no DNF classification
      if (r.position != null) {
        // For qual/practice in multiclass, still use PIC if available
        nps = computeNPSForResult(r, isMulticlass, sessionFieldSize, sessionClassFieldSize);
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
    hasCRS: boolean;
    lapPaceScore: number | null;
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

    const sessionTypeKey = sr.sessionType.includes("race") ? "race" :
      sr.sessionType === "qualifying" ? "qualifying" : "practice";
    const w = WEIGHTS[sessionTypeKey] || WEIGHTS.practice;

    let sessionScore: number;
    if (hasCRS) {
      sessionScore = (w.nps * sr.nps + w.crs * crs) / (w.nps + w.crs);
    } else {
      sessionScore = sr.nps;
    }

    enriched.push({ ...sr, crs, sessionScore, hasCRS, lapPaceScore: null });
  }

  // ── 4b. Lap-time-based pace enhancement ─────────────────────
  // For sessions with lap time data, compute how the driver's pace compares
  // to the class average — this gives a much more granular performance signal
  const raceSessionIds = [...new Set(enriched.filter(e => e.sessionType.includes("race")).map(e => e.sessionId))];
  
  if (raceSessionIds.length > 0) {
    // Check for stint data linking driver to car
    const stintChunks: string[][] = [];
    for (let i = 0; i < raceSessionIds.length; i += 20) {
      stintChunks.push(raceSessionIds.slice(i, i + 20));
    }

    interface StintData {
      session_id: string;
      car_number: string;
      driver_id: string;
      start_elapsed: number;
      end_elapsed: number;
    }

    const driverStints: StintData[] = [];
    for (const chunk of stintChunks) {
      const { data: stints } = await supabase
        .from("v2_stints")
        .select("session_id, car_number, driver_id, start_elapsed, end_elapsed")
        .eq("driver_id", driverId)
        .in("session_id", chunk)
        .limit(500);
      if (stints) {
        for (const s of stints) {
          driverStints.push({
            session_id: s.session_id,
            car_number: s.car_number,
            driver_id: s.driver_id,
            start_elapsed: Number(s.start_elapsed),
            end_elapsed: Number(s.end_elapsed),
          });
        }
      }
    }

    if (driverStints.length > 0) {
      // Group stints by session
      const stintsBySession: Record<string, StintData[]> = {};
      for (const s of driverStints) {
        if (!stintsBySession[s.session_id]) stintsBySession[s.session_id] = [];
        stintsBySession[s.session_id].push(s);
      }

      // For sessions with stints, fetch lap times to compute pace
      const sessionsWithStints = Object.keys(stintsBySession);
      for (let i = 0; i < sessionsWithStints.length; i += 5) {
        const sessionBatch = sessionsWithStints.slice(i, i + 5);
        
        for (const sid of sessionBatch) {
          const driverCarNumbers = [...new Set(stintsBySession[sid].map(s => s.car_number))];
          
          // Fetch all lap times for this session (sampled)
          const { data: allLaps } = await supabase
            .from("v2_lap_times")
            .select("car_number, lap_number, elapsed")
            .eq("session_id", sid)
            .order("car_number")
            .order("lap_number")
            .limit(5000);
          
          if (!allLaps || allLaps.length < 10) continue;
          
          // Compute lap durations per car
          const carLapDurations: Record<string, number[]> = {};
          const lapsByCarSorted: Record<string, { lap: number; elapsed: number }[]> = {};
          for (const l of allLaps) {
            if (!lapsByCarSorted[l.car_number]) lapsByCarSorted[l.car_number] = [];
            lapsByCarSorted[l.car_number].push({ lap: l.lap_number, elapsed: Number(l.elapsed) });
          }
          
          for (const [cn, laps] of Object.entries(lapsByCarSorted)) {
            laps.sort((a, b) => a.lap - b.lap);
            const durations: number[] = [];
            for (let j = 1; j < laps.length; j++) {
              const dur = laps[j].elapsed - laps[j - 1].elapsed;
              if (dur > 20 && dur < 600) { // reasonable lap time range
                durations.push(dur);
              }
            }
            if (durations.length > 0) carLapDurations[cn] = durations;
          }
          
          // Compute class median pace for normalization
          const enrichedForSession = enriched.filter(e => e.sessionId === sid);
          const driverClass = enrichedForSession[0]?.resultRow.extra_data?.Class || "Overall";
          
          // Get all cars in the same class
          const classCars = allSessionResults
            .filter((r: any) => r.session_id === sid && (r.extra_data?.Class || "Overall") === driverClass)
            .map((r: any) => r.car_number)
            .filter(Boolean);
          
          const classMedianPaces: number[] = [];
          for (const cn of classCars) {
            const durations = carLapDurations[cn];
            if (durations && durations.length >= 3) {
              // Use median lap time (robust to outliers)
              const sorted = [...durations].sort((a, b) => a - b);
              const median = sorted[Math.floor(sorted.length / 2)];
              classMedianPaces.push(median);
            }
          }
          
          if (classMedianPaces.length < 3) continue;
          
          const fieldMedian = classMedianPaces.sort((a, b) => a - b)[Math.floor(classMedianPaces.length / 2)];
          
          // Now compute the driver's pace during their stints
          for (const carNum of driverCarNumbers) {
            const driverDurations = carLapDurations[carNum];
            if (!driverDurations || driverDurations.length < 3) continue;
            
            // Filter to laps during driver's stints only
            const carLaps = lapsByCarSorted[carNum] || [];
            const driverLapDurations: number[] = [];
            const stintsForCar = stintsBySession[sid].filter(s => s.car_number === carNum);
            
            for (let j = 1; j < carLaps.length; j++) {
              const lapElapsed = carLaps[j].elapsed;
              const dur = lapElapsed - carLaps[j - 1].elapsed;
              if (dur < 20 || dur > 600) continue;
              
              // Check if this lap was during a driver stint
              const inStint = stintsForCar.some(s => lapElapsed >= s.start_elapsed && lapElapsed <= s.end_elapsed);
              if (inStint) driverLapDurations.push(dur);
            }
            
            if (driverLapDurations.length < 3) continue;
            
            // Driver's median pace
            const driverSorted = [...driverLapDurations].sort((a, b) => a - b);
            const driverMedian = driverSorted[Math.floor(driverSorted.length / 2)];
            
            // Pace ratio: <1 means faster than field, >1 means slower
            const paceRatio = driverMedian / fieldMedian;
            // Convert to 0-1 score: 0.95 ratio = excellent (1.0), 1.05 = poor (0.0)
            const paceScore = clamp((1.05 - paceRatio) / 0.10, 0, 1);
            
            // Consistency bonus: low variance = more consistent driver
            const driverStddev = stddev(driverLapDurations);
            const consistencyRatio = driverStddev / driverMedian;
            const consistencyScore = clamp((0.05 - consistencyRatio) / 0.04, 0, 1);
            
            // Combined lap performance score (70% pace, 30% consistency)
            const lapScore = paceScore * 0.7 + consistencyScore * 0.3;
            
            // Apply to enriched results for this session
            for (const e of enriched) {
              if (e.sessionId === sid) {
                e.lapPaceScore = lapScore;
                // Blend lap score with existing session score (50/50 when lap data available)
                e.sessionScore = e.sessionScore * 0.5 + lapScore * 0.5;
              }
            }
          }
        }
      }
    }
  }

  // ── 4c. Spec series awareness ───────────────────────────────
  // For spec series, all drivers use the same car, so CRS comparisons
  // against teammates are especially meaningful (no equipment advantage)
  // Check which seasons are spec series
  const specSeasonIds = new Set<string>();
  for (const [eventId, si] of Object.entries(eventSeasonMap)) {
    // We'll check this below after fetching spec info
  }
  
  // Fetch spec series info for involved seasons
  const involvedSeasonIds = [...new Set(Object.values(eventSeasonMap).map(s => s.season_id))];
  if (involvedSeasonIds.length > 0) {
    for (let i = 0; i < involvedSeasonIds.length; i += 50) {
      const chunk = involvedSeasonIds.slice(i, i + 50);
      const { data: seasons } = await supabase
        .from("v2_seasons")
        .select("id, is_spec_series")
        .in("id", chunk);
      if (seasons) {
        for (const s of seasons) {
          if (s.is_spec_series) specSeasonIds.add(s.id);
        }
      }
    }
  }
  
  // For spec series events, CRS has higher weight (equipment is equalized)
  for (const e of enriched) {
    const si = eventSeasonMap[e.eventId];
    if (si && specSeasonIds.has(si.season_id) && e.hasCRS) {
      const sessionTypeKey = e.sessionType.includes("race") ? "race" :
        e.sessionType === "qualifying" ? "qualifying" : "practice";
      const w = WEIGHTS[sessionTypeKey] || WEIGHTS.practice;
      // In spec series, increase CRS weight by 50% since car performance is equalized
      const boostedCrsWeight = w.crs * 1.5;
      e.sessionScore = (w.nps * e.nps! + boostedCrsWeight * e.crs) / (w.nps + boostedCrsWeight);
      
      // Re-blend with lap pace if available
      if (e.lapPaceScore != null) {
        e.sessionScore = e.sessionScore * 0.5 + e.lapPaceScore * 0.5;
      }
    }
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
    let totalWeight = 0;
    let weightedSum = 0;
    for (const r of results) {
      const sessionTypeKey = r.sessionType.includes("race") ? "race" :
        r.sessionType === "qualifying" ? "qualifying" : "practice";
      const w = WEIGHTS[sessionTypeKey] || WEIGHTS.practice;
      const weight = r.hasCRS ? (w.nps + w.crs) : w.nps;
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

  // ── 6. DPS (internal) ───────────────────────────────────────
  let dps: number | null = null;
  let dps_band: string | null = null;
  if (eventsIncluded >= 5) {
    const swdsValues = eventSWDSList.map((e) => e.swds);
    dps = clamp(mean(swdsValues) * 100, 0, 100);
    dps = Math.round(dps * 10) / 10;
    dps_band = dpsBand(dps);
  }

  // ── 6b. aDPS (displayed) — DPS × CDM ───────────────────────
  let adps: number | null = null;
  let adps_band: string | null = null;

  if (dps != null) {
    const eventCdms: number[] = [];
    for (const ev of eventSWDSList) {
      const si = eventSeasonMap[ev.eventId];
      if (!si) continue;

      if (si.is_multiclass) {
        // Find the driver's class in this event from their results
        const driverResults = enriched.filter((e) => e.eventId === ev.eventId);
        const driverClass = driverResults.find((r) => r.resultRow.extra_data?.Class)?.resultRow.extra_data?.Class;
        if (driverClass && classCdmMap[si.season_id]?.[driverClass] != null) {
          eventCdms.push(classCdmMap[si.season_id][driverClass]);
        } else if (si.cdm != null) {
          eventCdms.push(si.cdm);
        }
      } else {
        if (si.cdm != null) {
          eventCdms.push(si.cdm);
        }
      }
    }

    if (eventCdms.length > 0) {
      const avgCdm = mean(eventCdms);
      adps = clamp(dps * avgCdm, 0, 100);
      adps = Math.round(adps * 10) / 10;
      adps_band = dpsBand(adps);
    }
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

  const eventIdsForCircuits = eventSWDSList.map((e) => e.eventId);
  const eventChunks: string[][] = [];
  for (let i = 0; i < eventIdsForCircuits.length; i += 50) {
    eventChunks.push(eventIdsForCircuits.slice(i, i + 50));
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

  const circuitDataMap: Record<string, EventCircuitData> = {};
  for (const ecd of eventCircuitData) circuitDataMap[ecd.eventId] = ecd;

  // DAS calculation — evaluate each dimension independently
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
      sufficientDimensions++;
      const bandMeans = populatedBands.map((g) => mean(g));
      dimensionVariances.push(variance(bandMeans));
    }
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

  // Collect all session IDs including hour sub-sessions for weather matching
  // For endurance events, weather is often on the hour sub-sessions
  const allIncludedSessionIds = eventSWDSList.flatMap((e) => e.sessionIds);
  
  // Also find hour sub-session IDs for events (they carry weather data)
  const includedEventIds = [...new Set(eventSWDSList.map((e) => e.eventId))];
  const subSessionIds: string[] = [];
  for (let i = 0; i < includedEventIds.length; i += 50) {
    const chunk = includedEventIds.slice(i, i + 50);
    const { data: subSessions } = await supabase
      .from("v2_sessions")
      .select("id, event_id, parent_session_id")
      .in("event_id", chunk)
      .not("parent_session_id", "is", null);
    if (subSessions) {
      for (const s of subSessions) subSessionIds.push(s.id);
    }
  }

  const allWeatherSessionIds = [...new Set([...allIncludedSessionIds, ...subSessionIds])];
  const weatherChunks: string[][] = [];
  for (let i = 0; i < allWeatherSessionIds.length; i += 50) {
    weatherChunks.push(allWeatherSessionIds.slice(i, i + 50));
  }

  // Map sub-session → event for weather aggregation
  const subSessionEventMap: Record<string, string> = {};
  for (const r of allResults) {
    subSessionEventMap[r.session_id] = r.event_id;
  }

  interface WeatherInfo {
    sessionId: string;
    isWet: boolean;
    eventId?: string;
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
  
  // Build event → isWet map including sub-session weather
  const eventWetMap: Record<string, boolean> = {};
  for (const [sid, wInfo] of Object.entries(weatherMap)) {
    if (wInfo.isWet) {
      // Find which event this session belongs to
      const eventId = subSessionEventMap[sid];
      if (eventId) eventWetMap[eventId] = true;
    }
  }
  // Also check sub-sessions by matching event via the sub-session query
  for (const r of allResults) {
    if (weatherMap[r.session_id]?.isWet) {
      eventWetMap[r.event_id] = true;
    }
  }

  const wetEventSWDS: number[] = [];
  const dryEventSWDS: number[] = [];

  for (const ev of eventSWDSList) {
    // Check direct session weather + sub-session weather via eventWetMap
    const anyWet = ev.sessionIds.some((sid) => weatherMap[sid]?.isWet) || eventWetMap[ev.eventId];
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
  await upsertFingerprint(supabase, driverId, dps, dcs, das, dws, adps, eventsIncluded, wetSessions, drySessions, {
    dps_band,
    dcs_band,
    das_band,
    dws_band,
    adps_band,
  });

  return { dps, dps_band, dcs, dcs_band, das, das_band, dws, dws_band, adps, adps_band, events_included: eventsIncluded };
}

// ── Helper: compute NPS for a result, handling multiclass ─────
function computeNPSForResult(
  r: { position: number | null; extra_data: any; session_id: string },
  isMulticlass: boolean,
  sessionFieldSize: Record<string, number>,
  sessionClassFieldSize: Record<string, Record<string, number>>
): number {
  if (r.position == null) return 0;

  if (isMulticlass) {
    const pic = r.extra_data?.PIC;
    const cls = r.extra_data?.Class;
    if (pic != null && cls) {
      const classTotal = sessionClassFieldSize[r.session_id]?.[cls] || 1;
      return computeNPS(Number(pic), classTotal);
    }
  }

  // Fallback: use overall position
  const totalCars = sessionFieldSize[r.session_id] || 1;
  return computeNPS(r.position, totalCars);
}


async function upsertFingerprint(
  supabase: any,
  driverId: string,
  dps: number | null,
  dcs: number | null,
  das: number | null,
  dws: number | null,
  adps: number | null,
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
    adps,
    adps_band: bands.adps_band || null,
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
