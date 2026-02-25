import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Parse time string to ms: supports M:SS.mmm, SS.mmm, H:MM:SS.mmm */
function parseTime(str: string): number | null {
  if (!str || typeof str !== "string") return null;
  const s = str.trim().replace(/^\+/, "");
  const hms = s.match(/^(\d+):(\d{2}):(\d{2})\.(\d{1,3})$/);
  if (hms) return parseInt(hms[1]) * 3600000 + parseInt(hms[2]) * 60000 + parseInt(hms[3]) * 1000 + parseInt(hms[4].padEnd(3, "0"));
  const ms = s.match(/^(\d+):(\d{1,2})\.(\d{1,3})$/);
  if (ms) return parseInt(ms[1]) * 60000 + parseInt(ms[2]) * 1000 + parseInt(ms[3].padEnd(3, "0"));
  const ss = s.match(/^(\d+)\.(\d{1,3})$/);
  if (ss) return parseInt(ss[1]) * 1000 + parseInt(ss[2].padEnd(3, "0"));
  return null;
}

/** Extract a field value from a markdown table row using field mappings */
function extractField(headers: string[], cells: string[], mapping: any): string | null {
  // Try header synonym matching first
  if (mapping.source_header_synonyms && headers.length > 0) {
    for (const synonym of mapping.source_header_synonyms) {
      const idx = headers.findIndex(h => h.toLowerCase().trim() === synonym.toLowerCase().trim());
      if (idx >= 0 && idx < cells.length) return cells[idx]?.trim() || null;
    }
    // Fuzzy match
    for (const synonym of mapping.source_header_synonyms) {
      const idx = headers.findIndex(h => h.toLowerCase().includes(synonym.toLowerCase()));
      if (idx >= 0 && idx < cells.length) return cells[idx]?.trim() || null;
    }
  }
  // Fallback to index
  if (mapping.source_index != null && mapping.source_index < cells.length) {
    return cells[mapping.source_index]?.trim() || null;
  }
  return null;
}

/** Normalize a driver name based on format rules */
function normalizeName(raw: string, rules: any): string {
  if (!raw) return raw;
  const name = raw.replace(/\*+/g, "").trim();
  if (rules?.name_format === "last_first") {
    const sep = rules.name_separator || ",";
    const parts = name.split(sep).map((p: string) => p.trim());
    if (parts.length >= 2) return `${parts[1]} ${parts[0]}`;
  }
  return name;
}

/** Determine status from raw text */
function normalizeStatus(raw: string | null, patterns: any): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (patterns) {
    for (const [pattern, status] of Object.entries(patterns)) {
      if (lower.includes(pattern.toLowerCase())) return status as string;
    }
  }
  // Default patterns
  if (lower.includes("dnf") || lower === "ret" || lower === "retired") return "dnf";
  if (lower.includes("dsq") || lower.includes("disqualif")) return "dsq";
  if (lower.includes("dns") || lower === "did not start") return "dns";
  if (lower.includes("finish") || /^\d+$/.test(raw.trim())) return "finished";
  return raw.trim();
}

/** Parse a markdown table into rows of cells */
function parseMarkdownTable(markdown: string): { headers: string[]; rows: string[][] } {
  const lines = markdown.split("\n").map(l => l.trim()).filter(l => l.startsWith("|"));
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseLine = (line: string) => line.split("|").slice(1, -1).map(c => c.trim());
  const headers = parseLine(lines[0]);

  // Skip separator row (---/---)
  const dataStart = lines[1]?.includes("---") ? 2 : 1;
  const rows = lines.slice(dataStart).map(parseLine).filter(r => r.length > 0);

  return { headers, rows };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url, source_definition_id, event_id, mode = "preview" } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load source definition
    const { data: sourceDef, error: sdErr } = await adminClient
      .from("source_definitions")
      .select("*")
      .eq("id", source_definition_id)
      .single();

    if (sdErr || !sourceDef) {
      return new Response(JSON.stringify({ error: "Source definition not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = sourceDef.config as any;
    const log: any[] = [];
    const addLog = (step: string, detail?: string) => {
      log.push({ step, detail, ts: new Date().toISOString() });
      console.log(`[execute-parser] ${step}${detail ? ": " + detail : ""}`);
    };

    // Create import run record
    const { data: run } = await adminClient.from("import_runs").insert({
      source_definition_id,
      event_id: event_id || null,
      url,
      status: "running",
      created_by: userId,
    }).select("id").single();

    try {
      // Step 1: Scrape the URL
      addLog("scrape_start", url);

      if (!FIRECRAWL_API_KEY) throw new Error("Firecrawl not configured");

      const scrapeResp = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      });

      if (!scrapeResp.ok) throw new Error(`Scrape failed: ${scrapeResp.status}`);
      const scrapeData = await scrapeResp.json();
      const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
      addLog("scrape_complete", `${markdown.length} chars`);

      if (markdown.length < 50) throw new Error("Insufficient content scraped");

      // Step 2: Extract data based on method
      const extraction = config.extraction;
      const fieldMappings = config.field_mappings || [];
      const normalization = config.normalization || {};

      let extractedRows: any[] = [];

      if (extraction.method === "markdown_table" || extraction.method === "html_table") {
        // Parse markdown tables
        const { headers, rows } = parseMarkdownTable(markdown);
        addLog("table_parsed", `${headers.length} columns, ${rows.length} rows`);

        for (const cells of rows) {
          const row: any = {};
          for (const mapping of fieldMappings) {
            const value = extractField(headers, cells, mapping);
            if (value) row[mapping.target_field] = value;
          }
          if (row.driver_name || row.position) {
            extractedRows.push(row);
          }
        }
      } else if (extraction.method === "json_api") {
        // Try to extract JSON from the page or fetch the API URL
        const apiUrl = extraction.api_url_pattern ? extraction.api_url_pattern.replace("{url}", url) : null;
        if (apiUrl) {
          const jsonResp = await fetch(apiUrl);
          if (jsonResp.ok) {
            const jsonData = await jsonResp.json();
            // Navigate to results array using json_path
            let results = jsonData;
            if (extraction.json_path) {
              for (const key of extraction.json_path.split(".")) {
                results = results?.[key];
              }
            }
            if (Array.isArray(results)) {
              for (const item of results) {
                const row: any = {};
                for (const mapping of fieldMappings) {
                  const key = mapping.json_key || mapping.source_header_synonyms?.[0];
                  if (key && item[key] != null) row[mapping.target_field] = String(item[key]);
                }
                if (row.driver_name || row.position) extractedRows.push(row);
              }
            }
          }
        }
        addLog("json_extracted", `${extractedRows.length} rows`);
      }

      addLog("extraction_complete", `${extractedRows.length} rows extracted`);

      // Step 3: Normalize
      const mappedRows = extractedRows.map(row => {
        const mapped: any = { ...row };
        if (mapped.position) mapped.position = parseInt(mapped.position) || null;
        if (mapped.driver_name) mapped.driver_name = normalizeName(mapped.driver_name, normalization);
        if (mapped.status) mapped.status = normalizeStatus(mapped.status, normalization.status_patterns);
        if (mapped.laps_completed) mapped.laps_completed = parseInt(mapped.laps_completed) || null;
        if (mapped.pit_stops) mapped.pit_stops = parseInt(mapped.pit_stops) || null;
        if (mapped.points) mapped.points = parseFloat(mapped.points) || null;
        return mapped;
      });

      addLog("normalization_complete", `${mappedRows.length} rows normalized`);

      // Step 4: Validate
      const validation = config.validation || {};
      const validationErrors: any[] = [];

      if (validation.min_rows && mappedRows.length < validation.min_rows) {
        validationErrors.push({ type: "min_rows", expected: validation.min_rows, actual: mappedRows.length });
      }

      if (validation.required_fields) {
        for (const field of validation.required_fields) {
          const missing = mappedRows.filter(r => !r[field]);
          if (missing.length > mappedRows.length * 0.5) {
            validationErrors.push({ type: "missing_field", field, missing_count: missing.length, total: mappedRows.length });
          }
        }
      }

      addLog("validation_complete", `${validationErrors.length} issues`);

      // Update import run
      await adminClient.from("import_runs").update({
        status: validationErrors.length > 0 ? "needs_review" : (mode === "preview" ? "preview" : "success"),
        raw_content_preview: markdown.slice(0, 5000),
        extracted_data: extractedRows.slice(0, 100),
        mapped_data: mappedRows.slice(0, 100),
        validation_errors: validationErrors,
        log,
      }).eq("id", run!.id);

      // If preview mode, just return the results
      if (mode === "preview") {
        return new Response(JSON.stringify({
          success: true,
          mode: "preview",
          import_run_id: run!.id,
          rows_extracted: mappedRows.length,
          sample_results: mappedRows.slice(0, 10),
          validation_errors: validationErrors,
          log,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Step 5: Commit mode - insert into DB
      if (!event_id) throw new Error("event_id is required for commit mode");

      // Match/create drivers and insert results
      const { data: allDrivers } = await adminClient.from("v2_drivers").select("id, full_name");
      const driverMap = new Map<string, string>();
      for (const d of allDrivers || []) {
        driverMap.set(d.full_name.toLowerCase(), d.id);
      }

      const { data: allTeams } = await adminClient.from("v2_teams").select("id, full_name");
      const teamMap = new Map<string, string>();
      for (const t of allTeams || []) {
        teamMap.set(t.full_name.toLowerCase(), t.id);
      }

      // Create a session for the results
      const maxOrder = 0;
      const sessionName = "Imported Results";
      const { data: session, error: sessErr } = await adminClient.from("v2_sessions").insert({
        event_id,
        name: sessionName,
        session_type: "race",
        sort_order: maxOrder,
        status: "draft",
      } as any).select("id").single();

      if (sessErr || !session) throw new Error("Failed to create session");

      let driversMatched = 0, driversCreated = 0, teamsMatched = 0, teamsCreated = 0;

      for (const row of mappedRows) {
        // Match driver
        let driverId: string | null = null;
        if (row.driver_name) {
          const normalized = row.driver_name.toLowerCase();
          driverId = driverMap.get(normalized) || null;
          if (!driverId) {
            // Fuzzy: try last name match
            const parts = row.driver_name.split(/\s+/);
            const lastName = parts[parts.length - 1].toLowerCase();
            for (const [name, id] of driverMap.entries()) {
              if (name.endsWith(lastName) && name.includes(parts[0].toLowerCase())) {
                driverId = id;
                break;
              }
            }
          }
          if (driverId) {
            driversMatched++;
          } else {
            const nameParts = row.driver_name.split(/\s+/);
            const { data: newDriver } = await adminClient.from("v2_drivers").insert({
              full_name: row.driver_name,
              short_name: nameParts.length >= 2 ? `${nameParts[0][0]}. ${nameParts[nameParts.length - 1]}` : row.driver_name,
            }).select("id").single();
            if (newDriver) {
              driverId = newDriver.id;
              driverMap.set(row.driver_name.toLowerCase(), driverId!);
              driversCreated++;
            }
          }
        }

        // Match team
        let teamId: string | null = null;
        if (row.team_name) {
          teamId = teamMap.get(row.team_name.toLowerCase()) || null;
          if (!teamId) {
            // Fuzzy match
            for (const [name, id] of teamMap.entries()) {
              if (name.includes(row.team_name.toLowerCase()) || row.team_name.toLowerCase().includes(name)) {
                teamId = id;
                break;
              }
            }
          }
          if (teamId) {
            teamsMatched++;
          } else {
            const { data: newTeam } = await adminClient.from("v2_teams").insert({
              full_name: row.team_name,
            }).select("id").single();
            if (newTeam) {
              teamId = newTeam.id;
              teamMap.set(row.team_name.toLowerCase(), teamId!);
              teamsCreated++;
            }
          }
        }

        // Insert race result
        await adminClient.from("v2_race_results").insert({
          session_id: session.id,
          driver_id: driverId,
          team_id: teamId,
          car_number: row.car_number || null,
          position: row.position || null,
          laps_completed: row.laps_completed || null,
          gap_to_leader: row.gap_to_leader || null,
          fastest_lap_time: row.best_lap_time || null,
          total_time: row.total_time || null,
          pit_stops: row.pit_stops || null,
          points: row.points || null,
          status: row.status || "finished",
        });
      }

      // Update import run
      await adminClient.from("import_runs").update({
        status: "success",
        sessions_created: 1,
        entries_created: mappedRows.length,
        log: [...log, { step: "commit_complete", detail: `${mappedRows.length} entries`, ts: new Date().toISOString() }],
      }).eq("id", run!.id);

      // Activate source definition if still draft
      if (sourceDef.status === "draft") {
        await adminClient.from("source_definitions").update({ status: "active" }).eq("id", source_definition_id);
      }

      return new Response(JSON.stringify({
        success: true,
        mode: "commit",
        import_run_id: run!.id,
        sessions_created: 1,
        total_entries: mappedRows.length,
        drivers_matched: driversMatched,
        drivers_created: driversCreated,
        teams_matched: teamsMatched,
        teams_created: teamsCreated,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (innerErr) {
      // Update run with error
      if (run?.id) {
        await adminClient.from("import_runs").update({
          status: "failed",
          error_message: innerErr instanceof Error ? innerErr.message : "Unknown error",
          log,
        }).eq("id", run.id);
      }
      throw innerErr;
    }

  } catch (e) {
    console.error("execute-parser error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
