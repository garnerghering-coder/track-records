import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import pdf from "npm:pdf-parse/lib/pdf-parse.js";

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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // Check admin role
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { rawText: rawTextInput, pdfBase64, eventHint, seriesHint } = await req.json();

    let rawText = rawTextInput;

    // If PDF was uploaded, extract text from it
    if (pdfBase64 && typeof pdfBase64 === "string") {
      try {
        const pdfBuffer = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
        const pdfData = await pdf(pdfBuffer);
        rawText = pdfData.text;
        console.log(`Extracted ${rawText.length} chars from PDF (${pdfData.numpages} pages)`);
      } catch (pdfErr) {
        console.error("PDF parse error:", pdfErr);
        return new Response(JSON.stringify({ error: "Failed to parse PDF file. Make sure it's a valid PDF." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!rawText || typeof rawText !== "string" || rawText.trim().length < 10) {
      return new Response(JSON.stringify({ error: "rawText or pdfBase64 is required (min 10 chars)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Lovable AI with tool calling to extract structured data
    const systemPrompt = `You are a motorsport results data extractor with deep motorsport domain knowledge. You receive raw race results text (from timing sheets, websites, PDFs, etc.) and extract structured data. Be precise with driver names, positions, car numbers, teams, and classes. If information is missing, use null. Always try to determine the event name, series, year, and location from context.

MOTORSPORT INTELLIGENCE RULES:
- Use your knowledge of motorsport to infer and correct data. For example:
  - Car #31 Cadillac V-Series.R in IMSA = Whelen Engineering Racing / Action Express Racing
  - Car #10 Acura ARX-06 = Wayne Taylor Racing
  - A "Cadillac LMDh" or "Porsche 963" implies GTP class in IMSA
  - "Ferrari 296 GT3" implies GTD or GTD Pro class
- Normalize team names to their official forms (e.g. "AXR" → "Action Express Racing", "WTR" → "Wayne Taylor Racing")
- Infer race class from car type, team, and context when not explicitly stated
- Correct common abbreviations and shorthand in driver names and team names
- If a car manufacturer is listed but not a team, use your knowledge to fill in the team name
${eventHint ? `- Event hint: ${eventHint}` : ""}${seriesHint ? `- Series hint: ${seriesHint}` : ""}

You MUST respond with ONLY a valid JSON object (no markdown, no explanation) matching this exact schema:
{
  "event_name": "string",
  "series_name": "string",
  "season_year": number,
  "location": "string or null",
  "category": "one of: karting, single_seater, gt, touring_car, sports_car, rally, endurance, formula, stock_car, other, or null",
  "entries": [
    {
      "finishing_position": number or null,
      "class_position": number or null,
      "car_number": "string or null",
      "team_name": "string or null",
      "driver_names": ["array of full driver name strings"],
      "race_class": "string or null",
      "laps_completed": number or null,
      "gap_to_leader": "string or null",
      "gap_to_class_leader": "string or null",
      "pit_stops": number or null,
      "status": "string or null (e.g. Finished, DNF, DNS, DSQ)"
    }
  ]
}`;

    const aiResponse = await callAI({
      max_tokens: 16384,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extract the race results from this text:\n\n${rawText}` },
      ],
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI processing failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const finishReason = aiData.choices?.[0]?.finish_reason;
    const rawContent = aiData.choices?.[0]?.message?.content;
    if (!rawContent) {
      console.error("No content in AI response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "AI did not return structured results" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (finishReason === "length") {
      console.error("AI response truncated (finish_reason=length)");
      return new Response(JSON.stringify({ error: "The results are too large for a single import. Try splitting into smaller chunks (e.g. by class or by top-20)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let extracted;
    try {
      extracted = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error("Failed to parse AI JSON:", rawContent.substring(0, 500));
      return new Response(JSON.stringify({ error: "AI returned invalid JSON. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("Extracted data:", JSON.stringify(extracted));

    // Fetch all driver profiles for matching
    const { data: allDrivers } = await adminClient
      .from("driver_profiles")
      .select("id, first_name, last_name");

    const driverMap = new Map<string, string>(); // "firstname lastname" -> id
    for (const d of allDrivers || []) {
      driverMap.set(`${d.first_name.toLowerCase()} ${d.last_name.toLowerCase()}`, d.id);
    }

    // Check for existing event with same name, series, and year
    const eventNameVal = extracted.event_name || eventHint || "Unknown Event";
    const seriesNameVal = extracted.series_name || seriesHint || "Unknown Series";
    const seasonYearVal = extracted.season_year || new Date().getFullYear();

    const { data: existingEvent } = await adminClient
      .from("race_events")
      .select("id")
      .eq("event_name", eventNameVal)
      .eq("series_name", seriesNameVal)
      .eq("season_year", seasonYearVal)
      .maybeSingle();

    let raceEvent: { id: string };
    if (existingEvent) {
      raceEvent = existingEvent;
      console.log("Using existing event:", raceEvent.id);
    } else {
      const { data: newEvent, error: eventError } = await adminClient
        .from("race_events")
        .insert({
          event_name: eventNameVal,
          series_name: seriesNameVal,
          season_year: seasonYearVal,
          category: extracted.category || "other",
          location: extracted.location || null,
        })
        .select("id")
        .single();

      if (eventError || !newEvent) {
        console.error("Event insert error:", eventError);
        return new Response(JSON.stringify({ error: "Failed to create event", details: eventError?.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      raceEvent = newEvent;
    }

    let matchedCount = 0;
    let unmatchedCount = 0;
    const unmatchedNames: string[] = [];
    let createdCount = 0;
    const createdNames: string[] = [];

    // Insert entries one by one to link drivers
    for (const entry of extracted.entries || []) {
      const driverNames: string[] = entry.driver_names || [];

      // Build notes with unmatched driver names
      const matchedDriverIds: string[] = [];
      const unmatchedForEntry: string[] = [];

      for (const name of driverNames) {
        const normalized = name.trim().toLowerCase();
        const id = driverMap.get(normalized);
        if (id) {
          matchedDriverIds.push(id);
          matchedCount++;
        } else {
          // Try partial match: split name and match first+last
          const parts = normalized.split(/\s+/);
          let found = false;
          if (parts.length >= 2) {
            const first = parts[0];
            const last = parts[parts.length - 1];
            for (const [key, driverId] of driverMap.entries()) {
              const [df, dl] = key.split(" ");
              if (df === first && dl === last) {
                matchedDriverIds.push(driverId);
                matchedCount++;
                found = true;
                break;
              }
            }
          }
          if (!found) {
            // Auto-create a new driver profile
            const nameParts = name.trim().split(/\s+/);
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(" ") || nameParts[0];

            const { data: newDriver } = await adminClient
              .from("driver_profiles")
              .insert({ first_name: firstName, last_name: lastName, is_claimed: false })
              .select("id")
              .single();

            if (newDriver) {
              matchedDriverIds.push(newDriver.id);
              driverMap.set(normalized, newDriver.id);
              createdCount++;
              createdNames.push(name);
            } else {
              unmatchedForEntry.push(name);
              unmatchedCount++;
              unmatchedNames.push(name);
            }
          }
        }
      }

      const entryNotes = unmatchedForEntry.length > 0
        ? `Unmatched drivers: ${unmatchedForEntry.join(", ")}`
        : null;

      const { data: insertedEntry, error: entryError } = await adminClient
        .from("race_entries")
        .insert({
          race_event_id: raceEvent.id,
          team_name: entry.team_name || null,
          car_number: entry.car_number || null,
          race_class: entry.race_class || null,
          finishing_position: entry.finishing_position ?? null,
          class_position: entry.class_position ?? null,
          laps_completed: entry.laps_completed ?? null,
          gap_to_leader: entry.gap_to_leader || null,
          gap_to_class_leader: entry.gap_to_class_leader || null,
          pit_stops: entry.pit_stops ?? null,
          status: entry.status || null,
          notes: entryNotes,
          verification_status: "pending",
        })
        .select("id")
        .single();

      if (entryError || !insertedEntry) {
        console.error("Entry insert error:", entryError);
        continue;
      }

      // Link matched drivers
      if (matchedDriverIds.length > 0) {
        const { error: juncError } = await adminClient
          .from("race_entry_drivers")
          .insert(matchedDriverIds.map((did) => ({
            race_entry_id: insertedEntry.id,
            driver_profile_id: did,
          })));
        if (juncError) console.error("Junction insert error:", juncError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        eventId: raceEvent.id,
        eventName: extracted.event_name,
        entriesCount: (extracted.entries || []).length,
        matchedDrivers: matchedCount,
        unmatchedDrivers: unmatchedCount,
        unmatchedNames,
        createdDrivers: createdCount,
        createdNames,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("import-race-results error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
