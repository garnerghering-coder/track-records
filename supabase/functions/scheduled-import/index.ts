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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if called with a specific sourceId (manual "Run Now") or as cron (all due sources)
    let sources: any[] = [];
    let authHeader = req.headers.get("Authorization") || `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`;

    const body = await req.json().catch(() => ({}));
    const specificSourceId = body.sourceId;

    if (specificSourceId) {
      // Manual run - verify admin
      const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData } = await anonClient.auth.getClaims(token);
      if (!claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claimsData.claims.sub as string;
      const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
      if (!roleData || roleData.length === 0) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data } = await adminClient.from("import_sources").select("*").eq("id", specificSourceId).single();
      if (data) sources = [data];
    } else {
      // Cron run - get all active sources due for import
      const now = new Date();
      const { data } = await adminClient.from("import_sources").select("*").eq("is_active", true);
      
      sources = (data || []).filter((s: any) => {
        if (!s.last_run_at) return true;
        const lastRun = new Date(s.last_run_at);
        const hoursSince = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
        if (s.frequency === "daily") return hoursSince >= 24;
        if (s.frequency === "weekly") return hoursSince >= 168;
        if (s.frequency === "monthly") return hoursSince >= 720;
        return hoursSince >= 24;
      });
    }

    console.log(`Processing ${sources.length} import sources`);

    const results: any[] = [];
    for (const source of sources) {
      try {
        console.log(`Importing from: ${source.name} (${source.url})`);
        
        // Use the scrape-race-results function internally
        const importResponse = await fetch(`${SUPABASE_URL}/functions/v1/scrape-race-results`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
          },
          body: JSON.stringify({ url: source.url }),
        });

        const importResult = await importResponse.json();
        
        if (importResponse.ok && importResult.success) {
          await adminClient.from("import_sources").update({
            last_run_at: new Date().toISOString(),
            last_status: "success",
          }).eq("id", source.id);
          
          results.push({
            sourceId: source.id,
            name: source.name,
            status: "success",
            entriesCount: importResult.entriesCount,
          });
        } else {
          await adminClient.from("import_sources").update({
            last_run_at: new Date().toISOString(),
            last_status: importResult.error || "error",
          }).eq("id", source.id);
          
          results.push({
            sourceId: source.id,
            name: source.name,
            status: "error",
            error: importResult.error,
          });
        }
      } catch (err) {
        console.error(`Error processing source ${source.name}:`, err);
        await adminClient.from("import_sources").update({
          last_run_at: new Date().toISOString(),
          last_status: "error",
        }).eq("id", source.id);
        
        results.push({
          sourceId: source.id,
          name: source.name,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      sourcesProcessed: sources.length,
      results,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("scheduled-import error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
