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
    description: "Submit the researched race results as structured data",
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
              driver_names: { type: "array", items: { type: "string" }, description: "Full name(s) of driver(s) for this entry" },
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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

    const { eventName } = await req.json();
    if (!eventName || typeof eventName !== "string" || eventName.trim().length < 3) {
      return new Response(JSON.stringify({ error: "eventName is required (min 3 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Web Search Step: try Firecrawl search for fresh data ──
    let webContext = "";
    if (FIRECRAWL_API_KEY) {
      try {
        console.log("Searching web for:", eventName.trim());
        const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `${eventName.trim()} race results`,
            limit: 3,
            scrapeOptions: { formats: ["markdown"] },
          }),
        });

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          const results = searchData.data || searchData.results || [];
          if (results.length > 0) {
            // Combine markdown from top results
            const combined = results
              .map((r: any) => r.markdown || "")
              .filter((m: string) => m.length > 50)
              .slice(0, 2)
              .join("\n\n---\n\n");
            if (combined.length > 100) {
              webContext = combined.slice(0, 40000);
              console.log("Found web context, length:", webContext.length);
            }
          }
        } else {
          console.log("Firecrawl search returned status:", searchResponse.status);
        }
      } catch (searchErr) {
        console.error("Firecrawl search failed (non-blocking):", searchErr);
      }
    }

    // ── AI Call ──
    const today = new Date().toISOString().split("T")[0];
    let systemPrompt = `You are a motorsport data researcher. Today's date is ${today}. Given a race event name, research and return the complete results including all entries with driver names, finishing positions, teams, car numbers, classes, gaps, laps, and status. Be as thorough and accurate as possible. Include all entries in the race, not just the top finishers. If the event has multiple classes, include class positions too.

CRITICAL RULES:
- Do NOT use "TBD", "To Be Determined", "To Be Decided", or any placeholder values.
- Every entry MUST have real driver names, not placeholders.
- If you do not have real results data for this event, return an empty entries array rather than fabricated or placeholder data.
- Only return data you are confident is accurate.`;

    let userPrompt = `Research the race event "${eventName.trim()}". Return the full race results with all entries.`;

    if (webContext) {
      userPrompt = `Research the race event "${eventName.trim()}". Here is data scraped from relevant results pages:\n\n${webContext}\n\nExtract the complete structured race results from this data. Include ALL entries.`;
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        tools: [raceResultsTool],
        tool_choice: { type: "function", function: { name: "submit_race_results" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "AI rate limit exceeded. Please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    console.log("Generated race data:", JSON.stringify(extracted).slice(0, 500));

    // Filter out TBD/placeholder entries
    extracted.entries = (extracted.entries || []).filter((e: any) => {
      const names = e.driver_names || [];
      return names.length > 0 && !names.every((n: string) => /^(tbd|to be (determined|decided)|n\/a|unknown|scheduled)$/i.test(n.trim()));
    });

    if (extracted.entries.length === 0) {
      return new Response(JSON.stringify({
        error: "No valid race results found. The AI could not find real results for this event. Try a more specific name or use 'Import from URL' with a direct results page link.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Database insertion ──
    const { data: allDrivers } = await adminClient.from("driver_profiles").select("id, first_name, last_name");
    const driverMap = new Map<string, string>();
    for (const d of allDrivers || []) {
      driverMap.set(`${d.first_name.toLowerCase()} ${d.last_name.toLowerCase()}`, d.id);
    }

    const eventNameVal = extracted.event_name || eventName.trim();
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
      success: true, eventId: raceEvent.id, eventName: extracted.event_name, seriesName: extracted.series_name,
      seasonYear: extracted.season_year, entriesCount: extracted.entries.length,
      matchedDrivers: matchedCount, createdDrivers: createdCount, webSearchUsed: webContext.length > 0,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("generate-race-event error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
