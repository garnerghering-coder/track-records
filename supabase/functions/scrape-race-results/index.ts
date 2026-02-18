import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const raceResultsTool = {
  type: "function" as const,
  function: {
    name: "submit_race_results",
    description: "Submit the extracted race results as structured data",
    parameters: {
      type: "object",
      properties: {
        event_name: { type: "string", description: "Name of the race event" },
        series_name: { type: "string", description: "Name of the racing series" },
        season_year: { type: "number", description: "Year of the season" },
        location: { type: ["string", "null"], description: "Location/circuit name" },
        event_date: { type: ["string", "null"], description: "Event date in YYYY-MM-DD format" },
        category: {
          type: ["string", "null"],
          enum: ["karting", "single_seater", "gt", "touring_car", "sports_car", "rally", "endurance", "formula", "stock_car", "other", null],
        },
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              finishing_position: { type: ["number", "null"] },
              class_position: { type: ["number", "null"] },
              car_number: { type: ["string", "null"] },
              team_name: { type: ["string", "null"] },
              driver_names: { type: "array", items: { type: "string" }, description: "Full name(s) of driver(s)" },
              race_class: { type: ["string", "null"] },
              laps_completed: { type: ["number", "null"] },
              gap_to_leader: { type: ["string", "null"] },
              gap_to_class_leader: { type: ["string", "null"] },
              pit_stops: { type: ["number", "null"] },
              status: { type: ["string", "null"], description: "e.g. Finished, DNF, DNS, DSQ" },
            },
            required: ["driver_names"],
            additionalProperties: false,
          },
        },
      },
      required: ["event_name", "series_name", "season_year", "entries"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: "Firecrawl is not configured. Connect the Firecrawl integration first." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    const { url } = await req.json();
    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      return new Response(JSON.stringify({ error: "A valid URL is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Scrape the URL with Firecrawl
    console.log("Scraping URL:", url);
    const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });

    if (!scrapeResponse.ok) {
      const errData = await scrapeResponse.text();
      console.error("Firecrawl scrape error:", scrapeResponse.status, errData);
      return new Response(JSON.stringify({ error: "Failed to scrape the URL. Check that the URL is accessible." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scrapeData = await scrapeResponse.json();
    const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
    if (!markdown || markdown.length < 50) {
      return new Response(JSON.stringify({ error: "Scraped page had insufficient content. Try a different URL." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Scraped content length:", markdown.length);

    // Step 2: Feed to AI for extraction
    const today = new Date().toISOString().split("T")[0];
    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are a motorsport data extractor. Today's date is ${today}. Extract structured race results from the provided web page content.\n\nCRITICAL RULES:\n- Extract EVERY SINGLE entry/car/row from the results table. Do NOT summarize or skip entries.\n- Include ALL entries, not just the top finishers. If there are 60 cars, return 60 entries.\n- Do NOT use "TBD", "To Be Determined", or any placeholder values for driver names, teams, or positions.\n- If actual data is not available on the page, omit that entry entirely.\n- Only include entries with real driver names and real data.\n- Pay careful attention to tables, grids, and structured data on the page.`,
          },
          {
            role: "user",
            content: `Extract ALL race results from this page content. Make sure to include every single entry/car listed:\n\n${markdown.slice(0, 80000)}`,
          },
        ],
        tools: [raceResultsTool],
        tool_choice: { type: "function", function: { name: "submit_race_results" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "AI rate limit exceeded. Please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 401) return new Response(JSON.stringify({ error: "Invalid Groq API key. Check your GROQ_API_KEY secret." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await aiResponse.text();
      console.error("AI gateway error:", status, errText);
      return new Response(JSON.stringify({ error: "AI processing failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "AI did not return structured results" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    console.log("Extracted race data:", JSON.stringify(extracted).slice(0, 500));

    // Filter out TBD entries
    extracted.entries = (extracted.entries || []).filter((e: any) => {
      const names = e.driver_names || [];
      return names.length > 0 && !names.every((n: string) => /^(tbd|to be (determined|decided)|n\/a|unknown)$/i.test(n.trim()));
    });

    if (extracted.entries.length === 0) {
      return new Response(JSON.stringify({ error: "No valid race entries found on this page." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 3: Insert into database (same logic as generate-race-event)
    const { data: allDrivers } = await adminClient.from("driver_profiles").select("id, first_name, last_name");
    const driverMap = new Map<string, string>();
    for (const d of allDrivers || []) {
      driverMap.set(`${d.first_name.toLowerCase()} ${d.last_name.toLowerCase()}`, d.id);
    }

    const eventNameVal = extracted.event_name || "Imported Event";
    const seriesNameVal = extracted.series_name || "Unknown Series";
    const seasonYearVal = extracted.season_year || new Date().getFullYear();

    const { data: existingEvent } = await adminClient.from("race_events").select("id")
      .eq("event_name", eventNameVal).eq("series_name", seriesNameVal).eq("season_year", seasonYearVal).maybeSingle();

    let raceEvent: { id: string };
    if (existingEvent) {
      raceEvent = existingEvent;
    } else {
      const { data: newEvent, error: eventError } = await adminClient.from("race_events").insert({
        event_name: eventNameVal, series_name: seriesNameVal, season_year: seasonYearVal,
        category: extracted.category || "other", location: extracted.location || null, event_date: extracted.event_date || null,
      }).select("id").single();
      if (eventError || !newEvent) {
        console.error("Event insert error:", eventError);
        return new Response(JSON.stringify({ error: "Failed to create event", details: eventError?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      raceEvent = newEvent;
    }

    let matchedCount = 0, createdCount = 0;
    const createdDriverIds: string[] = [];

    for (const entry of extracted.entries) {
      const driverNames: string[] = entry.driver_names || [];
      const matchedDriverIds: string[] = [];

      for (const name of driverNames) {
        const normalized = name.trim().toLowerCase();
        const id = driverMap.get(normalized);
        if (id) { matchedDriverIds.push(id); matchedCount++; continue; }

        const parts = normalized.split(/\s+/);
        let found = false;
        if (parts.length >= 2) {
          const first = parts[0], last = parts[parts.length - 1];
          for (const [key, driverId] of driverMap.entries()) {
            const kParts = key.split(" ");
            if (kParts[0] === first && kParts[kParts.length - 1] === last) {
              matchedDriverIds.push(driverId); matchedCount++; found = true; break;
            }
          }
        }
        if (!found) {
          const nameParts = name.trim().split(/\s+/);
          const firstName = nameParts[0];
          const lastName = nameParts.slice(1).join(" ") || nameParts[0];
          const { data: newDriver } = await adminClient.from("driver_profiles")
            .insert({ first_name: firstName, last_name: lastName, is_claimed: false }).select("id").single();
          if (newDriver) {
            matchedDriverIds.push(newDriver.id); driverMap.set(normalized, newDriver.id);
            createdCount++; createdDriverIds.push(newDriver.id);
          }
        }
      }

      const { data: insertedEntry, error: entryError } = await adminClient.from("race_entries").insert({
        race_event_id: raceEvent.id, team_name: entry.team_name || null, car_number: entry.car_number || null,
        race_class: entry.race_class || null, finishing_position: entry.finishing_position ?? null,
        class_position: entry.class_position ?? null, laps_completed: entry.laps_completed ?? null,
        gap_to_leader: entry.gap_to_leader || null, gap_to_class_leader: entry.gap_to_class_leader || null,
        pit_stops: entry.pit_stops ?? null, status: entry.status || null, verification_status: "pending",
      }).select("id").single();

      if (entryError || !insertedEntry) { console.error("Entry insert error:", entryError); continue; }

      if (matchedDriverIds.length > 0) {
        const { error: juncError } = await adminClient.from("race_entry_drivers")
          .insert(matchedDriverIds.map((did) => ({ race_entry_id: insertedEntry.id, driver_profile_id: did })));
        if (juncError) console.error("Junction insert error:", juncError);
      }
    }

    // Auto-enrich newly created drivers
    if (createdDriverIds.length > 0) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/enrich-driver-profile`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
          body: JSON.stringify({ driverProfileIds: createdDriverIds }),
        });
      } catch (enrichErr) { console.error("Auto-enrich failed (non-blocking):", enrichErr); }
    }

    return new Response(JSON.stringify({
      success: true, eventId: raceEvent.id, eventName: eventNameVal, seriesName: seriesNameVal,
      seasonYear: seasonYearVal, entriesCount: extracted.entries.length,
      matchedDrivers: matchedCount, createdDrivers: createdCount,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("scrape-race-results error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
