import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ──────────────────────────────────────────────────────────

function matchDriver(
  fullName: string,
  existingDrivers: Array<{ id: string; full_name: string }>,
  aliasMap: Map<string, string>
): string | null {
  const normalized = fullName.toLowerCase().trim();

  const aliasId = aliasMap.get(normalized);
  if (aliasId) return aliasId;

  for (const d of existingDrivers) {
    if (d.full_name.toLowerCase() === normalized) return d.id;
  }

  const parts = normalized.split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    for (const d of existingDrivers) {
      const dp = d.full_name.toLowerCase().split(/\s+/);
      if (dp.length >= 2 && dp[0] === first && dp[dp.length - 1] === last) return d.id;
    }
  }

  return null;
}

function matchTeam(
  teamName: string,
  existingTeams: Array<{ id: string; full_name: string; short_name: string | null }>,
  seasonAliases: Array<{ team_id: string; display_name: string }>,
  aliasMap: Map<string, string>
): string | null {
  const normalized = teamName.toLowerCase().trim();

  const aliasId = aliasMap.get(normalized);
  if (aliasId) return aliasId;

  for (const t of existingTeams) {
    if (t.full_name.toLowerCase() === normalized) return t.id;
    if (t.short_name && t.short_name.toLowerCase() === normalized) return t.id;
  }

  for (const a of seasonAliases) {
    if (a.display_name.toLowerCase() === normalized) return a.team_id;
    if (a.display_name.toLowerCase().includes(normalized) || normalized.includes(a.display_name.toLowerCase())) return a.team_id;
  }

  for (const t of existingTeams) {
    if (t.full_name.toLowerCase().includes(normalized) || normalized.includes(t.full_name.toLowerCase())) return t.id;
  }

  return null;
}

/** Detect session type from the JSON session data or folder name */
function detectSessionType(sessionName: string, sessionType?: string): { type: string; name: string } {
  const lower = (sessionType || sessionName).toLowerCase();
  if (/qualifying/i.test(lower)) return { type: "qualifying", name: sessionName };
  if (/free\s*practice|practice/i.test(lower)) return { type: "practice", name: sessionName };
  if (/warm\s*up/i.test(lower)) return { type: "warmup", name: sessionName };
  if (/race|hour/i.test(lower)) return { type: "race", name: sessionName };
  if (/sprint/i.test(lower)) return { type: "sprint_race", name: sessionName };
  return { type: "other", name: sessionName };
}

/** Parse IMSA status string to our enum */
function parseStatus(status: string, notFinished: boolean, cause: string): string {
  if (!notFinished && (status === "Classified" || status === "Not Classified" || !status)) return "finished";
  if (notFinished) {
    const c = (cause || "").toUpperCase();
    if (c.includes("DNS")) return "dns";
    if (c.includes("DSQ") || c.includes("DISQUALIF")) return "dsq";
    return "dnf";
  }
  const s = status.toUpperCase().trim();
  if (s === "DNF" || s === "MECHANICAL" || s === "ACCIDENT" || s === "RETIREMENT") return "dnf";
  if (s === "DNS") return "dns";
  if (s === "DSQ" || s === "DISQUALIFIED") return "dsq";
  return "finished";
}

// ── Main ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { url, event_id, mode } = await req.json();
    const isPreview = mode === "preview";

    if (!url || !event_id) {
      return new Response(
        JSON.stringify({ error: "Both url and event_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify event exists
    const { data: event, error: eventErr } = await adminClient
      .from("v2_events")
      .select("id, name, season_id, circuit_id, v2_seasons(year, series_id, v2_series(name, v2_series_aliases(alias)))")
      .eq("id", event_id)
      .single();
    if (eventErr || !event) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 1: Fetch the IMSA results page HTML directly (no Firecrawl needed) ──
    // The alkamelcloud site is server-rendered HTML with all links embedded
    console.log("Fetching IMSA page:", url);
    const pageResponse = await fetch(url);
    if (!pageResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch IMSA page: ${pageResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const html = await pageResponse.text();

    // Extract all href links from the HTML
    const hrefRegex = /href="([^"]+\.JSON)"/gi;
    const allJsonLinks: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = hrefRegex.exec(html)) !== null) {
      allJsonLinks.push(match[1]);
    }

    console.log(`Found ${allJsonLinks.length} total .JSON links in HTML`);

    // Filter for results JSON files (prefixed with 03_Results_)
    // Resolve relative URLs against the IMSA base URL
    const baseUrl = "https://imsa.results.alkamelcloud.com/";

    // Build series name matchers from the event's series name + aliases
    const season = event.v2_seasons as any;
    const seriesObj = season?.v2_series;
    const seriesName: string = seriesObj?.name || "";
    const seriesAliasesList: string[] = (seriesObj?.v2_series_aliases || []).map((a: any) => a.alias);
    const allSeriesNames = [seriesName, ...seriesAliasesList].filter(Boolean).map(n => n.toLowerCase());

    console.log("Series filter names:", allSeriesNames);

    const resultsJsonLinks = allJsonLinks
      .filter(l => /03_Results_/i.test(l))
      .filter(l => {
        // The URL path contains the series name in a folder like "01_IMSA WeatherTech SportsCar Championship"
        // Decode and check if any series name/alias is a substring of the path
        const decoded = decodeURIComponent(l).toLowerCase();
        return allSeriesNames.some(sn => decoded.includes(sn.toLowerCase()));
      })
      .map(l => {
        try {
          return new URL(l, baseUrl).href;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];

    console.log(`Found ${resultsJsonLinks.length} series-filtered results JSON links (from ${allJsonLinks.length} total):`, resultsJsonLinks.slice(0, 5));

    if (resultsJsonLinks.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No results JSON files found on this page. Make sure you're linking to an IMSA event results page on alkamelcloud.com that has session results.",
          debug_json_links_found: allJsonLinks.length,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 2: Load reference data for matching ──
    const seasonId = event.season_id;
    const [driversRes, teamsRes, existingSessionsRes, aliasesRes, seasonCarsRes, driverAliasesRes, teamAliasesRes] = await Promise.all([
      adminClient.from("v2_drivers").select("id, full_name"),
      adminClient.from("v2_teams").select("id, full_name, short_name"),
      adminClient.from("v2_sessions").select("id, name").eq("event_id", event_id),
      adminClient.from("v2_team_season_names").select("team_id, display_name").eq("season_id", seasonId),
      adminClient.from("v2_team_season_cars").select("team_id, car_id").eq("season_id", seasonId),
      adminClient.from("search_aliases").select("alias, canonical, entity_type").eq("entity_type", "driver"),
      adminClient.from("search_aliases").select("alias, canonical, entity_type").eq("entity_type", "team"),
    ]);

    const existingDrivers = driversRes.data || [];
    const existingTeams = teamsRes.data || [];
    const existingSessionNames = new Set((existingSessionsRes.data || []).map((s: any) => s.name));
    const seasonAliases: Array<{ team_id: string; display_name: string }> = (aliasesRes.data || []) as any;
    const seasonCarMap = new Map<string, string>();
    for (const sc of (seasonCarsRes.data || []) as any[]) seasonCarMap.set(sc.team_id, sc.car_id);

    const driverAliasMap = new Map<string, string>();
    for (const a of (driverAliasesRes.data || []) as any[]) driverAliasMap.set(a.alias.toLowerCase(), a.canonical);
    const teamAliasMap = new Map<string, string>();
    for (const a of (teamAliasesRes.data || []) as any[]) teamAliasMap.set(a.alias.toLowerCase(), a.canonical);

    // ── Step 3: Fetch each JSON file and process ──
    const summary = {
      sessions_created: 0,
      sessions_skipped: 0,
      total_entries: 0,
      drivers_matched: 0,
      drivers_created: 0,
      teams_matched: 0,
      teams_created: 0,
      errors: [] as string[],
    };

    // Get max sort order
    const { data: allSessions } = await adminClient
      .from("v2_sessions")
      .select("sort_order")
      .eq("event_id", event_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    let sortOrder = (allSessions?.[0]?.sort_order ?? -1) + 1;

    for (const jsonUrl of resultsJsonLinks) {
      try {
        console.log("Fetching JSON:", jsonUrl);
        const jsonResponse = await fetch(jsonUrl);
        if (!jsonResponse.ok) {
          summary.errors.push(`Failed to fetch ${jsonUrl}: ${jsonResponse.status}`);
          continue;
        }

        const data = await jsonResponse.json();

        // The IMSA JSON has: { session: {...}, classification: [...] }
        const sessionData = data.session || {};
        const sessionName = sessionData.session_name || "Unknown Session";
        const sessionType = sessionData.session_type || "";
        const sessionInfo = detectSessionType(sessionName, sessionType);

        // Skip if session already exists
        if (existingSessionNames.has(sessionInfo.name)) {
          console.log(`Skipping duplicate session: ${sessionInfo.name}`);
          summary.sessions_skipped++;
          continue;
        }

        const entries: any[] = data.classification || [];

        if (entries.length === 0) {
          summary.errors.push(`No entries found in ${sessionInfo.name}`);
          continue;
        }

        if (isPreview) {
          summary.sessions_created++;
          summary.total_entries += entries.length;
          continue;
        }

        // Extract session date from the JSON if available
        let sessionDate: string | null = null;
        if (sessionData.session_date) {
          // Format: "22/01/2026 10:05" → "2026-01-22"
          const dateParts = sessionData.session_date.split(" ")[0]?.split("/");
          if (dateParts && dateParts.length === 3) {
            sessionDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
          }
        }

        // Create session
        const { data: newSession, error: sessionErr } = await adminClient
          .from("v2_sessions")
          .insert({
            event_id,
            name: sessionInfo.name,
            session_type: sessionInfo.type as any,
            status: "draft" as any,
            sort_order: sortOrder++,
            source_document_url: jsonUrl,
            ...(sessionDate ? { date: sessionDate } : {}),
          } as any)
          .select("id")
          .single();

        if (sessionErr || !newSession) {
          summary.errors.push(`Failed to create session ${sessionInfo.name}: ${sessionErr?.message}`);
          continue;
        }
        existingSessionNames.add(sessionInfo.name);

        // Auto-assign layout if the event's circuit has exactly one layout
        if (event.circuit_id) {
          const { data: layouts } = await adminClient
            .from("v2_circuit_layouts")
            .select("id")
            .eq("circuit_id", event.circuit_id);
          if (layouts && layouts.length === 1) {
            await adminClient.from("v2_sessions").update({ layout_id: layouts[0].id } as any).eq("id", newSession.id);
          }
        }

        summary.sessions_created++;

        // Process each entry
        const isRace = sessionInfo.type === "race" || sessionInfo.type === "sprint_race";

        for (const entry of entries) {
          // IMSA JSON uses: drivers: [{ firstname, surname, country, ... }]
          const drivers = entry.drivers || [];
          const primaryDriver = drivers[0];
          if (!primaryDriver) continue;

          const primaryDriverName = `${primaryDriver.firstname} ${primaryDriver.surname}`.trim();
          if (!primaryDriverName) continue;

          // Match or create driver
          let driverId = matchDriver(primaryDriverName, existingDrivers, driverAliasMap);
          if (!driverId) {
            const { data: newDriver } = await adminClient
              .from("v2_drivers")
              .insert({
                full_name: primaryDriverName,
                ...(primaryDriver.country ? { nationality: primaryDriver.country } : {}),
              })
              .select("id")
              .single();
            if (newDriver) {
              driverId = newDriver.id;
              existingDrivers.push({ id: newDriver.id, full_name: primaryDriverName });
              summary.drivers_created++;
            }
          } else {
            summary.drivers_matched++;
          }

          // Match or create team
          const teamName = entry.team || null;
          let teamId: string | null = null;
          if (teamName) {
            teamId = matchTeam(teamName, existingTeams, seasonAliases, teamAliasMap);
            if (!teamId) {
              const { data: newTeam } = await adminClient
                .from("v2_teams")
                .insert({ full_name: teamName.trim() })
                .select("id")
                .single();
              if (newTeam) {
                teamId = newTeam.id;
                existingTeams.push({ id: newTeam.id, full_name: teamName.trim(), short_name: null });
                summary.teams_created++;
              }
            } else {
              summary.teams_matched++;
            }
          }

          const carId = teamId ? (seasonCarMap.get(teamId) || null) : null;

          const position = typeof entry.position === "number" ? entry.position : null;
          const carNumber = entry.number || null;
          const laps = entry.laps ? parseInt(entry.laps, 10) : null;
          const gapToLeader = entry.gap_first && entry.gap_first !== "-" ? entry.gap_first : null;
          const pitStops = entry.pit_stops ? parseInt(entry.pit_stops, 10) : null;
          const bestLap = entry.time || null;
          const totalTime = entry.total_time || null;
          const status = parseStatus(entry.status || "", entry.not_finished || false, entry.not_finished_cause || "");

          if (isRace) {
            await adminClient.from("v2_race_results").insert({
              session_id: newSession.id,
              driver_id: driverId,
              team_id: teamId,
              car_id: carId,
              car_number: carNumber ? String(carNumber) : null,
              position,
              status: status as any,
              laps_completed: typeof laps === "number" && !isNaN(laps) ? laps : null,
              gap_to_leader: gapToLeader ? String(gapToLeader) : null,
              pit_stops: typeof pitStops === "number" && !isNaN(pitStops) ? pitStops : null,
              fastest_lap_time: bestLap ? String(bestLap) : null,
              total_time: totalTime ? String(totalTime) : null,
            } as any);
          } else if (sessionInfo.type === "qualifying") {
            await adminClient.from("v2_qualifying_results").insert({
              session_id: newSession.id,
              driver_id: driverId,
              team_id: teamId,
              car_id: carId,
              car_number: carNumber ? String(carNumber) : null,
              position,
              best_time: bestLap ? String(bestLap) : null,
              gap_to_pole: gapToLeader ? String(gapToLeader) : null,
              laps_run: typeof laps === "number" && !isNaN(laps) ? laps : null,
            } as any);
          } else {
            await adminClient.from("v2_practice_results").insert({
              session_id: newSession.id,
              driver_id: driverId,
              team_id: teamId,
              car_id: carId,
              car_number: carNumber ? String(carNumber) : null,
              position,
              best_lap_time: bestLap ? String(bestLap) : null,
              gap_to_p1: gapToLeader ? String(gapToLeader) : null,
              laps_run: typeof laps === "number" && !isNaN(laps) ? laps : null,
            } as any);
          }

          summary.total_entries++;
        }
      } catch (err) {
        console.error(`Error processing ${jsonUrl}:`, err);
        summary.errors.push(`Error processing ${jsonUrl}: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    return new Response(
      JSON.stringify({ ...summary, success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("import-imsa-results error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
