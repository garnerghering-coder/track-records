import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Time Helpers ─────────────────────────────────────────────────────

/** Parse a time string to milliseconds. Strips leading "+" and trailing "s". */
function parseTimeMs(str: string): number | null {
  if (!str || typeof str !== "string") return null;
  const s = str.trim().replace(/^\+/, "").replace(/s$/i, "").trim();
  if (!s) return null;
  const colonMatch = s.match(/^(\d+):(\d{1,2})\.(\d{1,3})$/);
  if (colonMatch) {
    return parseInt(colonMatch[1]) * 60000 + parseInt(colonMatch[2]) * 1000 + parseInt(colonMatch[3].padEnd(3, "0"));
  }
  const secMatch = s.match(/^(\d+)\.(\d{1,3})$/);
  if (secMatch) {
    return parseInt(secMatch[1]) * 1000 + parseInt(secMatch[2].padEnd(3, "0"));
  }
  return null;
}

/** Format ms as lap time "M:SS.mmm" */
function fmtLapTime(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const millis = Math.round(ms % 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

/** Format ms as gap "+S.mmm" or "+M:SS.mmm" (no trailing "s") */
function fmtGap(ms: number): string {
  if (ms <= 0) return "";
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const millis = Math.round(ms % 1000);
  if (mins > 0) return `+${mins}:${secs.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
  return `+${secs}.${millis.toString().padStart(3, "0")}`;
}

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
  existingTeams: Array<{ id: string; full_name: string; short_name: string | null }>,
  seasonAliases: Array<{ team_id: string; display_name: string }> = []
): string | null {
  const normalized = teamName.toLowerCase().trim();

  // 1. Check canonical team names
  for (const t of existingTeams) {
    if (t.full_name.toLowerCase() === normalized) return t.id;
    if (t.short_name && t.short_name.toLowerCase() === normalized) return t.id;
  }

  // 2. Check season aliases (e.g. "Kick Sauber" -> "Audi F1 Team")
  for (const a of seasonAliases) {
    if (a.display_name.toLowerCase() === normalized) return a.team_id;
    if (a.display_name.toLowerCase().includes(normalized) || normalized.includes(a.display_name.toLowerCase())) return a.team_id;
  }

  // 3. Partial match on canonical names
  for (const t of existingTeams) {
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

    // Verify event exists and get season_id
    const { data: event, error: eventErr } = await adminClient.from("v2_events").select("id, name, season_id").eq("id", event_id).single();
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

    // Load existing data for matching (including aliases and season cars)
    const seasonId = event.season_id;
    const [driversRes, teamsRes, existingSessionsRes, aliasesRes, seasonCarsRes] = await Promise.all([
      adminClient.from("v2_drivers").select("id, full_name"),
      adminClient.from("v2_teams").select("id, full_name, short_name"),
      adminClient.from("v2_sessions").select("id, name").eq("event_id", event_id),
      adminClient.from("v2_team_season_names").select("team_id, display_name").eq("season_id", seasonId),
      adminClient.from("v2_team_season_cars").select("team_id, car_id").eq("season_id", seasonId),
    ]);
    const existingDrivers = driversRes.data || [];
    const existingTeams = teamsRes.data || [];
    const existingSessionNames = new Set((existingSessionsRes.data || []).map((s: any) => s.name));
    const seasonAliases: Array<{ team_id: string; display_name: string }> = (aliasesRes.data || []) as any;
    const seasonCarMap = new Map<string, string>();
    for (const sc of (seasonCarsRes.data || []) as any[]) {
      seasonCarMap.set(sc.team_id, sc.car_id);
    }

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

        // ── Pass 1: Parse rows and match drivers/teams ──
        interface ParsedEntry {
          position: number | null;
          status: string | null;
          carNumber: string | null;
          driverId: string | null;
          teamId: string | null;
          carId: string | null;
          rawTimeGap: string | null;
          laps: number | null;
          q1: string | null;
          q2: string | null;
          q3: string | null;
          bestTime: string | null;
          lapsCompleted: number | null;
          timeRetired: string | null;
          points: number;
          resultStatus: string | null;
        }

        const entries: ParsedEntry[] = [];

        for (const row of dataRows) {
          if (row.length < 4) continue;

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
            teamId = matchTeam(teamName, existingTeams, seasonAliases);
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

          const carId = teamId ? (seasonCarMap.get(teamId) || null) : null;

          const entry: ParsedEntry = {
            position, status, carNumber: carNumber || null,
            driverId, teamId, carId,
            rawTimeGap: null, laps: null,
            q1: null, q2: null, q3: null, bestTime: null,
            lapsCompleted: null, timeRetired: null, points: 0, resultStatus: status,
          };

          if (tableType === "practice" || (tableType === "unknown" && sessionInfo.type === "practice")) {
            entry.rawTimeGap = row.length > 4 ? stripImages(row[4]) : null;
            entry.laps = row.length > 5 ? parseInt(stripImages(row[5]), 10) : null;
          } else if (tableType === "qualifying") {
            entry.q1 = row.length > 4 ? stripImages(row[4]) || null : null;
            entry.q2 = row.length > 5 ? stripImages(row[5]) || null : null;
            entry.q3 = row.length > 6 ? stripImages(row[6]) || null : null;
            entry.laps = row.length > 7 ? parseInt(stripImages(row[7]), 10) : null;
            const q3v = entry.q3 && entry.q3 !== "DNF" ? entry.q3 : null;
            const q2v = entry.q2 && entry.q2 !== "DNF" ? entry.q2 : null;
            const q1v = entry.q1 && entry.q1 !== "DNF" ? entry.q1 : null;
            entry.bestTime = q3v || q2v || q1v || null;
          } else {
            const lapsStr = row.length > 4 ? stripImages(row[4]) : "";
            entry.lapsCompleted = parseInt(lapsStr, 10);
            entry.timeRetired = row.length > 5 ? stripImages(row[5]) : null;
            const ptsStr = row.length > 6 ? stripImages(row[6]) : "0";
            entry.points = parseFloat(ptsStr) || 0;
            let rs = status;
            if (entry.timeRetired === "DNF" || entry.timeRetired === "Ret") rs = "dnf";
            else if (entry.timeRetired === "DSQ") rs = "dsq";
            else if (entry.timeRetired === "DNS") rs = "dns";
            else if (!rs || rs === "finished") rs = "finished";
            entry.resultStatus = rs;
          }

          entries.push(entry);
          summary.total_entries++;
        }

        // ── Pass 2: Calculate times, gaps, intervals and insert ──

        if (tableType === "practice" || (tableType === "unknown" && sessionInfo.type === "practice")) {
          // Determine P1's actual time and compute all best lap times
          let p1Ms: number | null = null;
          const bestTimesMs: (number | null)[] = [];

          for (const e of entries) {
            const raw = e.rawTimeGap?.replace(/s$/i, "").trim() || "";
            if (!raw.startsWith("+") && raw.length > 0) {
              const ms = parseTimeMs(raw);
              if (p1Ms === null && ms !== null) p1Ms = ms;
              bestTimesMs.push(ms);
            } else {
              const gapMs = parseTimeMs(raw);
              bestTimesMs.push(p1Ms !== null && gapMs !== null ? p1Ms + gapMs : null);
            }
          }

          for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const myMs = bestTimesMs[i];
            const bestLapTime = myMs !== null ? fmtLapTime(myMs) : null;
            const gapToP1 = (i > 0 && p1Ms !== null && myMs !== null) ? fmtGap(myMs - p1Ms) : null;
            const prevMs = i > 0 ? bestTimesMs[i - 1] : null;
            const interval = (i > 0 && prevMs !== null && myMs !== null) ? fmtGap(myMs - prevMs) : null;

            await adminClient.from("v2_practice_results").insert({
              session_id: newSession.id,
              position: e.position,
              car_number: e.carNumber,
              driver_id: e.driverId,
              team_id: e.teamId,
              car_id: e.carId,
              best_lap_time: bestLapTime,
              gap_to_p1: gapToP1,
              laps_run: isNaN(e.laps!) ? null : e.laps,
              extra_data: interval ? { Int: interval } : {},
            });
          }
        } else if (tableType === "qualifying") {
          // Calculate gap_to_pole and interval from best times
          const bestTimesMs: (number | null)[] = entries.map(e => parseTimeMs(e.bestTime || ""));
          const poleMs = bestTimesMs[0];

          for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const myMs = bestTimesMs[i];
            const gapToPole = (i > 0 && poleMs !== null && myMs !== null) ? fmtGap(myMs - poleMs) : null;
            const prevMs = i > 0 ? bestTimesMs[i - 1] : null;
            const interval = (i > 0 && prevMs !== null && myMs !== null) ? fmtGap(myMs - prevMs) : null;

            await adminClient.from("v2_qualifying_results").insert({
              session_id: newSession.id,
              position: e.position,
              car_number: e.carNumber,
              driver_id: e.driverId,
              team_id: e.teamId,
              car_id: e.carId,
              q1_time: e.q1 === "DNF" ? null : e.q1,
              q2_time: e.q2 === "DNF" ? null : e.q2,
              q3_time: e.q3 === "DNF" ? null : e.q3,
              best_time: e.bestTime,
              gap_to_pole: gapToPole,
              laps_run: isNaN(e.laps!) ? null : e.laps,
              extra_data: interval ? { Int: interval } : {},
            });
          }
        } else {
          // Race: calculate intervals from gaps where possible
          const gapTimesMs: (number | null)[] = [];

          for (const e of entries) {
            if (e.resultStatus === "finished" && e.timeRetired) {
              const raw = e.timeRetired.replace(/s$/i, "").trim();
              if (raw.startsWith("+")) {
                // Check for lap-based gaps like "+1 Lap"
                if (/lap/i.test(raw)) {
                  gapTimesMs.push(null);
                } else {
                  gapTimesMs.push(parseTimeMs(raw));
                }
              } else {
                // P1's total time - gap is 0
                gapTimesMs.push(0);
              }
            } else {
              gapTimesMs.push(null);
            }
          }

          for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const myGapMs = gapTimesMs[i];
            const prevGapMs = i > 0 ? gapTimesMs[i - 1] : null;
            const interval = (i > 0 && prevGapMs !== null && myGapMs !== null) ? fmtGap(myGapMs - prevGapMs) : null;

            const totalTime = (e.resultStatus === "finished" && e.timeRetired && !e.timeRetired.startsWith("+"))
              ? e.timeRetired : null;
            const rawGap = e.timeRetired?.replace(/s$/i, "").trim() || "";
            const gapToLeader = (e.resultStatus === "finished" && rawGap.startsWith("+")) ? rawGap : null;

            await adminClient.from("v2_race_results").insert({
              session_id: newSession.id,
              position: e.position,
              car_number: e.carNumber,
              driver_id: e.driverId,
              team_id: e.teamId,
              car_id: e.carId,
              laps_completed: isNaN(e.lapsCompleted!) ? null : e.lapsCompleted,
              total_time: totalTime,
              gap_to_leader: gapToLeader,
              points: e.points,
              status: e.resultStatus as any,
              extra_data: interval ? { Int: interval } : {},
            });
          }
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
