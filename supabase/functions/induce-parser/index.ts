import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/call-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const sourceDefTool = {
  type: "function" as const,
  function: {
    name: "submit_source_definition",
    description: "Submit the generated parser source definition",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable name for this parser (e.g. 'IndyCar Results')" },
        url_pattern: { type: "string", description: "Regex pattern to match URLs from this source" },
        discovery: {
          type: "object",
          description: "How to find session links from a race weekend page",
          properties: {
            session_link_selector: { type: "string", description: "CSS selector or description of how to find session links" },
            session_type_mapping: { type: "object", description: "Map of text patterns to session types (practice/qualifying/race)" },
          },
        },
        extraction: {
          type: "object",
          description: "How to extract results from a single session page",
          properties: {
            method: { type: "string", enum: ["html_table", "json_api", "csv", "markdown_table"] },
            table_selector: { type: "string", description: "CSS selector for the results table" },
            row_selector: { type: "string", description: "CSS selector for individual rows" },
            json_path: { type: "string", description: "JSON path to results array (for json_api method)" },
            api_url_pattern: { type: "string", description: "URL pattern for API calls (for json_api method)" },
          },
        },
        field_mappings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              target_field: { type: "string", enum: ["position", "driver_name", "team_name", "car_number", "race_class", "laps_completed", "total_time", "gap_to_leader", "best_lap_time", "points", "status", "pit_stops"] },
              source_header_synonyms: { type: "array", items: { type: "string" }, description: "Header text variations that map to this field" },
              source_index: { type: ["number", "null"], description: "Column index (0-based) if no headers" },
              json_key: { type: ["string", "null"], description: "JSON key path for json_api method" },
            },
            required: ["target_field", "source_header_synonyms"],
          },
        },
        normalization: {
          type: "object",
          properties: {
            time_format: { type: "string", description: "Expected time format, e.g. 'M:SS.mmm' or 'H:MM:SS.mmm'" },
            name_format: { type: "string", enum: ["first_last", "last_first", "single_field"] },
            name_separator: { type: "string", description: "Separator for last_first format, e.g. ', '" },
            class_in_separate_column: { type: "boolean" },
            status_patterns: { type: "object", description: "Map of text patterns to status values (dnf/dsq/dns/finished)" },
          },
        },
        validation: {
          type: "object",
          properties: {
            required_fields: { type: "array", items: { type: "string" } },
            min_rows: { type: "number" },
            unique_fields: { type: "array", items: { type: "string" } },
          },
        },
        sample_results: {
          type: "array",
          description: "First 5 parsed results to show as preview",
          items: {
            type: "object",
            properties: {
              position: { type: ["number", "null"] },
              driver_name: { type: "string" },
              team_name: { type: ["string", "null"] },
              car_number: { type: ["string", "null"] },
              race_class: { type: ["string", "null"] },
              gap_to_leader: { type: ["string", "null"] },
              status: { type: ["string", "null"] },
            },
          },
        },
      },
      required: ["name", "url_pattern", "extraction", "field_mappings", "sample_results"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: "Firecrawl is not configured." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const { url } = await req.json();
    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      return new Response(JSON.stringify({ error: "A valid URL is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Scrape the URL
    console.log("Inducing parser from URL:", url);
    const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown", "html"], onlyMainContent: false }),
    });

    if (!scrapeResponse.ok) {
      const errText = await scrapeResponse.text();
      console.error("Firecrawl error:", scrapeResponse.status, errText);
      return new Response(JSON.stringify({ error: "Failed to scrape URL" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scrapeData = await scrapeResponse.json();
    const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
    const html = scrapeData.data?.html || scrapeData.html || "";

    if (markdown.length < 50 && html.length < 50) {
      return new Response(JSON.stringify({ error: "Page had insufficient content" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Send to AI for parser induction
    const aiResponse = await callAI({
      messages: [
        {
          role: "system",
          content: `You are a motorsport data engineering expert. Analyze the provided web page content from a race results website and generate a reusable Source Definition that can deterministically parse results from this source in the future WITHOUT AI.

Your job is to:
1. Identify the data format (HTML tables, JSON API, CSV, etc.)
2. Map the columns/fields to our standard schema
3. Determine normalization rules for times, names, classes, statuses
4. Generate validation rules
5. Provide a sample parse of the first 5 rows as proof

IMPORTANT: The Source Definition must enable FULLY DETERMINISTIC parsing - no AI needed for future imports. Focus on CSS selectors, JSON paths, column indices, and text patterns.

The URL being analyzed is: ${url}
The domain is: ${new URL(url).hostname}`,
        },
        {
          role: "user",
          content: `Analyze this page and generate a Source Definition for parsing race results from this website.

MARKDOWN VIEW (first 30000 chars):
${markdown.slice(0, 30000)}

HTML VIEW (first 30000 chars):
${html.slice(0, 30000)}`,
        },
      ],
      tools: [sourceDefTool],
      tool_choice: { type: "function", function: { name: "submit_source_definition" } },
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "AI did not return a source definition" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const definition = JSON.parse(toolCall.function.arguments);

    // Store as draft in DB
    const config = {
      discovery: definition.discovery || {},
      extraction: definition.extraction,
      field_mappings: definition.field_mappings,
      normalization: definition.normalization || {},
      validation: definition.validation || { required_fields: ["position", "driver_name"], min_rows: 3 },
    };

    const { data: saved, error: saveErr } = await adminClient.from("source_definitions").insert({
      name: definition.name,
      url_pattern: definition.url_pattern,
      parser_type: "ai_induced",
      config,
      test_snapshot: { url, markdown_preview: markdown.slice(0, 5000), scraped_at: new Date().toISOString() },
      status: "draft",
      created_by: userId,
    }).select("id").single();

    if (saveErr) {
      console.error("Save error:", saveErr);
      return new Response(JSON.stringify({ error: "Failed to save source definition" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      source_definition_id: saved.id,
      name: definition.name,
      url_pattern: definition.url_pattern,
      extraction_method: definition.extraction?.method,
      field_count: definition.field_mappings?.length || 0,
      sample_results: definition.sample_results || [],
      config,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("induce-parser error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
