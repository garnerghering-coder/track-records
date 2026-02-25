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

    // Fetch drivers missing nationality, date_of_birth, or with old-format nationality (no comma = no hometown)
    const { data: drivers, error: fetchErr } = await adminClient
      .from("v2_drivers")
      .select("id, full_name, nationality, date_of_birth")
      .or("nationality.is.null,date_of_birth.is.null,nationality.not.ilike.%,%")
      .order("full_name")
      .limit(50);

    if (fetchErr) throw fetchErr;
    if (!drivers || drivers.length === 0) {
      return new Response(JSON.stringify({ success: true, enriched: 0, message: "No drivers need enrichment" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build a batch prompt for efficiency
    const driverList = drivers.map(d => ({
      id: d.id,
      name: d.full_name,
      current_nationality: d.nationality || null,
      missing: [
        !d.nationality ? "nationality" : (d.nationality && !d.nationality.includes(",") ? "hometown_upgrade" : null),
        !d.date_of_birth ? "date_of_birth" : null,
      ].filter(Boolean),
    }));

    const aiResponse = await callAI({
      messages: [
        {
          role: "system",
          content: `You are a motorsport research assistant. Given a list of racing drivers with missing fields, return a JSON array of objects with "id", "nationality" (in the format "Hometown, Country" where Hometown is the driver's birth city/town and Country is the full country name — e.g. "Filksov, Denmark", "São Paulo, Brazil", "Stevenage, United Kingdom". If you only know the country, just provide the country name like "Germany"), and "date_of_birth" (ISO YYYY-MM-DD or null). Only provide values you are confident about. Return ONLY the JSON array, no other text.

IMPORTANT: If a driver already has a nationality value that is just a country name (e.g. "Denmark"), try to find their hometown and return the full "Town, Country" format. If a driver already has a "Town, Country" format, keep it as-is.`,
        },
        {
          role: "user",
          content: `Fill in missing data for these drivers:\n${JSON.stringify(driverList, null, 2)}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 8192,
    });

    if (!aiResponse.ok) {
      return new Response(JSON.stringify({ error: "AI call failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content;
    if (!rawContent) {
      return new Response(JSON.stringify({ error: "AI returned no data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let enrichedList: any[];
    try {
      const parsed = JSON.parse(rawContent);
      enrichedList = Array.isArray(parsed) ? parsed : parsed.drivers || parsed.results || Object.values(parsed)[0];
      if (!Array.isArray(enrichedList)) throw new Error("Not an array");
    } catch {
      return new Response(JSON.stringify({ error: "AI returned invalid JSON", raw: rawContent.slice(0, 500) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    for (const item of enrichedList) {
      if (!item.id) continue;
      const original = drivers.find(d => d.id === item.id);
      if (!original) continue;

      const updates: Record<string, any> = {};
      // Update nationality: accept if missing, or if upgrading from country-only to "Town, Country"
      if (item.nationality && typeof item.nationality === "string" && !["null", "unknown", "n/a"].includes(item.nationality.toLowerCase())) {
        if (!original.nationality) {
          updates.nationality = item.nationality;
        } else if (!original.nationality.includes(",") && item.nationality.includes(",")) {
          updates.nationality = item.nationality;
        }
      }
      if (!original.date_of_birth && item.date_of_birth && typeof item.date_of_birth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date_of_birth)) {
        updates.date_of_birth = item.date_of_birth;
      }

      if (Object.keys(updates).length > 0) {
        await adminClient.from("v2_drivers").update(updates).eq("id", item.id);
        updated++;
      }
    }

    return new Response(JSON.stringify({ success: true, enriched: updated, total: drivers.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("enrich-v2-drivers error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
