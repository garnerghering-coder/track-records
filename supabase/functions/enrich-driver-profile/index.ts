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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

      // Call AI to research this driver
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: "You are a motorsport research assistant. Given a racing driver's name, research and return factual information about them. Only return data you are confident about. If unsure about a field, return null for it.",
            },
            {
              role: "user",
              content: `Research the racing driver "${fullName}". Return their nationality, a brief 2-3 sentence bio about their racing career, date of birth, primary racing category, and any known social media or website URLs.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "submit_driver_info",
                description: "Submit researched driver profile information",
                parameters: {
                  type: "object",
                  properties: {
                    nationality: {
                      type: ["string", "null"],
                      description: "Driver's nationality, e.g. 'Danish', 'British', 'Brazilian'",
                    },
                    bio: {
                      type: ["string", "null"],
                      description: "2-3 sentence biography of the driver's racing career",
                    },
                    date_of_birth: {
                      type: ["string", "null"],
                      description: "ISO date string (YYYY-MM-DD) or null if unknown",
                    },
                    primary_category: {
                      type: ["string", "null"],
                      enum: [
                        "karting", "single_seater", "gt", "touring_car", "sports_car",
                        "rally", "endurance", "formula", "stock_car", "other", null,
                      ],
                      description: "Primary racing category",
                    },
                    social_website: { type: ["string", "null"], description: "Personal website URL" },
                    social_instagram: { type: ["string", "null"], description: "Instagram URL" },
                    social_twitter: { type: ["string", "null"], description: "Twitter/X URL" },
                    social_linkedin: { type: ["string", "null"], description: "LinkedIn URL" },
                  },
                  required: ["nationality", "bio", "date_of_birth", "primary_category"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "submit_driver_info" } },
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429) {
          results.push({ id: profileId, name: fullName, error: "Rate limited" });
          continue;
        }
        if (status === 402) {
          results.push({ id: profileId, name: fullName, error: "Credits exhausted" });
          continue;
        }
        results.push({ id: profileId, name: fullName, error: "AI call failed" });
        continue;
      }

      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        results.push({ id: profileId, name: fullName, error: "AI returned no data" });
        continue;
      }

      const enriched = JSON.parse(toolCall.function.arguments);
      console.log(`Enriched ${fullName}:`, JSON.stringify(enriched));

      // Only update fields that are currently empty/null
      const updates: Record<string, any> = {};
      if (!profile.nationality && enriched.nationality) updates.nationality = enriched.nationality;
      if (!profile.bio && enriched.bio) updates.bio = enriched.bio;
      if (!profile.date_of_birth && enriched.date_of_birth) updates.date_of_birth = enriched.date_of_birth;
      if ((!profile.primary_category || profile.primary_category === "other") && enriched.primary_category && enriched.primary_category !== "other") {
        updates.primary_category = enriched.primary_category;
      }
      if (!profile.social_website && enriched.social_website) updates.social_website = enriched.social_website;
      if (!profile.social_instagram && enriched.social_instagram) updates.social_instagram = enriched.social_instagram;
      if (!profile.social_twitter && enriched.social_twitter) updates.social_twitter = enriched.social_twitter;
      if (!profile.social_linkedin && enriched.social_linkedin) updates.social_linkedin = enriched.social_linkedin;

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
