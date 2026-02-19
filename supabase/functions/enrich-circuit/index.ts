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
    const circuitIds: string[] = body.circuitIds
      ? body.circuitIds
      : body.circuitId
        ? [body.circuitId]
        : [];

    if (circuitIds.length === 0) {
      return new Response(JSON.stringify({ error: "circuitId or circuitIds required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const circuitId of circuitIds) {
      const { data: circuit } = await adminClient
        .from("circuits")
        .select("*")
        .eq("id", circuitId)
        .single();

      if (!circuit) {
        results.push({ id: circuitId, error: "Circuit not found" });
        continue;
      }

      const aiResponse = await callAI({
        messages: [
          {
            role: "system",
            content: `You are a motorsport research assistant with extensive knowledge of racing circuits worldwide. Given a racing circuit's name, return ONLY a JSON object with the following fields. Do NOT include any text outside the JSON object.

Fields:
- "corrected_name": string or null (the circuit's correct/official name if the stored name has typos or is informal, e.g. "Long Beach" should become "Long Beach Street Circuit")
- "country": string or null (e.g. "United States", "United Kingdom", "Italy")
- "location": string or null (city/region, e.g. "Long Beach, California" or "Silverstone, Northamptonshire")
- "description": string or null (2-4 sentence description of the circuit, its history, and what series race there)
- "length_km": number or null (track length in kilometers)
- "turns": number or null (number of corners/turns)
- "website": string or null (official circuit website URL)
- "image_url": string or null (URL to a circuit map/layout image if you know one — prefer SVG or PNG from Wikipedia or official sources)

IMPORTANT RULES:
- Try your hardest to find information. Most racing circuits are well-documented.
- Every circuit should at minimum have a country, location, and description.
- For the image_url, try to find the official circuit layout/map image. Look for Wikipedia circuit layout images.
- For fields you truly cannot determine, use JSON null (not the string "null").
- NEVER return the string "null" — always use actual JSON null.`,
          },
          {
            role: "user",
            content: `Research the racing circuit "${circuit.name}"${circuit.country ? ` in ${circuit.country}` : ""}${circuit.location ? ` (${circuit.location})` : ""}. Provide as much information as you can find.`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4096,
      });

      if (!aiResponse.ok) {
        results.push({ id: circuitId, name: circuit.name, error: "AI call failed" });
        continue;
      }

      const aiData = await aiResponse.json();
      const rawContent = aiData.choices?.[0]?.message?.content;
      if (!rawContent) {
        results.push({ id: circuitId, name: circuit.name, error: "AI returned no data" });
        continue;
      }

      let enriched: any;
      try {
        enriched = JSON.parse(rawContent);
      } catch {
        results.push({ id: circuitId, name: circuit.name, error: "AI returned invalid JSON" });
        continue;
      }

      // Sanitize string "null" values
      for (const key of Object.keys(enriched)) {
        if (typeof enriched[key] === "string" &&
            ["null", "unknown", "n/a", "none", ""].includes(enriched[key].toLowerCase().trim())) {
          enriched[key] = null;
        }
      }

      console.log(`Enriched circuit ${circuit.name}:`, JSON.stringify(enriched));

      const updates: Record<string, any> = {};
      if ((force || !circuit.country) && enriched.country) updates.country = enriched.country;
      if ((force || !circuit.location) && enriched.location) updates.location = enriched.location;
      if ((force || !circuit.description) && enriched.description) updates.description = enriched.description;
      if ((force || !circuit.length_km) && enriched.length_km) updates.length_km = enriched.length_km;
      if ((force || !circuit.turns) && enriched.turns) updates.turns = enriched.turns;
      if ((force || !circuit.website) && enriched.website) updates.website = enriched.website;
      if ((force || !circuit.image_url) && enriched.image_url) updates.image_url = enriched.image_url;

      // Fix circuit name if corrected
      if (enriched.corrected_name && enriched.corrected_name !== circuit.name && force) {
        updates.name = enriched.corrected_name;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await adminClient
          .from("circuits")
          .update(updates)
          .eq("id", circuitId);

        if (updateError) {
          results.push({ id: circuitId, name: circuit.name, error: updateError.message });
          continue;
        }
      }

      results.push({
        id: circuitId,
        name: circuit.name,
        fieldsUpdated: Object.keys(updates),
        enrichedData: enriched,
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("enrich-circuit error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
