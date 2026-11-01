import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/auth.ts";

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
  if (/practice[-/]1/i.test(url)) return { type: "practice", name: "Practice 1" };
  if (/practice[-/]2/i.test(url)) return { type: "practice", name: "Practice 2" };
  if (/practice[-/]3/i.test(url)) return { type: "practice", name: "Practice 3" };
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

/** Parse session schedule from the F1 hub page markdown.
 *  The hub page is scraped AFTER clicking "Track time" toggle,
 *  so all times are already in track-local time. No offset needed.
 *  Lines look like: "- 11AprChequered FlagPractice 107:30\- 08:30"
 *  or "- 13AprChequered FlagRace11:00"
 */
function parseScheduleFromHub(hubMarkdown: string, year: number): Map<string, { date: string; start_time: string; end_time: string | null }> {
  const schedule = new Map<string, { date: string; start_time: string; end_time: string | null }>();
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };

  // Match lines like: "- 11AprChequered FlagPractice 107:30\- 08:30" or "- 13AprRace11:00"
  // Pattern: day + month + optional junk + session name + start time + optional end time
  const lineRegex = /[-*]\s*(\d{1,2})(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec).*?(?:Chequered Flag|Green Flag|Red Flag)?(Practice \d|Qualifying|Sprint Qualifying|Sprint Shootout|Sprint Race|Sprint|Race)(\d{1,2}:\d{2})(?:\\?-\s*(\d{1,2}:\d{2}))?/gi;

  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(hubMarkdown)) !== null) {
    const day = m[1].padStart(2, "0");
    const monthStr = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
    const month = months[monthStr];
    if (!month) continue;

    let sessionName = m[3].trim();
    // Normalize session names to match detectSessionType output
    if (/^Sprint Qualifying|Sprint Shootout$/i.test(sessionName)) sessionName = "Sprint Qualifying";
    else if (/^Sprint Race|^Sprint$/i.test(sessionName)) sessionName = "Sprint Race";

    const date = `${year}-${month}-${day}`;
    const startTime = m[4];
    const endTime = m[5] || null;

    schedule.set(sessionName, { date, start_time: startTime, end_time: endTime });
  }

  return schedule;
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

/** Extended time parser for race total times like "1:35:39.435" (H:MM:SS.mmm) */
function parseRaceTotalTimeMs(str: string): number | null {
  if (!str || typeof str !== "string") return null;
  const s = str.trim().replace(/^\+/, "").replace(/s$/i, "").trim();
  if (!s) return null;
  // H:MM:SS.mmm or HH:MM:SS.mmm
  const hmsMatch = s.match(/^(\d+):(\d{1,2}):(\d{1,2})\.(\d{1,3})$/);
  if (hmsMatch) {
    return parseInt(hmsMatch[1]) * 3600000 + parseInt(hmsMatch[2]) * 60000 + parseInt(hmsMatch[3]) * 1000 + parseInt(hmsMatch[4].padEnd(3, "0"));
  }
  // M:SS.mmm (no hours)
  return parseTimeMs(s);
}

/** Format ms as race total time "H:MM:SS.mmm" */
function fmtRaceTotalTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const millis = Math.round(ms % 1000);
  if (hours > 0) return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
  return `${mins}:${secs.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

/** Find fuzzy driver candidates (partial last name match) */
function findDriverCandidates(
  firstName: string,
  lastName: string,
  existingDrivers: Array<{ id: string; full_name: string }>
): Array<{ id: string; full_name: string; score: number }> {
  const candidates: Array<{ id: string; full_name: string; score: number }> = [];
  const ln = lastName.toLowerCase();
  const fn = firstName.toLowerCase();
  for (const d of existingDrivers) {
    const parts = d.full_name.toLowerCase().split(/\s+/);
    const existLast = parts[parts.length - 1];
    // Last name exact match but first name doesn't match
    if (existLast === ln && !parts[0].startsWith(fn.charAt(0))) {
      candidates.push({ ...d, score: 70 });
    }
    // Last name contained in full_name
    else if (d.full_name.toLowerCase().includes(ln) && parts.length > 1) {
      const existFirst = parts[0];
      if (existFirst !== fn && !existFirst.startsWith(fn.charAt(0))) {
        candidates.push({ ...d, score: 50 });
      }
    }
  }
  return candidates;
}

/** Find fuzzy team candidates */
function findTeamCandidates(
  teamName: string,
  existingTeams: Array<{ id: string; full_name: string; short_name: string | null }>,
  seasonAliases: Array<{ team_id: string; display_name: string }>
): Array<{ id: string; full_name: string; score: number }> {
  const candidates: Array<{ id: string; full_name: string; score: number }> = [];
  const normalized = teamName.toLowerCase().trim();
  const words = normalized.split(/\s+/);

  for (const t of existingTeams) {
    const tl = t.full_name.toLowerCase();
    // Check if any significant word overlaps (at least 2 words shared)
    const tWords = tl.split(/\s+/);
    const shared = words.filter(w => w.length > 2 && tWords.some(tw => tw.includes(w) || w.includes(tw)));
    if (shared.length >= 1 && tl !== normalized && !tl.includes(normalized) && !normalized.includes(tl)) {
      candidates.push({ id: t.id, full_name: t.full_name, score: shared.length * 30 });
    }
  }

  // Also check aliases
  for (const a of seasonAliases) {
    const al = a.display_name.toLowerCase();
    const aWords = al.split(/\s+/);
    const shared = words.filter(w => w.length > 2 && aWords.some(aw => aw.includes(w) || w.includes(aw)));
    if (shared.length >= 1 && al !== normalized && !al.includes(normalized) && !normalized.includes(al)) {
      const team = existingTeams.find(t => t.id === a.team_id);
      if (team && !candidates.find(c => c.id === team.id)) {
        candidates.push({ id: team.id, full_name: `${team.full_name} (alias: ${a.display_name})`, score: shared.length * 30 });
      }
    }
  }

  return candidates;
}

// ── Main ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Admin only (or an internal service-role call): this function writes with the service-role key.
  const auth = await requireAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

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

    const { url, event_id, mode, resolutions, save_aliases } = await req.json();
    const isPreview = mode === "preview";
    // resolutions: { drivers: { [parsedName]: existingId | "create" }, teams: { [parsedName]: existingId | "create" } }
    // save_aliases: { drivers: string[], teams: string[] } — names to save as search_aliases for future auto-matching
    if (!url || !event_id) {
      return new Response(
        JSON.stringify({ error: "Both url and event_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify event exists and get season_id + year
    const { data: event, error: eventErr } = await adminClient.from("v2_events").select("id, name, season_id, circuit_id, v2_seasons(year)").eq("id", event_id).single();
    if (eventErr || !event) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 1: Scrape hub page to find result URLs ──
    // Use Firecrawl actions to click "Track time" toggle first,
    // so schedule times are in track-local time instead of scraper's timezone.
    console.log("Scraping hub page:", url);
    const hubResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: false,
        actions: [
          { type: "wait", milliseconds: 2000 },
          { type: "click", selector: "menu li:nth-child(2) button" },
          { type: "wait", milliseconds: 1000 },
        ],
      }),
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
    const resultUrlRegex = /\[Results\]\((https:\/\/www\.formula1\.com\/en\/results(?:\.html)?\/\d+\/races\/\d+\/[^)]+)\)/gi;
    const resultUrls: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = resultUrlRegex.exec(hubMarkdown)) !== null) {
      resultUrls.push(match[1]);
    }

    if (resultUrls.length === 0) {
      // Fallback: Try to extract from the results page nav if user pasted a results URL directly
      // Extract base URL pattern and try common session paths
      const baseMatch = url.match(/(https:\/\/www\.formula1\.com\/en\/results(?:\.html)?\/\d+\/races\/\d+\/[^/]+)/);
      if (baseMatch) {
        const base = baseMatch[1];
        for (const path of ["/practice/1", "/practice/2", "/practice/3", "/qualifying", "/race-result"]) {
          resultUrls.push(base + path);
        }
      }

      // Also try extracting from the results page sidebar navigation
      const navRegex = /\[(?:Practice \d|Qualifying|Race Result)(?:Active)?\]\((https:\/\/www\.formula1\.com\/en\/results(?:\.html)?\/[^)]+)\)/gi;
      while ((match = navRegex.exec(hubMarkdown)) !== null) {
        if (!resultUrls.includes(match[1])) {
          resultUrls.push(match[1]);
        }
      }
    }

    // Deduplicate and filter to only practice, qualifying, race
    const uniqueUrls = [...new Set(resultUrls)].filter(
      (u) => /practice[-/]\d|qualifying|race-result|sprint/i.test(u)
    );

    if (uniqueUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: "No result page URLs found on this page. Make sure you're linking to an F1 race hub page." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Found result URLs:", uniqueUrls);

    // Parse session schedule (dates, times) from the hub page — already in track time
    const seasonYear = (event as any).v2_seasons?.year || new Date().getFullYear();
    const sessionSchedule = parseScheduleFromHub(hubMarkdown, seasonYear);
    console.log("Parsed schedule:", JSON.stringify(Object.fromEntries(sessionSchedule)));

    // Load existing data for matching (including aliases and season cars)
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
    for (const sc of (seasonCarsRes.data || []) as any[]) {
      seasonCarMap.set(sc.team_id, sc.car_id);
    }

    // Build search alias maps: alias (lowercase) -> canonical entity id
    const driverAliasMap = new Map<string, string>();
    for (const a of (driverAliasesRes.data || []) as any[]) {
      driverAliasMap.set(a.alias.toLowerCase(), a.canonical);
    }
    const teamAliasMap = new Map<string, string>();
    for (const a of (teamAliasesRes.data || []) as any[]) {
      teamAliasMap.set(a.alias.toLowerCase(), a.canonical);
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

    // Track unresolved entities for preview mode
    const unresolvedDrivers = new Map<string, Array<{ id: string; full_name: string }>>();
    const unresolvedTeams = new Map<string, Array<{ id: string; full_name: string }>>();

    // Get current max sort order for sessions
    const { data: allSessions } = await adminClient.from("v2_sessions").select("sort_order").eq("event_id", event_id).order("sort_order", { ascending: false }).limit(1);
    let sortOrder = (allSessions?.[0]?.sort_order ?? -1) + 1;

    for (const resultUrl of uniqueUrls) {
      try {
        // Try scraping the URL, and if it fails or returns no table,
        // retry with alternate URL format (old .html format <-> new format)
        const urlsToTry = [resultUrl];
        
        // Generate alternate URL format
        // Old: /results.html/2022/races/1124/bahrain/practice-2.html -> New: /results/2022/races/1124/bahrain/practice/2
        // Old: /results.html/2022/races/1124/bahrain/qualifying.html -> New: /results/2022/races/1124/bahrain/qualifying
        // Old: /results.html/2022/races/1124/bahrain/race-result.html -> New: /results/2022/races/1124/bahrain/race-result
        const oldFormatMatch = resultUrl.match(/\/results\.html\/(.+?)\.html$/);
        if (oldFormatMatch) {
          let newPath = oldFormatMatch[1];
          // Convert "practice-2" to "practice/2", "practice-1" to "practice/1", etc.
          newPath = newPath.replace(/practice-(\d)/, "practice/$1");
          urlsToTry.push(`https://www.formula1.com/en/results/${newPath}`);
        }
        // New format -> old format fallback
        const newFormatMatch = resultUrl.match(/\/results\/(.+?)$/);
        if (newFormatMatch && !resultUrl.includes(".html")) {
          let oldPath = newFormatMatch[1];
          oldPath = oldPath.replace(/practice\/(\d)/, "practice-$1");
          urlsToTry.push(`https://www.formula1.com/en/results.html/${oldPath}.html`);
        }

        let pageMarkdown = "";
        let scrapedUrl = resultUrl;

        for (const tryUrl of urlsToTry) {
          console.log("Scraping result page:", tryUrl);
          const pageResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ url: tryUrl, formats: ["markdown"], onlyMainContent: false }),
          });

          if (!pageResponse.ok) {
            console.log(`Failed to scrape ${tryUrl}, trying next format...`);
            continue;
          }

          const pageData = await pageResponse.json();
          const md: string = pageData.data?.markdown || pageData.markdown || "";
          
          // Check if it's an error page
          if (md.includes("An error has occurred") || md.length < 200) {
            console.log(`Page not available at ${tryUrl}, trying next format...`);
            continue;
          }

          // Check if it has a table
          const testRows = parseMarkdownTable(md);
          if (testRows.length >= 2) {
            pageMarkdown = md;
            scrapedUrl = tryUrl;
            break;
          }
          
          console.log(`No table found at ${tryUrl}, trying next format...`);
        }

        if (!pageMarkdown) {
          console.log(`Session data not available for any URL format: ${resultUrl}`);
          continue;
        }

        const rows = parseMarkdownTable(pageMarkdown);
        const headerRow = rows[0];
        const dataRows = rows.slice(1);
        const tableType = detectTableType(headerRow);
        const sessionInfo = detectSessionType(scrapedUrl, "");

        // In preview mode, skip session creation — just parse data
        let newSession: { id: string } | null = null;
        if (!isPreview) {
          // Look up schedule info for this session
          const scheduleInfo = sessionSchedule.get(sessionInfo.name);

          const { data: sess, error: sessionErr } = await adminClient
            .from("v2_sessions")
            .insert({
              event_id,
              name: sessionInfo.name,
              session_type: sessionInfo.type as any,
              status: "draft" as any,
              sort_order: sortOrder++,
              source_document_url: scrapedUrl,
              date: scheduleInfo?.date || null,
              start_time: scheduleInfo?.start_time || null,
              end_time: scheduleInfo?.end_time || null,
            } as any)
            .select("id")
            .single();

          if (sessionErr || !sess) {
            summary.errors.push(`Failed to create session ${sessionInfo.name}: ${sessionErr?.message}`);
            continue;
          }
          newSession = sess;
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
        }
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

          const driverFullName = `${driverInfo.firstName} ${driverInfo.lastName}`;

          // Match or create driver
          let driverId = matchDriver(driverInfo.firstName, driverInfo.lastName, existingDrivers);
          
          // Check search_aliases for a saved mapping
          if (!driverId) {
            const aliasId = driverAliasMap.get(driverFullName.toLowerCase());
            if (aliasId) {
              driverId = aliasId;
              summary.drivers_matched++;
            }
          }
          
          // Check resolutions map first (from preview step)
          if (!driverId && resolutions?.drivers?.[driverFullName]) {
            const resolved = resolutions.drivers[driverFullName];
            if (resolved !== "create") {
              driverId = resolved;
              summary.drivers_matched++;
            }
          }
          
          if (driverId) {
            if (!resolutions?.drivers?.[driverFullName]) summary.drivers_matched++;
          } else {
            if (isPreview) {
              // In preview mode, find fuzzy candidates instead of creating
              const candidates = findDriverCandidates(driverInfo.firstName, driverInfo.lastName, existingDrivers);
              if (candidates.length > 0 && !unresolvedDrivers.has(driverFullName)) {
                unresolvedDrivers.set(driverFullName, candidates.map(c => ({ id: c.id, full_name: c.full_name })));
              }
              summary.drivers_created++;
            } else {
              const { data: newDriver } = await adminClient
                .from("v2_drivers")
                .insert({ full_name: driverFullName })
                .select("id, full_name")
                .single();
              if (newDriver) {
                driverId = newDriver.id;
                existingDrivers.push(newDriver);
                summary.drivers_created++;
              }
            }
          }

          // Match or create team
          let teamId: string | null = null;
          if (teamName) {
            teamId = matchTeam(teamName, existingTeams, seasonAliases);
            
            // Check search_aliases for a saved mapping
            if (!teamId) {
              const aliasId = teamAliasMap.get(teamName.toLowerCase());
              if (aliasId) {
                teamId = aliasId;
                summary.teams_matched++;
              }
            }
            
            // Check resolutions map
            if (!teamId && resolutions?.teams?.[teamName]) {
              const resolved = resolutions.teams[teamName];
              if (resolved !== "create") {
                teamId = resolved;
                summary.teams_matched++;
              }
            }
            
            if (teamId) {
              if (!resolutions?.teams?.[teamName]) summary.teams_matched++;
            } else {
              if (isPreview) {
                const candidates = findTeamCandidates(teamName, existingTeams, seasonAliases);
                if (candidates.length > 0 && !unresolvedTeams.has(teamName)) {
                  unresolvedTeams.set(teamName, candidates.map(c => ({ id: c.id, full_name: c.full_name })));
                }
                summary.teams_created++;
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
        // In preview mode, skip DB inserts
        if (isPreview) {
          // Just count entries
          continue;
        }

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
              session_id: newSession!.id,
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
              session_id: newSession!.id,
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
          // Race: calculate total_time for P2+ and intervals from gaps
          const gapTimesMs: (number | null)[] = [];
          let p1TotalTimeMs: number | null = null;
          let lastFinisherTotalMs: number | null = null;

          for (const e of entries) {
            if (e.resultStatus === "finished" && e.timeRetired) {
              const raw = e.timeRetired.replace(/s$/i, "").trim();
              if (raw.startsWith("+")) {
                if (/lap/i.test(raw)) {
                  gapTimesMs.push(null);
                } else {
                  gapTimesMs.push(parseTimeMs(raw));
                }
              } else {
                // P1's total time
                p1TotalTimeMs = parseRaceTotalTimeMs(raw);
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

            // P1 gets their raw total time; P2+ get computed total time
            let totalTime: string | null = null;
            if (i === 0 && e.resultStatus === "finished" && e.timeRetired && !e.timeRetired.startsWith("+")) {
              totalTime = e.timeRetired.replace(/s$/i, "").trim();
              const ms = parseRaceTotalTimeMs(totalTime);
              if (ms !== null) lastFinisherTotalMs = ms;
            } else if (i > 0 && p1TotalTimeMs !== null && myGapMs !== null) {
              const absMs = p1TotalTimeMs + myGapMs;
              totalTime = fmtRaceTotalTime(absMs);
              if (absMs > (lastFinisherTotalMs || 0)) lastFinisherTotalMs = absMs;
            }

            const rawGap = e.timeRetired?.replace(/s$/i, "").trim() || "";
            let gapToLeader: string | null = null;
            if (e.resultStatus === "finished" && rawGap.startsWith("+")) {
              // Clean the gap: remove trailing 's', ensure proper format
              if (/lap/i.test(rawGap)) {
                // Normalize: "+1 Lap", "+2 Laps", etc.
                const lapMatch = rawGap.match(/\+(\d+)\s*lap/i);
                if (lapMatch) {
                  const n = parseInt(lapMatch[1], 10);
                  gapToLeader = `+${n} ${n === 1 ? "Lap" : "Laps"}`;
                } else {
                  gapToLeader = rawGap;
                }
              } else {
                const gapMs = parseTimeMs(rawGap);
                gapToLeader = gapMs !== null ? fmtGap(gapMs) : rawGap;
              }
            }

            await adminClient.from("v2_race_results").insert({
              session_id: newSession!.id,
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

          // If race session has a start_time but no end_time, calculate it
          // from the last finisher's total time, rounded up to next 5-min mark
          const scheduleInfo = sessionSchedule.get(sessionInfo.name);
          if (newSession && scheduleInfo?.start_time && !scheduleInfo.end_time && lastFinisherTotalMs !== null) {
            const [sh, sm] = scheduleInfo.start_time.split(":").map(Number);
            const startMinutes = sh * 60 + sm;
            const raceMinutes = lastFinisherTotalMs / 60000;
            const endMinutesRaw = startMinutes + raceMinutes;
            const endMinutesRounded = Math.ceil(endMinutesRaw / 5) * 5;
            const endH = Math.floor(endMinutesRounded / 60);
            const endM = endMinutesRounded % 60;
            const computedEndTime = `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
            await adminClient.from("v2_sessions").update({ end_time: computedEndTime } as any).eq("id", newSession.id);
            console.log(`Computed race end_time: ${computedEndTime} (start=${scheduleInfo.start_time}, race=${Math.round(raceMinutes)}min)`);
          }
        }
      } catch (pageErr) {
        console.error(`Error processing ${resultUrl}:`, pageErr);
        summary.errors.push(`Error processing ${resultUrl}: ${pageErr instanceof Error ? pageErr.message : "Unknown"}`);
      }
    }

    console.log("Import summary:", JSON.stringify(summary));

    // In preview mode, return unresolved entities for the user to resolve
    if (isPreview) {
      const unresolvedDriversObj: Record<string, Array<{ id: string; full_name: string }>> = {};
      unresolvedDrivers.forEach((candidates, name) => { unresolvedDriversObj[name] = candidates; });
      const unresolvedTeamsObj: Record<string, Array<{ id: string; full_name: string }>> = {};
      unresolvedTeams.forEach((candidates, name) => { unresolvedTeamsObj[name] = candidates; });

      const hasUnresolved = unresolvedDrivers.size > 0 || unresolvedTeams.size > 0;

      return new Response(JSON.stringify({
        success: true,
        preview: true,
        has_unresolved: hasUnresolved,
        unresolved_drivers: unresolvedDriversObj,
        unresolved_teams: unresolvedTeamsObj,
        ...summary,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save aliases for "don't ask again" selections
    if (save_aliases && resolutions) {
      const aliasInserts: Array<{ alias: string; canonical: string; entity_type: string }> = [];
      for (const name of (save_aliases.drivers || [])) {
        const resolvedId = resolutions.drivers?.[name];
        if (resolvedId && resolvedId !== "create") {
          aliasInserts.push({ alias: name, canonical: resolvedId, entity_type: "driver" });
        }
      }
      for (const name of (save_aliases.teams || [])) {
        const resolvedId = resolutions.teams?.[name];
        if (resolvedId && resolvedId !== "create") {
          aliasInserts.push({ alias: name, canonical: resolvedId, entity_type: "team" });
        }
      }
      if (aliasInserts.length > 0) {
        const { error: aliasErr } = await adminClient.from("search_aliases").upsert(aliasInserts, { onConflict: "alias,entity_type", ignoreDuplicates: true });
        if (aliasErr) console.error("Failed to save aliases:", aliasErr);
        else console.log(`Saved ${aliasInserts.length} alias(es) for future imports`);
      }
    }

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