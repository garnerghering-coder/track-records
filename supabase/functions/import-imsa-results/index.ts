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

function detectSessionType(sessionName: string, sessionType?: string): { type: string; name: string } {
  const lower = (sessionType || sessionName).toLowerCase();
  if (/qualifying/i.test(lower)) return { type: "qualifying", name: sessionName };
  if (/free\s*practice|practice/i.test(lower)) return { type: "practice", name: sessionName };
  if (/warm\s*up/i.test(lower)) return { type: "warmup", name: sessionName };
  if (/race|hour/i.test(lower)) return { type: "race", name: sessionName };
  if (/sprint/i.test(lower)) return { type: "sprint_race", name: sessionName };
  return { type: "other", name: sessionName };
}

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

/** Extract hour number from a URL path like ".../04_HOUR 3/..." */
function extractHourNumber(url: string): number | null {
  const decoded = decodeURIComponent(url);
  const m = decoded.match(/HOUR\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Check if a URL is the overall race result (not an hour sub-result) */
function isOverallRaceResult(url: string): boolean {
  const decoded = decodeURIComponent(url).toLowerCase();
  // Overall race results live directly in the Race folder, not in an Hour subfolder
  return !(/hour\s*\d+/i.test(decoded));
}

// ── Process entries into results ─────────────────────────────────────

async function processEntries(
  adminClient: any,
  sessionId: string,
  entries: any[],
  sessionType: string,
  existingDrivers: Array<{ id: string; full_name: string }>,
  existingTeams: Array<{ id: string; full_name: string; short_name: string | null }>,
  seasonAliases: Array<{ team_id: string; display_name: string }>,
  driverAliasMap: Map<string, string>,
  teamAliasMap: Map<string, string>,
  seasonCarMap: Map<string, string>,
  summary: any
) {
  const isRace = sessionType === "race" || sessionType === "sprint_race" || sessionType === "endurance_race";

  for (const entry of entries) {
    const drivers = entry.drivers || [];
    const primaryDriver = drivers[0];
    if (!primaryDriver) continue;

    const primaryDriverName = `${primaryDriver.firstname} ${primaryDriver.surname}`.trim();
    if (!primaryDriverName) continue;

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
        session_id: sessionId,
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
    } else if (sessionType === "qualifying") {
      await adminClient.from("v2_qualifying_results").insert({
        session_id: sessionId,
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
        session_id: sessionId,
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

    // ── Step 1: Fetch the IMSA results page HTML ──
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

    // Filter for results JSON files
    const baseUrl = "https://imsa.results.alkamelcloud.com/";

    // Build series name matchers
    const season = event.v2_seasons as any;
    const seriesObj = season?.v2_series;
    const seriesName: string = seriesObj?.name || "";
    const seriesAliasesList: string[] = (seriesObj?.v2_series_aliases || []).map((a: any) => a.alias);
    const allSeriesNames = [seriesName, ...seriesAliasesList].filter(Boolean).map(n => n.toLowerCase());

    console.log("Series filter names:", allSeriesNames);

    /**
     * Extract the series folder name from an IMSA URL path.
     * URL structure: /Results/26_2026/03_Venue/01_Series Name/...
     * Returns the series folder name stripped of numeric prefix, lowercased.
     */
    function extractSeriesFolder(urlPath: string): string {
      const decoded = decodeURIComponent(urlPath);
      // Split path segments and find the series folder (4th segment after /Results/year/venue/)
      const segments = decoded.split("/").filter(Boolean);
      // Find the segment after the venue segment (which starts with a 2-digit number)
      // Pattern: Results / year / venue / series / session / ...
      for (let i = 0; i < segments.length - 1; i++) {
        if (segments[i].toLowerCase() === "results" && i + 3 < segments.length) {
          const seriesSegment = segments[i + 3];
          // Strip numeric prefix like "01_"
          return seriesSegment.replace(/^\d+_/, "").toLowerCase().trim();
        }
      }
      return "";
    }

    function matchesSeriesFolder(urlPath: string): boolean {
      const folder = extractSeriesFolder(urlPath);
      if (!folder) return false;
      return allSeriesNames.some(sn => {
        // Full name match: folder equals or contains the full series name
        if (sn.length > 5) return folder.includes(sn) || sn.includes(folder);
        // Short alias (like "IMSA"): require exact folder match
        return folder === sn;
      });
    }

    // Collect results JSON files:
    // - Practice/Qualifying/Race: 02_Results_ or 03_Results_ (prefer 03_ Official)
    // - Hourly race results: 04_Results by Hour_ or 04_Results%20by%20Hour_ 
    const resultsFilePattern = /0[234]_Results[_%\s]/i;
    const seriesMatchedLinks = allJsonLinks
      .filter(l => resultsFilePattern.test(l))
      // Exclude "Results by Class" and "Results by Hour & Class" — we want plain results only
      .filter(l => !/Results[_%\s]+by[_%\s]+Class/i.test(l) && !/Results[_%\s]+by[_%\s]+Hour[_%\s]+(&|%26)/i.test(l))
      .filter(l => matchesSeriesFolder(l));

    // Group by session path (everything before the results file) to deduplicate
    const sessionGrouped = new Map<string, string>();
    for (const l of seriesMatchedLinks) {
      // Key = path up to the results file
      const key = l.replace(/0[234]_Results[^/]*$/i, "");
      const existing = sessionGrouped.get(key);
      if (!existing || /03_Results/i.test(l)) {
        // Prefer 03_ (Official) over others
        sessionGrouped.set(key, l);
      }
    }

    const resultsJsonLinks = Array.from(sessionGrouped.values())
      .map(l => {
        try {
          return new URL(l, baseUrl).href;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];

    console.log(`Found ${resultsJsonLinks.length} series-filtered results JSON links`);

    if (resultsJsonLinks.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No results JSON files found for this series on this page.",
          debug_json_links_found: allJsonLinks.length,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 1.5: Detect endurance race pattern ──
    // Hour links: URLs that contain an "Hour N" subfolder
    const hourLinks = resultsJsonLinks.filter(l => extractHourNumber(l) !== null);
    // Overall race links: contain "Race" in session folder but NOT in an Hour subfolder
    const overallRaceLinks = resultsJsonLinks.filter(l => {
      const decoded = decodeURIComponent(l).toLowerCase();
      // Must be in a Race session folder (e.g. "202601241340_Race/") 
      const hasRaceFolder = /\d+_race\//i.test(decoded);
      // Must NOT have an Hour subfolder
      const hasHour = /hour\s*\d+/i.test(decoded);
      return hasRaceFolder && !hasHour;
    });
    // Non-race links: everything that isn't a race or hour link
    const nonRaceLinks = resultsJsonLinks.filter(l => {
      const decoded = decodeURIComponent(l).toLowerCase();
      const hasRaceFolder = /\d+_race\//i.test(decoded);
      const hasHour = extractHourNumber(l) !== null;
      return !hasRaceFolder && !hasHour;
    });

    const isEndurance = hourLinks.length > 0;
    console.log(`Endurance detection: ${isEndurance} (${hourLinks.length} hour links, ${overallRaceLinks.length} overall race links, ${nonRaceLinks.length} non-race links)`);

    // ── Step 2: Load reference data ──
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

    // ── Step 3: Process results ──
    const summary = {
      sessions_created: 0,
      sessions_skipped: 0,
      total_entries: 0,
      drivers_matched: 0,
      drivers_created: 0,
      teams_matched: 0,
      teams_created: 0,
      is_endurance: isEndurance,
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

    // Auto-assign layout helper
    const autoAssignLayout = async (sessionId: string) => {
      if (event.circuit_id) {
        const { data: layouts } = await adminClient
          .from("v2_circuit_layouts")
          .select("id")
          .eq("circuit_id", event.circuit_id);
        if (layouts && layouts.length === 1) {
          await adminClient.from("v2_sessions").update({ layout_id: layouts[0].id } as any).eq("id", sessionId);
        }
      }
    };

    // Helper to parse session date from JSON
    const parseSessionDate = (sessionData: any): string | null => {
      if (sessionData.session_date) {
        const dateParts = sessionData.session_date.split(" ")[0]?.split("/");
        if (dateParts && dateParts.length === 3) {
          return `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
        }
      }
      return null;
    };

    // Helper to create a session and return its id
    const createSession = async (
      name: string,
      sessionType: string,
      jsonUrl: string,
      sessionDate: string | null,
      parentSessionId: string | null
    ): Promise<string | null> => {
      const { data: newSession, error: sessionErr } = await adminClient
        .from("v2_sessions")
        .insert({
          event_id,
          name,
          session_type: sessionType as any,
          status: "draft" as any,
          sort_order: sortOrder++,
          source_document_url: jsonUrl,
          ...(sessionDate ? { date: sessionDate } : {}),
          ...(parentSessionId ? { parent_session_id: parentSessionId } : {}),
        } as any)
        .select("id")
        .single();
      if (sessionErr || !newSession) {
        summary.errors.push(`Failed to create session ${name}: ${sessionErr?.message}`);
        return null;
      }
      existingSessionNames.add(name);
      await autoAssignLayout(newSession.id);
      summary.sessions_created++;
      return newSession.id;
    };

    if (isEndurance) {
      // ── Endurance Race Flow ──
      // 1. Process non-race sessions (practice, qualifying, etc.)
      for (const jsonUrl of nonRaceLinks) {
        try {
          console.log("Fetching non-race JSON:", jsonUrl);
          const jsonResponse = await fetch(jsonUrl);
          if (!jsonResponse.ok) { summary.errors.push(`Failed to fetch ${jsonUrl}: ${jsonResponse.status}`); continue; }
          const data = await jsonResponse.json();
          const sessionData = data.session || {};
          const sessionName = sessionData.session_name || "Unknown Session";
          const sessionInfo = detectSessionType(sessionName, sessionData.session_type || "");

          if (existingSessionNames.has(sessionInfo.name)) { summary.sessions_skipped++; continue; }
          const entries: any[] = data.classification || [];
          if (entries.length === 0) { summary.errors.push(`No entries in ${sessionInfo.name}`); continue; }
          if (isPreview) { summary.sessions_created++; summary.total_entries += entries.length; continue; }

          const sessionDate = parseSessionDate(sessionData);
          const sessionId = await createSession(sessionInfo.name, sessionInfo.type, jsonUrl, sessionDate, null);
          if (!sessionId) continue;

          await processEntries(adminClient, sessionId, entries, sessionInfo.type, existingDrivers, existingTeams, seasonAliases, driverAliasMap, teamAliasMap, seasonCarMap, summary);
        } catch (err) {
          summary.errors.push(`Error processing ${jsonUrl}: ${err instanceof Error ? err.message : "Unknown"}`);
        }
      }

      // 2. Create parent endurance_race session
      const raceSessionName = "Race";
      let parentSessionId: string | null = null;

      if (!existingSessionNames.has(raceSessionName) && !isPreview) {
        // Try to get date from first overall race or hour link
        let raceDate: string | null = null;
        const firstRaceUrl = overallRaceLinks[0] || hourLinks[0];
        if (firstRaceUrl) {
          try {
            const resp = await fetch(firstRaceUrl);
            if (resp.ok) {
              const d = await resp.json();
              raceDate = parseSessionDate(d.session || {});
            }
          } catch { /* ignore */ }
        }

        parentSessionId = await createSession(raceSessionName, "endurance_race", url, raceDate, null);
      } else if (existingSessionNames.has(raceSessionName)) {
        summary.sessions_skipped++;
      }

      // 3. Import race results into parent session
      // Use overall race link if available, otherwise use the LAST hour's data as final results
      const sortedHourLinks = hourLinks
        .map(l => ({ url: l, hour: extractHourNumber(l)! }))
        .sort((a, b) => a.hour - b.hour);

      const raceDataUrl = overallRaceLinks.length > 0
        ? overallRaceLinks[overallRaceLinks.length - 1]
        : (sortedHourLinks.length > 0 ? sortedHourLinks[sortedHourLinks.length - 1].url : null);

      if (parentSessionId && raceDataUrl) {
        try {
          console.log("Fetching final race results for parent session:", raceDataUrl);
          const jsonResponse = await fetch(raceDataUrl);
          if (jsonResponse.ok) {
            const data = await jsonResponse.json();
            const entries: any[] = data.classification || [];
            await processEntries(adminClient, parentSessionId, entries, "endurance_race", existingDrivers, existingTeams, seasonAliases, driverAliasMap, teamAliasMap, seasonCarMap, summary);
          }
        } catch (err) {
          summary.errors.push(`Error processing final race results: ${err instanceof Error ? err.message : "Unknown"}`);
        }
      }

      // 4. Import hour-by-hour results as child sessions

      for (const { url: hourUrl, hour } of sortedHourLinks) {
        const hourSessionName = `Hour ${hour}`;
        if (existingSessionNames.has(hourSessionName)) { summary.sessions_skipped++; continue; }

        try {
          console.log(`Fetching Hour ${hour} results:`, hourUrl);
          const jsonResponse = await fetch(hourUrl);
          if (!jsonResponse.ok) { summary.errors.push(`Failed to fetch ${hourUrl}: ${jsonResponse.status}`); continue; }
          const data = await jsonResponse.json();
          const entries: any[] = data.classification || [];
          if (entries.length === 0) { summary.errors.push(`No entries in Hour ${hour}`); continue; }

          if (isPreview) { summary.sessions_created++; summary.total_entries += entries.length; continue; }

          const sessionDate = parseSessionDate(data.session || {});
          // Child sessions use "race" type so results go into v2_race_results
          const childSessionId = await createSession(hourSessionName, "race", hourUrl, sessionDate, parentSessionId);
          if (!childSessionId) continue;

          await processEntries(adminClient, childSessionId, entries, "race", existingDrivers, existingTeams, seasonAliases, driverAliasMap, teamAliasMap, seasonCarMap, summary);
        } catch (err) {
          summary.errors.push(`Error processing Hour ${hour}: ${err instanceof Error ? err.message : "Unknown"}`);
        }
      }

      if (isPreview && !existingSessionNames.has(raceSessionName)) {
        summary.sessions_created++; // count parent
        summary.sessions_created += sortedHourLinks.length; // count hours
      }
    } else {
      // ── Standard (non-endurance) flow ──
      for (const jsonUrl of resultsJsonLinks) {
        try {
          console.log("Fetching JSON:", jsonUrl);
          const jsonResponse = await fetch(jsonUrl);
          if (!jsonResponse.ok) { summary.errors.push(`Failed to fetch ${jsonUrl}: ${jsonResponse.status}`); continue; }
          const data = await jsonResponse.json();
          const sessionData = data.session || {};
          const sessionName = sessionData.session_name || "Unknown Session";
          const sessionInfo = detectSessionType(sessionName, sessionData.session_type || "");

          if (existingSessionNames.has(sessionInfo.name)) { summary.sessions_skipped++; continue; }
          const entries: any[] = data.classification || [];
          if (entries.length === 0) { summary.errors.push(`No entries in ${sessionInfo.name}`); continue; }
          if (isPreview) { summary.sessions_created++; summary.total_entries += entries.length; continue; }

          const sessionDate = parseSessionDate(sessionData);
          const sessionId = await createSession(sessionInfo.name, sessionInfo.type, jsonUrl, sessionDate, null);
          if (!sessionId) continue;

          await processEntries(adminClient, sessionId, entries, sessionInfo.type, existingDrivers, existingTeams, seasonAliases, driverAliasMap, teamAliasMap, seasonCarMap, summary);
        } catch (err) {
          summary.errors.push(`Error processing ${jsonUrl}: ${err instanceof Error ? err.message : "Unknown"}`);
        }
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
