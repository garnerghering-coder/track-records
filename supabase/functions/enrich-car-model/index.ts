import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/call-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub as string;

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const carModelIds: string[] = body.carModelIds ? body.carModelIds : body.carModelId ? [body.carModelId] : [];
    const force = body.force === true;

    if (carModelIds.length === 0) {
      return new Response(JSON.stringify({ error: "carModelId or carModelIds required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: any[] = [];

    for (const carId of carModelIds) {
      const { data: car } = await adminClient.from("car_models").select("*").eq("id", carId).single();
      if (!car) { results.push({ id: carId, error: "Not found" }); continue; }

      const needsEnrich = force || !car.description || !car.manufacturer || !car.category;
      if (!needsEnrich) { results.push({ id: carId, name: car.name, fieldsUpdated: [] }); continue; }

      const prompt = `You are a motorsport expert. Given the car model name "${car.name}", provide the following as JSON:
{
  "description": "2-3 sentence description of the car, its racing class, and history",
  "manufacturer": "The manufacturer (e.g., Porsche, Ferrari, Cadillac)",
  "category": "One of: karting, single_seater, gt, touring_car, sports_car, rally, endurance, formula, stock_car, other",
  "year_introduced": number or null,
  "website": "Official manufacturer page URL or null"
}
Only return valid JSON, no markdown.`;

      try {
        const aiResp = await callAI({ messages: [{ role: "user", content: prompt }], temperature: 0.3, max_tokens: 500 });
        const text = await aiResp.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) { results.push({ id: carId, name: car.name, error: "No JSON in response" }); continue; }

        const parsed = JSON.parse(jsonMatch[0]);
        const updates: Record<string, any> = {};
        const fieldsUpdated: string[] = [];

        if (parsed.description && (force || !car.description)) { updates.description = parsed.description; fieldsUpdated.push("description"); }
        if (parsed.manufacturer && (force || !car.manufacturer)) { updates.manufacturer = parsed.manufacturer; fieldsUpdated.push("manufacturer"); }
        if (parsed.category && (force || !car.category)) { updates.category = parsed.category; fieldsUpdated.push("category"); }
        if (parsed.year_introduced && (force || !car.year_introduced)) { updates.year_introduced = parsed.year_introduced; fieldsUpdated.push("year_introduced"); }
        if (parsed.website && (force || !car.website)) { updates.website = parsed.website; fieldsUpdated.push("website"); }

        if (Object.keys(updates).length > 0) {
          await adminClient.from("car_models").update(updates).eq("id", carId);
        }

        results.push({ id: carId, name: car.name, fieldsUpdated });
      } catch (err: any) {
        results.push({ id: carId, name: car.name, error: err.message });
      }
    }

    return new Response(JSON.stringify({ results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
