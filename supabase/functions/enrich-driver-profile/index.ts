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
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

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
      const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: `You are a motorsport research assistant. Given a racing driver's name, return ONLY a JSON object with the following fields. Do NOT include any text outside the JSON object.

Fields:
- "nationality": string or null (e.g. "Danish", "British", "Brazilian")
- "bio": string or null (2-3 sentence biography of their racing career)
- "date_of_birth": string or null (ISO format YYYY-MM-DD)
- "primary_category": one of "karting", "single_seater", "gt", "touring_car", "sports_car", "rally", "endurance", "formula", "stock_car", "other", or null
- "social_website": string or null (personal website URL)
- "social_instagram": string or null (Instagram URL)
- "social_twitter": string or null (Twitter/X URL)
- "social_linkedin": string or null (LinkedIn URL)

Only return data you are confident about. If unsure about a field, set it to null.`,
            },
            {
              role: "user",
              content: `Research the racing driver "${fullName}".`,
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 2048,
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429) {
          results.push({ id: profileId, name: fullName, error: "Rate limited" });
          continue;
        }
        if (status === 401) {
          results.push({ id: profileId, name: fullName, error: "Invalid API key" });
          continue;
        }
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

      // Search for a real photo if the driver doesn't have one (or force is set)
      if (force || !profile.photo_url) {
        const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
        if (FIRECRAWL_API_KEY) {
          try {
            const searchQuery = `${fullName} racing driver portrait photo`;
            console.log(`Searching for photo: ${searchQuery}`);
            const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                query: searchQuery,
                limit: 5,
                scrapeOptions: { formats: ["links"] },
              }),
            });

            if (searchResponse.ok) {
              const searchData = await searchResponse.json();
              const results = searchData.data || [];

              // Try to find an image URL from the search results
              let photoUrl: string | null = null;
              for (const result of results) {
                const url = result.url || "";
                // Check if the result URL itself is an image
                if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) {
                  photoUrl = url;
                  break;
                }
                // Check links array for image URLs
                const links: string[] = result.links || [];
                const imgLink = links.find((l: string) =>
                  /\.(jpg|jpeg|png|webp)(\?|$)/i.test(l) &&
                  (l.toLowerCase().includes(profile.last_name.toLowerCase()) || l.toLowerCase().includes("portrait") || l.toLowerCase().includes("headshot") || l.toLowerCase().includes("photo"))
                );
                if (imgLink) {
                  photoUrl = imgLink;
                  break;
                }
              }

              if (photoUrl) {
                // Download the image and upload to storage
                try {
                  const imgResponse = await fetch(photoUrl);
                  if (imgResponse.ok) {
                    const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
                    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
                    const imgBuffer = await imgResponse.arrayBuffer();
                    const storagePath = `${profileId}/photo.${ext}`;

                    const { error: uploadError } = await adminClient.storage
                      .from("driver-photos")
                      .upload(storagePath, imgBuffer, { contentType, upsert: true });

                    if (!uploadError) {
                      const { data: urlData } = adminClient.storage
                        .from("driver-photos")
                        .getPublicUrl(storagePath);
                      updates.photo_url = urlData.publicUrl;
                      console.log(`Photo uploaded for ${fullName}: ${updates.photo_url}`);
                    } else {
                      console.error(`Photo upload failed for ${fullName}:`, uploadError.message);
                    }
                  }
                } catch (imgErr) {
                  console.error(`Failed to download photo for ${fullName}:`, imgErr);
                }
              } else {
                console.log(`No suitable photo found for ${fullName}`);
              }
            }
          } catch (searchErr) {
            console.error(`Photo search failed for ${fullName}:`, searchErr);
          }
        }
      }

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
