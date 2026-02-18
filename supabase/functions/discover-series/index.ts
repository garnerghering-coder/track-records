import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: "Firecrawl not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    async function callAI(body: Record<string, any>): Promise<Response> {
      const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
      if (GROQ_KEY) {
        const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, model: "llama-3.3-70b-versatile" }),
        });
        if (resp.status !== 429) return resp;
        console.log("Groq rate limited, falling back to Lovable AI");
      }
      const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_KEY) throw new Error("No AI provider available");
      return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, model: "google/gemini-2.5-flash" }),
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    const { seriesName, seasonYear } = await req.json();
    if (!seriesName || !seasonYear) {
      return new Response(JSON.stringify({ error: "seriesName and seasonYear are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Search for season calendar/results pages
    console.log(`Discovering series: ${seriesName} ${seasonYear}`);
    const searchQuery = `${seriesName} ${seasonYear} full season race results`;
    const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: searchQuery, limit: 10, scrapeOptions: { formats: ["markdown"] } }),
    });

    if (!searchResponse.ok) {
      const errText = await searchResponse.text();
      console.error("Firecrawl search error:", errText);
      return new Response(JSON.stringify({ error: "Failed to search for series results" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const searchData = await searchResponse.json();
    const searchResults = searchData.data || [];
    console.log(`Found ${searchResults.length} search results`);

    if (searchResults.length === 0) {
      return new Response(JSON.stringify({ error: "No results found for this series/year" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Combine search result content for AI analysis
    const combinedContent = searchResults.map((r: any, i: number) =>
      `--- Result ${i + 1}: ${r.url} ---\nTitle: ${r.title || ""}\n${(r.markdown || r.description || "").slice(0, 5000)}`
    ).join("\n\n");

    // Step 2: Ask AI to extract race events and their result URLs
    const aiResponse = await callAI({
      max_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a motorsport data researcher. Given search results about a racing series season, extract a list of individual race events with URLs where their full results can be found.

Return JSON: { "events": [{ "event_name": "string", "result_url": "string or null", "event_date": "YYYY-MM-DD or null", "location": "string or null" }] }

Rules:
- List every round/race you can identify from the season
- Only include URLs that look like they lead to actual race results pages (not news articles or previews)
- If you can't find a result URL for an event, set result_url to null
- Use the official event name
- Order events chronologically`,
        },
        {
          role: "user",
          content: `Extract all race events from the ${seasonYear} ${seriesName} season from these search results:\n\n${combinedContent.slice(0, 60000)}`,
        },
      ],
    });

    if (!aiResponse.ok) {
      console.error("AI error:", await aiResponse.text());
      return new Response(JSON.stringify({ error: "AI failed to extract events" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content;
    if (!rawContent) {
      return new Response(JSON.stringify({ error: "AI returned no content" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let discovered;
    try {
      discovered = JSON.parse(rawContent);
    } catch {
      console.error("Failed to parse AI response:", rawContent.slice(0, 500));
      return new Response(JSON.stringify({ error: "AI returned invalid JSON" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const events = discovered.events || [];
    console.log(`Discovered ${events.length} events`);

    if (events.length === 0) {
      return new Response(JSON.stringify({ error: "No events found for this series/year", eventsFound: 0 }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Check which events already exist
    const { data: existingEvents } = await adminClient
      .from("race_events")
      .select("event_name, series_name, season_year")
      .eq("season_year", seasonYear)
      .ilike("series_name", `%${seriesName.split(" ").slice(0, 2).join(" ")}%`);

    const existingSet = new Set(
      (existingEvents || []).map(e => `${e.event_name.toLowerCase()}|${e.season_year}`)
    );

    // Step 4: For each event with a URL, import via scrape-race-results
    const results: any[] = [];
    let imported = 0, skipped = 0, failed = 0, noUrl = 0;

    for (const event of events) {
      const key = `${event.event_name.toLowerCase()}|${seasonYear}`;
      if (existingSet.has(key)) {
        results.push({ event_name: event.event_name, status: "skipped", reason: "Already exists" });
        skipped++;
        continue;
      }

      if (!event.result_url) {
        results.push({ event_name: event.event_name, status: "no_url", reason: "No results URL found" });
        noUrl++;
        continue;
      }

      try {
        console.log(`Importing: ${event.event_name} from ${event.result_url}`);
        const importResponse = await fetch(`${SUPABASE_URL}/functions/v1/scrape-race-results`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
          },
          body: JSON.stringify({ url: event.result_url }),
        });

        const importResult = await importResponse.json();
        if (importResponse.ok && importResult.success) {
          results.push({
            event_name: event.event_name,
            status: "imported",
            entriesCount: importResult.entriesCount,
            matchedDrivers: importResult.matchedDrivers,
            createdDrivers: importResult.createdDrivers,
          });
          imported++;
          existingSet.add(key);
        } else {
          results.push({ event_name: event.event_name, status: "error", reason: importResult.error || "Import failed" });
          failed++;
        }
      } catch (err) {
        console.error(`Error importing ${event.event_name}:`, err);
        results.push({ event_name: event.event_name, status: "error", reason: err instanceof Error ? err.message : "Unknown error" });
        failed++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      seriesName,
      seasonYear,
      eventsFound: events.length,
      imported,
      skipped,
      failed,
      noUrl,
      results,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("discover-series error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
