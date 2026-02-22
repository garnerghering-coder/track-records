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

  // 1. Check alias map
  const aliasId = aliasMap.get(normalized);
  if (aliasId) return aliasId;

  // 2. Exact match
  for (const d of existingDrivers) {
    if (d.full_name.toLowerCase() === normalized) return d.id;
  }

  // 3. Fuzzy first+last
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

/** Detect IMSA session type from folder name */
function detectSessionType(folderName: string): { type: string; name: string } {
  const lower = folderName.toLowerCase();
  if (/qualifying/i.test(lower)) return { type: "qualifying", name: folderName };
  if (/practice\s*(\d)/i.test(lower)) return { type: "practice", name: folderName };
  if (/warm\s*up/i.test(lower)) return { type: "warmup", name: folderName };
  if (/race|hour/i.test(lower)) return { type: "race", name: folderName };
  if (/sprint/i.test(lower)) return { type: "sprint_race", name: folderName };
  return { type: "other", name: folderName };
}

/** Parse IMSA status string to our enum */
function parseStatus(status: string | null | undefined): string {
  if (!status) return "finished";
  const s = status.toUpperCase().trim();
  if (s === "FINISHED" || s === "RUNNING" || s === "" || s === "CLASSIFIED") return "finished";
  if (s === "DNF" || s === "MECHANICAL" || s === "ACCIDENT" || s === "CONTACT" || s === "OFF TRACK" || s === "RETIREMENT") return "dnf";
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
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Firecrawl is not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
      .select("id, name, season_id, circuit_id, v2_seasons(year)")
      .eq("id", event_id)
      .single();
    if (eventErr || !event) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 1: Scrape the IMSA results page to discover JSON file links ──
    console.log("Scraping IMSA page:", url);
    const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["links", "markdown"], onlyMainContent: false }),
    });

    if (!scrapeResponse.ok) {
      const errText = await scrapeResponse.text();
      console.error("Firecrawl error:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to scrape the IMSA page." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const scrapeData = await scrapeResponse.json();
    const allLinks: string[] = scrapeData.data?.links || scrapeData.links || [];
    const markdown: string = scrapeData.data?.markdown || scrapeData.markdown || "";

    // Also extract links from markdown (some might not be in links array)
    const mdLinkRegex = /https?:\/\/[^\s)]+\.JSON/gi;
    let mdMatch: RegExpExecArray | null;
    while ((mdMatch = mdLinkRegex.exec(markdown)) !== null) {
      if (!allLinks.includes(mdMatch[0])) allLinks.push(mdMatch[0]);
    }

    // Filter for .JSON classification files from alkamelcloud
    let jsonLinks = allLinks.filter(
      (l) => /\.JSON$/i.test(l) && /classification/i.test(l)
    );

    // If no direct JSON links found, try to construct them from folder links
    if (jsonLinks.length === 0) {
      console.log("No direct JSON links found. Trying to construct from folder structure...");
      
      // Find session-like folder links (Practice, Qualifying, Race, Warm Up, etc.)
      const sessionPattern = /\/(Practice\s*\d*|Qualifying|Race|Warm\s*Up|Sprint|Hour\s*\d+)\/?/i;
      const candidateFolders = allLinks.filter(l => sessionPattern.test(decodeURIComponent(l)));
      
      // Also look for "Official" or "Unofficial" sub-folders
      const officialPattern = /(Official|Unofficial)\/?$/i;
      const officialFolders = allLinks.filter(l => officialPattern.test(decodeURIComponent(l)));
      
      // Build candidate JSON URLs
      const candidateUrls = new Set<string>();
      
      // From official/unofficial folders, append Classification.JSON
      for (const folder of officialFolders) {
        const base = folder.endsWith("/") ? folder : folder + "/";
        candidateUrls.add(base + "Classification.JSON");
      }
      
      // From session folders, try both Official and direct Classification.JSON
      for (const folder of candidateFolders) {
        const base = folder.endsWith("/") ? folder : folder + "/";
        candidateUrls.add(base + "Official/Classification.JSON");
        candidateUrls.add(base + "Unofficial/Classification.JSON");
        candidateUrls.add(base + "Classification.JSON");
      }
      
      console.log(`Constructed ${candidateUrls.size} candidate URLs from ${candidateFolders.length} session folders and ${officialFolders.length} official folders`);
      
      // Try to fetch each candidate to see which ones exist (HEAD request first)
      const validUrls: string[] = [];
      const checks = Array.from(candidateUrls).map(async (candidateUrl) => {
        try {
          const headResp = await fetch(candidateUrl, { method: "HEAD" });
          if (headResp.ok) {
            validUrls.push(candidateUrl);
          }
        } catch {}
      });
      await Promise.all(checks);
      
      // Prefer "Official" over "Unofficial" for the same session
      const sessionUrlMap = new Map<string, string>();
      for (const validUrl of validUrls) {
        // Extract session path (everything before Official/Unofficial/Classification)
        const sessionKey = validUrl.replace(/\/(Official|Unofficial)\/Classification\.JSON$/i, "").replace(/\/Classification\.JSON$/i, "");
        const existing = sessionUrlMap.get(sessionKey);
        if (!existing || /Official/i.test(validUrl)) {
          sessionUrlMap.set(sessionKey, validUrl);
        }
      }
      
      jsonLinks = Array.from(sessionUrlMap.values());
      console.log(`Found ${jsonLinks.length} valid Classification.JSON file(s) after probing`);
    }

    if (jsonLinks.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No classification JSON files found. Make sure you're linking to an IMSA event results page on alkamelcloud.com that has session results (not a season overview page).",
          debug_links_found: allLinks.length,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${jsonLinks.length} JSON classification file(s):`, jsonLinks);

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

    for (const jsonUrl of jsonLinks) {
      try {
        console.log("Fetching JSON:", jsonUrl);
        const jsonResponse = await fetch(jsonUrl);
        if (!jsonResponse.ok) {
          summary.errors.push(`Failed to fetch ${jsonUrl}: ${jsonResponse.status}`);
          continue;
        }

        const classificationData = await jsonResponse.json();

        // Extract session name from the URL path
        // e.g. .../Practice 1/Classification.JSON or .../Race/Classification.JSON
        const pathParts = new URL(jsonUrl).pathname.split("/").filter(Boolean);
        const classIdx = pathParts.findIndex(p => /classification/i.test(p));
        const sessionFolderName = classIdx > 0 ? decodeURIComponent(pathParts[classIdx - 1]) : "Unknown Session";
        const sessionInfo = detectSessionType(sessionFolderName);

        // Skip if session already exists
        if (existingSessionNames.has(sessionInfo.name)) {
          console.log(`Skipping duplicate session: ${sessionInfo.name}`);
          summary.sessions_skipped++;
          continue;
        }

        // Parse entries from the IMSA classification JSON
        // The JSON format typically has an array of results under various keys
        const entries: any[] = classificationData.Results || classificationData.results ||
          classificationData.Classification || classificationData.classification ||
          classificationData.Entries || classificationData.entries || [];

        if (!Array.isArray(entries) || entries.length === 0) {
          // Try top-level if it's an array
          if (Array.isArray(classificationData) && classificationData.length > 0) {
            // It's a direct array
          } else {
            summary.errors.push(`No entries found in ${sessionFolderName}`);
            continue;
          }
        }

        const entryArray = Array.isArray(classificationData) ? classificationData : entries;

        if (isPreview) {
          // In preview mode, just count
          summary.sessions_created++;
          summary.total_entries += entryArray.length;
          continue;
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
        const resultTable = isRace ? "v2_race_results" : sessionInfo.type === "qualifying" ? "v2_qualifying_results" : "v2_practice_results";

        for (const entry of entryArray) {
          // Extract driver name(s) — IMSA format varies
          const driverNames: string[] = [];
          if (entry.Drivers && Array.isArray(entry.Drivers)) {
            for (const d of entry.Drivers) {
              const name = d.FullName || d.Name || d.DriverName || `${d.FirstName || ""} ${d.LastName || ""}`.trim();
              if (name) driverNames.push(name);
            }
          } else if (entry.DriverName || entry.Driver) {
            driverNames.push(entry.DriverName || entry.Driver);
          } else if (entry.FirstName && entry.LastName) {
            driverNames.push(`${entry.FirstName} ${entry.LastName}`);
          }

          // For multi-driver endurance races, use the first driver for the result row
          const primaryDriverName = driverNames[0];
          if (!primaryDriverName) continue;

          // Match or create driver
          let driverId = matchDriver(primaryDriverName, existingDrivers, driverAliasMap);
          if (!driverId) {
            const parts = primaryDriverName.trim().split(/\s+/);
            const { data: newDriver } = await adminClient
              .from("v2_drivers")
              .insert({ full_name: primaryDriverName.trim() })
              .select("id")
              .single();
            if (newDriver) {
              driverId = newDriver.id;
              existingDrivers.push({ id: newDriver.id, full_name: primaryDriverName.trim() });
              summary.drivers_created++;
            }
          } else {
            summary.drivers_matched++;
          }

          // Match or create team
          const teamName = entry.TeamName || entry.Team || entry.Entrant || null;
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

          // Car from season mapping
          const carId = teamId ? (seasonCarMap.get(teamId) || null) : null;

          const position = entry.Position ?? entry.Pos ?? entry.FinishPosition ?? null;
          const carNumber = entry.Number || entry.CarNumber || entry.No || null;
          const laps = entry.Laps ?? entry.LapsCompleted ?? null;
          const gapToLeader = entry.Gap || entry.GapToLeader || entry.Behind || null;
          const pitStops = entry.PitStops ?? entry.Pits ?? null;
          const bestLap = entry.BestLapTime || entry.FastestLap || entry.BestTime || null;
          const totalTime = entry.TotalTime || entry.Time || entry.RaceTime || null;
          const status = parseStatus(entry.Status || entry.Reason || null);

          if (isRace) {
            await adminClient.from("v2_race_results").insert({
              session_id: newSession.id,
              driver_id: driverId,
              team_id: teamId,
              car_id: carId,
              car_number: carNumber ? String(carNumber) : null,
              position: typeof position === "number" ? position : null,
              status: status as any,
              laps_completed: typeof laps === "number" ? laps : null,
              gap_to_leader: gapToLeader ? String(gapToLeader) : null,
              pit_stops: typeof pitStops === "number" ? pitStops : null,
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
              position: typeof position === "number" ? position : null,
              best_time: bestLap ? String(bestLap) : null,
              gap_to_pole: gapToLeader ? String(gapToLeader) : null,
              laps_run: typeof laps === "number" ? laps : null,
            } as any);
          } else {
            await adminClient.from("v2_practice_results").insert({
              session_id: newSession.id,
              driver_id: driverId,
              team_id: teamId,
              car_id: carId,
              car_number: carNumber ? String(carNumber) : null,
              position: typeof position === "number" ? position : null,
              best_lap_time: bestLap ? String(bestLap) : null,
              gap_to_p1: gapToLeader ? String(gapToLeader) : null,
              laps_run: typeof laps === "number" ? laps : null,
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
