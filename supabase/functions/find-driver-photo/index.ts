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
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY is not configured");

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
    const { driverProfileId, force } = body;
    if (!driverProfileId) {
      return new Response(JSON.stringify({ error: "driverProfileId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch profile
    const { data: profile } = await adminClient
      .from("driver_profiles")
      .select("*")
      .eq("id", driverProfileId)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.photo_url && !force) {
      return new Response(JSON.stringify({ success: true, message: "Photo already exists", photo_url: profile.photo_url }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fullName = `${profile.first_name} ${profile.last_name}`;
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

    if (!searchResponse.ok) {
      return new Response(JSON.stringify({ error: "Photo search failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const searchData = await searchResponse.json();
    const results = searchData.data || [];

    // Find an image URL from the search results
    let photoUrl: string | null = null;
    for (const result of results) {
      const url = result.url || "";
      if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) {
        photoUrl = url;
        break;
      }
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

    if (!photoUrl) {
      return new Response(JSON.stringify({ success: false, error: "No suitable photo found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download and upload
    const imgResponse = await fetch(photoUrl);
    if (!imgResponse.ok) {
      return new Response(JSON.stringify({ success: false, error: "Failed to download photo" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const imgBuffer = await imgResponse.arrayBuffer();
    const storagePath = `${driverProfileId}/photo.${ext}`;

    const { error: uploadError } = await adminClient.storage
      .from("driver-photos")
      .upload(storagePath, imgBuffer, { contentType, upsert: true });

    if (uploadError) {
      return new Response(JSON.stringify({ success: false, error: `Upload failed: ${uploadError.message}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = adminClient.storage
      .from("driver-photos")
      .getPublicUrl(storagePath);

    await adminClient
      .from("driver_profiles")
      .update({ photo_url: urlData.publicUrl })
      .eq("id", driverProfileId);

    console.log(`Photo uploaded for ${fullName}: ${urlData.publicUrl}`);

    return new Response(JSON.stringify({ success: true, photo_url: urlData.publicUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("find-driver-photo error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
