import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/call-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 15;
const CHUNK_LIMIT = 45; // Process up to 3 AI batches per invocation, then self-chain

const SYSTEM_PROMPT = `You are a motorsport data specialist. Classify DNF/DSQ reasons for race results.

FOR DSQ, choose exactly one:
- "Technical" — car failed post-race scrutineering, weight, ride height, fuel sample, etc.
- "Driving Conduct" — penalty for dangerous driving, repeated track limits, ignoring flags, etc.

FOR DNF, choose exactly one:
- "Mechanical Failure" — engine, gearbox, PU, hydraulics, suspension, electrical, brake failure, or puncture not from contact.
- "Technical Failure (Non-Contact)" — operational/damage failure without contact: floor damage from kerbs, overheating from debris, cooling issues, bodywork failure.
- "Not At Fault – Contact" — eliminated by contact caused by another competitor, not this driver's fault.
- "At Fault – Penalized" — official penalty for causing collision, dangerous driving leading to retirement.
- "At Fault – Self-Inflicted (No Penalty)" — single-car accident, loss of control, spin into barrier/gravel, self-caused retirement without penalty.
- "Other" — ONLY if none of the above fit.

Also provide a brief explanation (max 15 words) describing what happened. Example: "Powertrain failure caused retirement on Lap 45" or "Spun and collided with wall during rain".

Respond with ONLY a JSON array. Each element: {"id":"<result_id>","reason":"<exact reason string>","explanation":"<brief description>","confidence":"high"|"medium"|"low"}
No other text. Prefer "Mechanical Failure" for generic DNFs where specifics are unknown.`;

async function processBatch(admin: any, batch: any[]): Promise<{ resolved: number; skippedLow: number }> {
  const entries = batch.map((r: any, i: number) => {
    const evt = r.session?.event;
    const season = evt?.season;
    const series = season?.series;
    return `${i + 1}. [${r.id}] ${r.status.toUpperCase()}, ${r.driver?.full_name || "?"}, ${r.team?.full_name || "?"}, #${r.car_number || "?"}, P${r.position || "?"}, ${evt?.name || "?"}, ${series?.name || "?"} ${season?.year || "?"}`;
  }).join("\n");

  const resp = await callAI({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Classify these ${batch.length} results:\n${entries}` },
    ],
    temperature: 0.1,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`AI batch failed (${resp.status}): ${errText}`);
    return { resolved: 0, skippedLow: 0 };
  }

  const aiData = await resp.json();
  const content = aiData.choices?.[0]?.message?.content || "";
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error("AI did not return valid JSON for batch");
    return { resolved: 0, skippedLow: 0 };
  }

  const classifications: { id: string; reason: string; explanation?: string; confidence: string }[] = JSON.parse(jsonMatch[0]);

  let resolved = 0;
  let skippedLow = 0;
  for (const c of classifications) {
    if (c.confidence === "low") { skippedLow++; continue; }
    const updates: Record<string, any> = { dnf_reason: c.reason };
    if (c.explanation) updates.dnf_explanation = c.explanation;
    const { error: upErr } = await admin
      .from("v2_race_results")
      .update(updates)
      .eq("id", c.id);
    if (!upErr) resolved++;
  }
  return { resolved, skippedLow };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json().catch(() => ({}));
    const isSelfChain = body._selfChain === true;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: results, error } = await admin
      .from("v2_race_results")
      .select(`
        id, status, dnf_reason, car_number, position,
        driver:v2_drivers(full_name),
        team:v2_teams(full_name),
        session:v2_sessions(id, name, parent_session_id, event:v2_events(name, season:v2_seasons(year, series:v2_series(name))))
      `)
      .in("status", ["dnf", "dsq"])
      .or("dnf_reason.is.null,dnf_reason.eq.")
      .limit(CHUNK_LIMIT);

    if (error) throw error;

    const toResolve = (results || []).filter((r: any) => !r.session?.parent_session_id);

    if (toResolve.length === 0) {
      return new Response(JSON.stringify({ resolved: 0, skippedLow: 0, total: 0, done: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process in batches of BATCH_SIZE
    let totalResolved = 0;
    let totalSkipped = 0;
    for (let i = 0; i < toResolve.length; i += BATCH_SIZE) {
      const batch = toResolve.slice(i, i + BATCH_SIZE);
      const { resolved, skippedLow } = await processBatch(admin, batch);
      totalResolved += resolved;
      totalSkipped += skippedLow;
    }

    // Self-chain if we had a full chunk (more might remain)
    let continuing = false;
    if (toResolve.length >= CHUNK_LIMIT) {
      continuing = true;
      fetch(`${SUPABASE_URL}/functions/v1/resolve-dnf-reasons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ _selfChain: true }),
      }).catch(err => console.error("Self-chain failed:", err));
    }

    return new Response(JSON.stringify({ resolved: totalResolved, skippedLow: totalSkipped, total: toResolve.length, continuing }), {
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
