/**
 * fetch-session-weather edge function (Deno): a thin wrapper around ./core.ts
 * (Open-Meteo weather for one session). The same core runs locally under Node
 * through scripts/import-event.mjs --weather.
 *
 * POST { session_id }  ->  { success, weather }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/auth.ts";
import { fetchSessionWeather } from "./core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Admin only (or an internal service-role call): this function writes with the service-role key.
  const auth = await requireAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { session_id } = await req.json();
    const weather = await fetchSessionWeather(session_id, supabase, { fetch });

    return new Response(JSON.stringify({ success: true, weather }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
