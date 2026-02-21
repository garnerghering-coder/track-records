import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ──────────────────────────────────────────────────────────

/** Strip markdown images from a cell, leaving only text */
function stripImages(cell: string): string {
  return cell.replace(/!\[.*?\]\(.*?\)/g, "").trim();
}

/**
 * Parse F1-style driver string like "OscarPiastriPIA" or "CarlosSainzSAI"
 * The last 3 uppercase letters are the TLA; the rest is FirstLast in camelCase.
 */
function parseDriverName(raw: string): { firstName: string; lastName: string; tla: string } | null {
  const cleaned = stripImages(raw);
  if (!cleaned || cleaned.length < 4) return null;

  // The TLA is the last 3 uppercase letters
  const tlaMatch = cleaned.match(/([A-Z]{3})$/);
  if (!tlaMatch) return null;
  const tla = tlaMatch[1];
  const namePart = cleaned.slice(0, -3);

  // Split on camelCase boundaries: "OscarPiastri" → ["Oscar", "Piastri"]
  // Handle multi-word last names like "de la Rosa" by splitting only on uppercase boundaries
  const parts = namePart.split(/(?=[A-Z])/);
  if (parts.length < 2) return null;

  const firstName = parts[0];
  const lastName = parts.slice(1).join("");

  return { firstName, lastName, tla };
}

/** Parse team name: strip images, return clean team name */
function parseTeamName(raw: string): string {
  return stripImages(raw);
}

/** Parse a position cell: handle numeric, "NC", "DQ", "DNS", etc. */
function parsePosition(raw: string): { position: number | null; status: string | null } {
  const clean = raw.trim();
  const num = parseInt(clean, 10);
  if (!isNaN(num)) return { position: num, status: "finished" };
  if (clean === "NC") return { position: null, status: "dnf" };
  if (clean === "DQ" || clean === "DSQ") return { position: null, status: "dsq" };
  if (clean === "DNS") return { position: null, status: "dns" };
  if (clean === "Ret" || clean === "RET") return { position: null, status: "dnf" };
  return { position: null, status: clean.toLowerCase() || null };
}

/** Detect session type from a results page URL or title */
function detectSessionType(url: string, title: string): { type: string; name: string } {
  if (/practice\/1/i.test(url)) return { type: "practice", name: "Practice 1" };
  if (/practice\/2/i.test(url)) return { type: "practice", name: "Practice 2" };
  if (/practice\/3/i.test(url)) return { type: "practice", name: "Practice 3" };
  if (/sprint-shootout|sprint-qualifying/i.test(url)) return { type: "sprint_qualifying", name: "Sprint Qualifying" };
  if (/sprint-race|sprint-result/i.test(url)) return { type: "sprint_race", name: "Sprint Race" };
  if (/qualifying/i.test(url)) return { type: "qualifying", name: "Qualifying" };
  if (/race-result/i.test(url)) return { type: "race", name: "Race" };

  // Fallback: detect from title
  if (/practice\s*1/i.test(title)) return { type: "practice", name: "Practice 1" };
  if (/practice\s*2/i.test(title)) return { type: "practice", name: "Practice 2" };
  if (/practice\s*3/i.test(title)) return { type: "practice", name: "Practice 3" };
  if (/qualifying/i.test(title)) return { type: "qualifying", name: "Qualifying" };
  if (/race/i.test(title)) return { type: "race", name: "Race" };

  return { type: "other", name: "Unknown Session" };
}

/** Parse markdown table rows into arrays of cells */
function parseMarkdownTable(markdown: string): string[][] {
  const lines = markdown.split("\n");
  const rows: string[][] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    // Skip separator rows (| --- | --- |)
    if (/^\|[\s-|]+\|$/.test(trimmed)) continue;

    const cells = trimmed
      .split("|")
      .slice(1, -1) // remove empty first/last from split
      .map((c) => c.trim());
    rows.push(cells);
  }

  return rows;
}

/** Detect table type from header row */
function detectTableType(headerRow: string[]): "practice" | "qualifying" | "race" | "unknown" {
  const header = headerRow.join(" ").toLowerCase();
  if (header.includes("q1") || header.includes("q2") || header.includes("q3")) return "qualifying";
  if (header.includes("time / retired") || header.includes("pts")) return "race";
  if (header.includes("time / gap") || (header.includes("time") && header.includes("gap"))) return "practice";
  if (header.includes("laps") && header.includes("pts")) return "race";
  return "unknown";
}

// ── Matching ─────────────────────────────────────────────────────────

function matchDriver(
  firstName: string,
  lastName: string,
  existingDrivers: Array<{ id: string; full_name: string }>
): string | null {
  const fullName = `${firstName} ${lastName}`.toLowerCase();

  // 1. Exact match
  for (const d of existingDrivers) {
    if (d.full_name.toLowerCase() === fullName) return d.id;
  }

  // 2. Fuzzy first+last match
  for (const d of existingDrivers) {
    const parts = d.full_name.toLowerCase().split(/\s+/);
    if (parts.length >= 2) {
      const existFirst = parts[0];
      const existLast = parts[parts.length - 1];
      if (existFirst === firstName.toLowerCase() && existLast === lastName.toLowerCase()) return d.id;
    }
  }

  // 3. Abbreviated match: "L. Norris" -> "Lando Norris"
  for (const d of existingDrivers) {
    const parts = d.full_name.toLowerCase().split(/\s+/);
    if (parts.length >= 2) {
      const existLast = parts[parts.length - 1];
      if (existLast === lastName.toLowerCase() && parts[0].startsWith(firstName.toLowerCase().charAt(0))) return d.id;
    }
  }

  return null;
}

function matchTeam(
  teamName: string,
  existingTeams: Array<{ id: string; full_name: string; short_name: string | null }>
): string | null {
  const normalized = teamName.toLowerCase().trim();

  for (const t of existingTeams) {
    if (t.full_name.toLowerCase() === normalized) return t.id;
    if (t.short_name && t.short_name.toLowerCase() === normalized) return t.id;
    // Partial match: "McLaren" matches "McLaren Racing"
    if (t.full_name.toLowerCase().includes(normalized) || normalized.includes(t.full_name.toLowerCase())) return t.id;
  }

  return null;
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
        JSON.stringify({ error: "Firecrawl is not configured. Connect the Firecrawl integration first." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { url, event_id } = await req.json();
    if (!url || !event_id) {
      return new Response(
        JSON.stringify({ error: "Both url and event_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify event exists
    const { data: event, error: eventErr } = await adminClient.from("v2_events").select("id, name").eq("id", event_id).single();
    if (eventErr || !event) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 1: Scrape hub page to find result URLs ──
    console.log("Scraping hub page:", url);
    const hubResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: false }),
    });

    if (!hubResponse.ok) {
      const errText = await hubResponse.text();
      console.error("Firecrawl hub error:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to scrape the F1 page. Check that the URL is correct." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hubData = await hubResponse.json();
    const hubMarkdown: string = hubData.data?.markdown || hubData.markdown || "";

    // Extract result page URLs from the hub page
    // Pattern: [Results](https://www.formula1.com/en/results/2025/races/1257/bahrain/practice/1)
    const resultUrlRegex = /\[Results\]\((https:\/\/www\.formula1\.com\/en\/results\/\d+\/races\/\d+\/[^)]+)\)/gi;
    const resultUrls: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = resultUrlRegex.exec(hubMarkdown)) !== null) {
      resultUrls.push(match[1]);
    }

    if (resultUrls.length === 0) {
      // Fallback: Try to extract from the results page nav if user pasted a results URL directly
      // Extract base URL pattern and try common session paths
      const baseMatch = url.match(/(https:\/\/www\.formula1\.com\/en\/results\/\d+\/races\/\d+\/[^/]+)/);
      if (baseMatch) {
        const base = baseMatch[1];
        for (const path of ["/practice/1", "/practice/2", "/practice/3", "/qualifying", "/race-result"]) {
          resultUrls.push(base + path);
        }
      }

      // Also try extracting from the results page sidebar navigation
      const navRegex = /\[(?:Practice \d|Qualifying|Race Result)(?:Active)?\]\((https:\/\/www\.formula1\.com\/en\/results\/[^)]+)\)/gi;
      while ((match = navRegex.exec(hubMarkdown)) !== null) {
        if (!resultUrls.includes(match[1])) {
          resultUrls.push(match[1]);
        }
      }
    }

    // Deduplicate and filter to only practice, qualifying, race
    const uniqueUrls = [...new Set(resultUrls)].filter(
      (u) => /practice\/\d|qualifying|race-result|sprint/i.test(u)
    );

    if (uniqueUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: "No result page URLs found on this page. Make sure you're linking to an F1 race hub page." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Found result URLs:", uniqueUrls);

    // Load existing data for matching
    const [driversRes, teamsRes, existingSessionsRes] = await Promise.all([
      adminClient.from("v2_drivers").select("id, full_name"),
      adminClient.from("v2_teams").select("id, full_name, short_name"),
      adminClient.from("v2_sessions").select("id, name").eq("event_id", event_id),
    ]);
    const existingDrivers = driversRes.data || [];
    const existingTeams = teamsRes.data || [];
    const existingSessionNames = new Set((existingSessionsRes.data || []).map((s: any) => s.name));

    // ── Step 2: Scrape each result page and parse ──
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

    // Get current max sort order for sessions
    const { data: allSessions } = await adminClient.from("v2_sessions").select("sort_order").eq("event_id", event_id).order("sort_order", { ascending: false }).limit(1);
    let sortOrder = (allSessions?.[0]?.sort_order ?? -1) + 1;

    for (const resultUrl of uniqueUrls) {
      try {
        console.log("Scraping result page:", resultUrl);
        const pageResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: resultUrl, formats: ["markdown"], onlyMainContent: false }),
        });

        if (!pageResponse.ok) {
          summary.errors.push(`Failed to scrape ${resultUrl}`);
          continue;
        }

        const pageData = await pageResponse.json();
        const pageMarkdown: string = pageData.data?.markdown || pageData.markdown || "";

        // Extract title to help detect session type
        const titleMatch = pageMarkdown.match(/^#\s+(.+)$/m);
        const title = titleMatch?.[1] || "";

        const sessionInfo = detectSessionType(resultUrl, title);

        // Check for duplicate sessions
        if (existingSessionNames.has(sessionInfo.name)) {
          console.log(`Skipping duplicate session: ${sessionInfo.name}`);
          summary.sessions_skipped++;
          continue;
        }

        // Parse the markdown table
        const rows = parseMarkdownTable(pageMarkdown);
        if (rows.length < 2) {
          summary.errors.push(`No table found on ${resultUrl}`);
          continue;
        }

        const headerRow = rows[0];
        const dataRows = rows.slice(1);
        const tableType = detectTableType(headerRow);

        // Create session
        const { data: newSession, error: sessionErr } = await adminClient
          .from("v2_sessions")
          .insert({
            event_id,
            name: sessionInfo.name,
            session_type: sessionInfo.type as any,
            status: "draft" as any,
            sort_order: sortOrder++,
            source_document_url: resultUrl,
          } as any)
          .select("id")
          .single();

        if (sessionErr || !newSession) {
          summary.errors.push(`Failed to create session ${sessionInfo.name}: ${sessionErr?.message}`);
          continue;
        }

        existingSessionNames.add(sessionInfo.name);
        summary.sessions_created++;

        // Parse each data row and insert results
        for (const row of dataRows) {
          if (row.length < 4) continue;

          // Common columns across all types: Pos, No, Driver, Team, ...
          const posCell = row[0];
          const carNumber = stripImages(row[1]);
          const driverRaw = row[2];
          const teamRaw = row[3];

          const { position, status } = parsePosition(posCell);
          const driverInfo = parseDriverName(driverRaw);
          const teamName = parseTeamName(teamRaw);

          if (!driverInfo) continue;

          // Match or create driver
          let driverId = matchDriver(driverInfo.firstName, driverInfo.lastName, existingDrivers);
          if (driverId) {
            summary.drivers_matched++;
          } else {
            const { data: newDriver } = await adminClient
              .from("v2_drivers")
              .insert({ full_name: `${driverInfo.firstName} ${driverInfo.lastName}` })
              .select("id, full_name")
              .single();
            if (newDriver) {
              driverId = newDriver.id;
              existingDrivers.push(newDriver);
              summary.drivers_created++;
            }
          }

          // Match or create team
          let teamId: string | null = null;
          if (teamName) {
            teamId = matchTeam(teamName, existingTeams);
            if (teamId) {
              summary.teams_matched++;
            } else {
              const { data: newTeam } = await adminClient
                .from("v2_teams")
                .insert({ full_name: teamName })
                .select("id, full_name, short_name")
                .single();
              if (newTeam) {
                teamId = newTeam.id;
                existingTeams.push(newTeam);
                summary.teams_created++;
              }
            }
          }

          // Insert into the appropriate results table based on type
          if (tableType === "practice" || (tableType === "unknown" && sessionInfo.type === "practice")) {
            // Practice: | Pos | No | Driver | Team | Time/Gap | Laps |
            const timeGap = row.length > 4 ? stripImages(row[4]) : null;
            const laps = row.length > 5 ? parseInt(stripImages(row[5]), 10) : null;

            // P1 has actual time, others have gap
            const isGap = timeGap?.startsWith("+");
            const bestLapTime = isGap ? null : timeGap;
            const gapToP1 = isGap ? timeGap : null;

            await adminClient.from("v2_practice_results").insert({
              session_id: newSession.id,
              position,
              car_number: carNumber || null,
              driver_id: driverId,
              team_id: teamId,
              best_lap_time: bestLapTime || null,
              gap_to_p1: gapToP1 || null,
              laps_run: isNaN(laps!) ? null : laps,
            });
          } else if (tableType === "qualifying") {
            // Qualifying: | Pos | No | Driver | Team | Q1 | Q2 | Q3 | Laps |
            const q1 = row.length > 4 ? stripImages(row[4]) || null : null;
            const q2 = row.length > 5 ? stripImages(row[5]) || null : null;
            const q3 = row.length > 6 ? stripImages(row[6]) || null : null;
            const laps = row.length > 7 ? parseInt(stripImages(row[7]), 10) : null;

            // Determine best time from Q3 > Q2 > Q1
            const bestTime = (q3 && q3 !== "DNF") ? q3 : (q2 && q2 !== "DNF") ? q2 : (q1 && q1 !== "DNF") ? q1 : null;

            await adminClient.from("v2_qualifying_results").insert({
              session_id: newSession.id,
              position,
              car_number: carNumber || null,
              driver_id: driverId,
              team_id: teamId,
              q1_time: q1 === "DNF" ? null : q1,
              q2_time: q2 === "DNF" ? null : q2,
              q3_time: q3 === "DNF" ? null : q3,
              best_time: bestTime,
              laps_run: isNaN(laps!) ? null : laps,
            });
          } else {
            // Race: | Pos | No | Driver | Team | Laps | Time/Retired | Pts |
            const lapsStr = row.length > 4 ? stripImages(row[4]) : "";
            const lapsCompleted = parseInt(lapsStr, 10);
            const timeRetired = row.length > 5 ? stripImages(row[5]) : null;
            const ptsStr = row.length > 6 ? stripImages(row[6]) : "0";
            const points = parseFloat(ptsStr) || 0;

            // Determine status from time/retired column
            let resultStatus = status;
            if (timeRetired === "DNF" || timeRetired === "Ret") resultStatus = "dnf";
            else if (timeRetired === "DSQ") resultStatus = "dsq";
            else if (timeRetired === "DNS") resultStatus = "dns";
            else if (!resultStatus || resultStatus === "finished") resultStatus = "finished";

            const totalTime = (resultStatus === "finished" && timeRetired && timeRetired !== "DNF" && timeRetired !== "DSQ" && timeRetired !== "DNS")
              ? timeRetired
              : null;
            const gapToLeader = (totalTime && totalTime.startsWith("+")) ? totalTime : null;

            await adminClient.from("v2_race_results").insert({
              session_id: newSession.id,
              position,
              car_number: carNumber || null,
              driver_id: driverId,
              team_id: teamId,
              laps_completed: isNaN(lapsCompleted) ? null : lapsCompleted,
              total_time: gapToLeader ? null : totalTime,
              gap_to_leader: gapToLeader,
              points,
              status: resultStatus as any,
            });
          }

          summary.total_entries++;
        }
      } catch (pageErr) {
        console.error(`Error processing ${resultUrl}:`, pageErr);
        summary.errors.push(`Error processing ${resultUrl}: ${pageErr instanceof Error ? pageErr.message : "Unknown"}`);
      }
    }

    console.log("Import summary:", JSON.stringify(summary));

    return new Response(JSON.stringify({ success: true, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-f1-sessions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
