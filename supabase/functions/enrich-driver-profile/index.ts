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
    // AI helper: try Groq first, fall back to Lovable AI on 429
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
      const driverProfileIds: string[] = body.driverProfileIds
        ? body.driverProfileIds
        : body.driverProfileId
          ? [body.driverProfileId]
          : [];

      if (driverProfileIds.length === 0) {
      return new Response(JSON.stringify({ error: "driverProfileId or driverProfileIds required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const profileId of driverProfileIds) {
      // Fetch current profile
      const { data: profile } = await adminClient
        .from("driver_profiles")
        .select("*")
        .eq("id", profileId)
        .single();

      if (!profile) {
        results.push({ id: profileId, error: "Profile not found" });
        continue;
      }

      const fullName = `${profile.first_name} ${profile.last_name}`;

      // Call AI to research this driver using JSON mode (more reliable than tool calling)
      const aiResponse = await callAI({
        messages: [
          {
            role: "system",
            content: `You are a motorsport research assistant with extensive knowledge of racing drivers worldwide. Given a racing driver's name, return ONLY a JSON object with the following fields. Do NOT include any text outside the JSON object.

Fields:
- "nationality": string or null (e.g. "Danish", "British", "Brazilian")
- "bio": string or null (2-3 sentence biography of their racing career)
- "date_of_birth": string or null (ISO format YYYY-MM-DD)
- "primary_category": one of "karting", "single_seater", "gt", "touring_car", "sports_car", "rally", "endurance", "formula", "stock_car", "other", or null
- "social_website": string or null (personal website URL)
- "social_instagram": string or null (Instagram URL)
- "social_twitter": string or null (Twitter/X URL)
- "social_linkedin": string or null (LinkedIn URL)

IMPORTANT RULES:
- Try your hardest to find information. Use context clues from the driver's name (e.g. surname origin) to infer nationality.
- Every racing driver should at minimum have a nationality and a short bio. If the driver has raced in any known series, describe it.
- If a driver's name suggests a particular origin (e.g. Italian surname, Japanese name), provide your best estimate for nationality.
- Write a bio even for lesser-known drivers based on whatever you know or can reasonably infer about their racing activity.
- For fields you truly cannot determine, use JSON null (not the string "null").
- NEVER return the string "null" — always use actual JSON null.`,
          },
          {
            role: "user",
            content: `Research the racing driver "${fullName}". Provide as much information as you can find.`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4096,
      });

      if (!aiResponse.ok) {
        results.push({ id: profileId, name: fullName, error: "AI call failed" });
        continue;
      }

      const aiData = await aiResponse.json();
      const rawContent = aiData.choices?.[0]?.message?.content;
      if (!rawContent) {
        results.push({ id: profileId, name: fullName, error: "AI returned no data" });
        continue;
      }

      let enriched: any;
      try {
        enriched = JSON.parse(rawContent);
      } catch {
        results.push({ id: profileId, name: fullName, error: "AI returned invalid JSON" });
        continue;
      }

      // Sanitize string "null" values that AI sometimes returns
      for (const key of Object.keys(enriched)) {
        if (typeof enriched[key] === "string" &&
            ["null", "unknown", "n/a", "none", ""].includes(enriched[key].toLowerCase().trim())) {
          enriched[key] = null;
        }
      }

      console.log(`Enriched ${fullName}:`, JSON.stringify(enriched));

      // Update fields: if force, overwrite all; otherwise only empty/null fields
      const updates: Record<string, any> = {};
      if ((force || !profile.nationality) && enriched.nationality) updates.nationality = enriched.nationality;
      if ((force || !profile.bio) && enriched.bio) updates.bio = enriched.bio;
      if ((force || !profile.date_of_birth) && enriched.date_of_birth) updates.date_of_birth = enriched.date_of_birth;
      if ((force || !profile.primary_category || profile.primary_category === "other") && enriched.primary_category && enriched.primary_category !== "other") {
        updates.primary_category = enriched.primary_category;
      }
      if ((force || !profile.social_website) && enriched.social_website) updates.social_website = enriched.social_website;
      if ((force || !profile.social_instagram) && enriched.social_instagram) updates.social_instagram = enriched.social_instagram;
      if ((force || !profile.social_twitter) && enriched.social_twitter) updates.social_twitter = enriched.social_twitter;
      if ((force || !profile.social_linkedin) && enriched.social_linkedin) updates.social_linkedin = enriched.social_linkedin;

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await adminClient
          .from("driver_profiles")
          .update(updates)
          .eq("id", profileId);

        if (updateError) {
          results.push({ id: profileId, name: fullName, error: updateError.message });
          continue;
        }
      }

      results.push({
        id: profileId,
        name: fullName,
        fieldsUpdated: Object.keys(updates),
        enrichedData: enriched,
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("enrich-driver-profile error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
