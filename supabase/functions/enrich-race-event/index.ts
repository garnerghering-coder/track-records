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

    const body = await req.json();
    const force = body.force === true;
    const eventIds: string[] = body.eventIds
      ? body.eventIds
      : body.eventId
        ? [body.eventId]
        : [];

    if (eventIds.length === 0) {
      return new Response(JSON.stringify({ error: "eventId or eventIds required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const eventId of eventIds) {
      const { data: event } = await adminClient
        .from("race_events")
        .select("*")
        .eq("id", eventId)
        .single();

      if (!event) {
        results.push({ id: eventId, error: "Event not found" });
        continue;
      }

      const aiResponse = await callAI({
        messages: [
          {
            role: "system",
            content: `You are a motorsport research assistant. Given a race event's name and series, return ONLY a JSON object with the following fields. Do NOT include any text outside the JSON object.

Fields:
- "corrected_event_name": string or null (the event's correct/official name if the stored name has typos or is informal)
- "corrected_series_name": string or null (the series' correct/official name)
- "location": string or null (where the event took place, e.g. "Spa-Francorchamps, Belgium")
- "event_date": string or null (ISO date YYYY-MM-DD if you know it)
- "category": one of "karting", "single_seater", "gt", "touring_car", "sports_car", "rally", "endurance", "formula", "stock_car", "other", or null
- "notes": string or null (1-2 sentence description of notable things about this specific event, e.g. weather conditions, notable incidents, record-breaking performances)

IMPORTANT RULES:
- Try your hardest to find information about this specific event.
- For fields you truly cannot determine, use JSON null (not the string "null").
- NEVER return the string "null" — always use actual JSON null.`,
          },
          {
            role: "user",
            content: `Research the race event "${event.event_name}" from the "${event.series_name}" series, season ${event.season_year}${event.location ? `, held at ${event.location}` : ""}.`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4096,
      });

      if (!aiResponse.ok) {
        results.push({ id: eventId, name: event.event_name, error: "AI call failed" });
        continue;
      }

      const aiData = await aiResponse.json();
      const rawContent = aiData.choices?.[0]?.message?.content;
      if (!rawContent) {
        results.push({ id: eventId, name: event.event_name, error: "AI returned no data" });
        continue;
      }

      let enriched: any;
      try {
        enriched = JSON.parse(rawContent);
      } catch {
        results.push({ id: eventId, name: event.event_name, error: "AI returned invalid JSON" });
        continue;
      }

      for (const key of Object.keys(enriched)) {
        if (typeof enriched[key] === "string" &&
            ["null", "unknown", "n/a", "none", ""].includes(enriched[key].toLowerCase().trim())) {
          enriched[key] = null;
        }
      }

      console.log(`Enriched event ${event.event_name}:`, JSON.stringify(enriched));

      const updates: Record<string, any> = {};
      if ((force || !event.location) && enriched.location) updates.location = enriched.location;
      if ((force || !event.event_date) && enriched.event_date) updates.event_date = enriched.event_date;
      if ((force || !event.category) && enriched.category && enriched.category !== "other") updates.category = enriched.category;
      if ((force || !event.notes) && enriched.notes) updates.notes = enriched.notes;

      if (force && enriched.corrected_event_name && enriched.corrected_event_name !== event.event_name) {
        updates.event_name = enriched.corrected_event_name;
      }
      if (force && enriched.corrected_series_name && enriched.corrected_series_name !== event.series_name) {
        updates.series_name = enriched.corrected_series_name;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await adminClient
          .from("race_events")
          .update(updates)
          .eq("id", eventId);

        if (updateError) {
          results.push({ id: eventId, name: event.event_name, error: updateError.message });
          continue;
        }
      }

      results.push({
        id: eventId,
        name: event.event_name,
        fieldsUpdated: Object.keys(updates),
        enrichedData: enriched,
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("enrich-race-event error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
