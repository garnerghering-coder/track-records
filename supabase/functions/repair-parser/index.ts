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

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { source_definition_id, import_run_id, user_message } = await req.json();

    if (!source_definition_id || !user_message) {
      return new Response(JSON.stringify({ error: "source_definition_id and user_message are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load source definition
    const { data: sourceDef } = await adminClient.from("source_definitions").select("*").eq("id", source_definition_id).single();
    if (!sourceDef) {
      return new Response(JSON.stringify({ error: "Source definition not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load import run if provided
    let runContext = "";
    if (import_run_id) {
      const { data: run } = await adminClient.from("import_runs").select("*").eq("id", import_run_id).single();
      if (run) {
        runContext = `\n\nLAST IMPORT RUN:
- URL: ${run.url}
- Status: ${run.status}
- Error: ${run.error_message || "none"}
- Validation errors: ${JSON.stringify(run.validation_errors || [])}
- Log: ${JSON.stringify(run.log || [])}
- Extracted data sample: ${JSON.stringify((run.extracted_data as any[])?.slice(0, 3) || [])}
- Mapped data sample: ${JSON.stringify((run.mapped_data as any[])?.slice(0, 3) || [])}`;
      }
    }

    const aiResponse = await callAI({
      messages: [
        {
          role: "system",
          content: `You are a parser debugging assistant for a motorsport results platform. The user has a Source Definition (parser config) that may have issues. Help them diagnose and fix the problem.

CURRENT SOURCE DEFINITION:
Name: ${sourceDef.name}
URL Pattern: ${sourceDef.url_pattern}
Config: ${JSON.stringify(sourceDef.config, null, 2)}
Test Snapshot: ${JSON.stringify(sourceDef.test_snapshot || {}, null, 2).slice(0, 3000)}
${runContext}

You can suggest specific changes to the Source Definition config. When suggesting fixes, be precise about which fields to change and what values to use.

Respond with:
1. A diagnosis of what's likely wrong
2. Specific suggested changes to the config JSON
3. Whether a re-test is recommended

If you suggest config changes, include a JSON code block with the updated config sections.`,
        },
        {
          role: "user",
          content: user_message,
        },
      ],
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const reply = aiData.choices?.[0]?.message?.content || "No response from AI";

    // Try to extract config changes from the response
    let suggestedConfig: any = null;
    const jsonMatch = reply.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        suggestedConfig = JSON.parse(jsonMatch[1]);
      } catch { /* ignore parse errors */ }
    }

    return new Response(JSON.stringify({
      success: true,
      reply,
      suggested_config: suggestedConfig,
      source_definition_id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("repair-parser error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
