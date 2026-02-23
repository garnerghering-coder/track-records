import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/call-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all race results with DNF/DSQ but no reason, with context
    const { data: results, error } = await admin
      .from("v2_race_results")
      .select(`
        id, status, dnf_reason, car_number, position,
        driver:v2_drivers(full_name),
        team:v2_teams(full_name),
        session:v2_sessions(id, name, parent_session_id, event:v2_events(name, season:v2_seasons(year, series:v2_series(name))))
      `)
      .in("status", ["dnf", "dsq"])
      .or("dnf_reason.is.null,dnf_reason.eq.");

    if (error) throw error;

    // Filter out endurance sub-sessions
    const toResolve = (results || []).filter((r: any) => !r.session?.parent_session_id);

    if (toResolve.length === 0) {
      return new Response(JSON.stringify({ resolved: 0, message: "No missing reasons found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build a compact list for AI — batch all into one call for minimal credits
    const entries = toResolve.map((r: any, i: number) => {
      const evt = r.session?.event;
      const season = evt?.season;
      const series = season?.series;
      return `${i + 1}. [${r.id}] Status: ${r.status.toUpperCase()}, Driver: ${r.driver?.full_name || "Unknown"}, Team: ${r.team?.full_name || "Unknown"}, Car #${r.car_number || "?"}, P${r.position || "?"}, Event: ${evt?.name || "?"}, Series: ${series?.name || "?"} ${season?.year || "?"}`;
    }).join("\n");

    const systemPrompt = `You are a motorsport data specialist. You must classify DNF/DSQ reasons for race results.

FOR DSQ, choose exactly one:
- "Technical" — car failed post-race scrutineering, weight, ride height, fuel sample, etc.
- "Driving Conduct" — penalty for dangerous driving, repeated track limits, ignoring flags, etc.

FOR DNF, choose exactly one:
- "Mechanical Failure" — engine, gearbox, PU, hydraulics, suspension, electrical, brake failure, or puncture not from contact.
- "Technical Failure (Non-Contact)" — operational/damage failure without contact: floor damage from kerbs, overheating from debris, cooling issues, bodywork failure.
- "Not At Fault – Contact" — eliminated by contact caused by another competitor, not this driver's fault.
- "At Fault – Penalized" — official penalty for causing collision, dangerous driving leading to retirement.
- "At Fault – Self-Inflicted (No Penalty)" — single-car accident, loss of control, spin into barrier/gravel, self-caused retirement without penalty.
- "Other" — ONLY if none of the above fit and you truly cannot determine.

Respond with ONLY a JSON array. Each element: {"id":"<result_id>","reason":"<exact reason string>","confidence":"high"|"medium"|"low"}
Do NOT include any other text. If unsure, use your best judgment based on common racing patterns for that series/era. Prefer "Mechanical Failure" for generic DNFs where specifics are unknown.`;

    const resp = await callAI({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Classify these ${toResolve.length} results:\n${entries}` },
      ],
      temperature: 0.1,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`AI call failed (${resp.status}): ${errText}`);
    }

    const aiData = await resp.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("AI did not return valid JSON array");

    const classifications: { id: string; reason: string; confidence: string }[] = JSON.parse(jsonMatch[0]);

    // Apply updates
    let resolved = 0;
    let skippedLow = 0;
    for (const c of classifications) {
      if (c.confidence === "low") {
        skippedLow++;
        continue;
      }
      const { error: upErr } = await admin
        .from("v2_race_results")
        .update({ dnf_reason: c.reason })
        .eq("id", c.id);
      if (!upErr) resolved++;
    }

    return new Response(JSON.stringify({ resolved, skippedLow, total: toResolve.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("resolve-dnf-reasons error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
