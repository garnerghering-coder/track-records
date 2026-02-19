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
    const teamProfileIds: string[] = body.teamProfileIds
      ? body.teamProfileIds
      : body.teamProfileId
        ? [body.teamProfileId]
        : [];

    if (teamProfileIds.length === 0) {
      return new Response(JSON.stringify({ error: "teamProfileId or teamProfileIds required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const profileId of teamProfileIds) {
      const { data: profile } = await adminClient
        .from("team_profiles")
        .select("*")
        .eq("id", profileId)
        .single();

      if (!profile) {
        results.push({ id: profileId, error: "Profile not found" });
        continue;
      }

      const aiResponse = await callAI({
        messages: [
          {
            role: "system",
            content: `You are a motorsport research assistant with extensive knowledge of racing teams worldwide. Given a racing team's name, return ONLY a JSON object with the following fields. Do NOT include any text outside the JSON object.

Fields:
- "corrected_name": string or null (the team's correct/official name if the stored name has typos or is informal)
- "nationality": string or null (e.g. "Italian", "British", "American")
- "bio": string or null (2-3 sentence description of the team, their history, and what series they compete in)
- "primary_category": one of "karting", "single_seater", "gt", "touring_car", "sports_car", "rally", "endurance", "formula", "stock_car", "other", or null
- "website": string or null (official team website URL)
- "social_instagram": string or null (Instagram URL — store as field for future use)
- "social_twitter": string or null (Twitter/X URL — store as field for future use)

IMPORTANT RULES:
- Try your hardest to find information. Many teams are well-known in motorsport.
- Every racing team should at minimum have a nationality and a short bio.
- If a team's name suggests a particular origin, provide your best estimate for nationality.
- For fields you truly cannot determine, use JSON null (not the string "null").
- NEVER return the string "null" — always use actual JSON null.`,
          },
          {
            role: "user",
            content: `Research the racing team "${profile.name}". Provide as much information as you can find.`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4096,
      });

      if (!aiResponse.ok) {
        results.push({ id: profileId, name: profile.name, error: "AI call failed" });
        continue;
      }

      const aiData = await aiResponse.json();
      const rawContent = aiData.choices?.[0]?.message?.content;
      if (!rawContent) {
        results.push({ id: profileId, name: profile.name, error: "AI returned no data" });
        continue;
      }

      let enriched: any;
      try {
        enriched = JSON.parse(rawContent);
      } catch {
        results.push({ id: profileId, name: profile.name, error: "AI returned invalid JSON" });
        continue;
      }

      // Sanitize string "null" values
      for (const key of Object.keys(enriched)) {
        if (typeof enriched[key] === "string" &&
            ["null", "unknown", "n/a", "none", ""].includes(enriched[key].toLowerCase().trim())) {
          enriched[key] = null;
        }
      }

      console.log(`Enriched team ${profile.name}:`, JSON.stringify(enriched));

      const updates: Record<string, any> = {};
      if ((force || !profile.nationality) && enriched.nationality) updates.nationality = enriched.nationality;
      if ((force || !profile.bio) && enriched.bio) updates.bio = enriched.bio;
      if ((force || !profile.primary_category) && enriched.primary_category && enriched.primary_category !== "other") {
        updates.primary_category = enriched.primary_category;
      }
      if ((force || !profile.website) && enriched.website) updates.website = enriched.website;

      // Fix team name if corrected
      if (enriched.corrected_name && enriched.corrected_name !== profile.name) {
        if (force) {
          updates.name = enriched.corrected_name;
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await adminClient
          .from("team_profiles")
          .update(updates)
          .eq("id", profileId);

        if (updateError) {
          results.push({ id: profileId, name: profile.name, error: updateError.message });
          continue;
        }
      }

      results.push({
        id: profileId,
        name: profile.name,
        fieldsUpdated: Object.keys(updates),
        enrichedData: enriched,
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("enrich-team-profile error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
