import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/call-ai.ts";

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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify authenticated user
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

    const { eventName, seriesName, seasonYear, eventDate, category, location, rawData } = await req.json();

    if (!rawData || rawData.trim().length < 10) {
      return new Response(JSON.stringify({ error: "Results data is too short (min 10 characters)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse with AI
    const aiResponse = await callAI({
      max_tokens: 16384,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a motorsport results data extractor. Parse the raw race results text and return structured data.

Return JSON: {
  "entries": [{
    "finishing_position": number or null,
    "class_position": number or null,
    "car_number": "string or null",
    "team_name": "string or null",
    "driver_names": ["array of full driver name strings"],
    "race_class": "string or null",
    "laps_completed": number or null,
    "gap_to_leader": "string or null",
    "status": "string or null"
  }]
}

Rules:
- Extract EVERY entry from the results
- Use full driver names, expand abbreviations
- Be precise with positions, car numbers, teams`,
        },
        {
          role: "user",
          content: `Series: ${seriesName || "Unknown"}\nEvent: ${eventName || "Unknown"}\nYear: ${seasonYear || "Unknown"}\n\nRaw results:\n${rawData}`,
        },
      ],
    });

    if (!aiResponse.ok) {
      console.error("AI error:", await aiResponse.text());
      return new Response(JSON.stringify({ error: "AI processing failed" }), {
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

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      return new Response(JSON.stringify({ error: "AI returned invalid JSON" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store in community_submissions
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: submission, error: insertError } = await adminClient
      .from("community_submissions")
      .insert({
        submitted_by: userId,
        event_name: eventName || "Unknown Event",
        series_name: seriesName || "Unknown Series",
        season_year: parseInt(seasonYear) || new Date().getFullYear(),
        event_date: eventDate || null,
        category: category || "other",
        location: location || null,
        raw_data: rawData,
        parsed_entries: parsed,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save submission" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      submissionId: submission.id,
      entriesCount: (parsed.entries || []).length,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("parse-submission error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
