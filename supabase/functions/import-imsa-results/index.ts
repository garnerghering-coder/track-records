/**
 * import-imsa-results edge function (Deno): a thin wrapper around ./core.ts.
 *
 * The import logic lives in core.ts so it also runs locally under Node against
 * the repo data store (scripts/import-event.mjs). This file only handles CORS,
 * the admin check and the service-role client.
 *
 * POST { url, event_id, mode?: "preview" }  ->  import summary JSON
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/auth.ts";
import { ImportError, importEvent } from "./core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Admin only: this function writes results with the service-role key.
  const auth = await requireAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { url, event_id, mode } = await req.json();

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const summary = await importEvent({ url, event_id, mode }, adminClient, {
      fetch,
      aiKey: Deno.env.get("LOVABLE_API_KEY") ?? null,
      sessionStatus: "draft",
    });
    return json(summary, 200);
  } catch (e) {
    if (e instanceof ImportError) return json(e.body, e.status);
    console.error("import-imsa-results error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
