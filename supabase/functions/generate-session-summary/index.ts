import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/auth.ts";
import { callAI } from "../_shared/call-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Admin only (or an internal service-role call): this function writes with the service-role key.
  const auth = await requireAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  try {
    const { event_id, force } = await req.json();
    if (!event_id) throw new Error("event_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check for cached summaries unless force regenerate
    if (!force) {
      const { data: cached } = await supabase
        .from("v2_session_summaries")
        .select("*")
        .eq("event_id", event_id);
      if (cached && cached.length > 0) {
        return new Response(JSON.stringify({ summaries: cached }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch event info
    const { data: event } = await supabase
      .from("v2_events")
      .select("*, v2_seasons(year, v2_series(name, short_name)), v2_circuits(name, country)")
      .eq("id", event_id)
      .single();
    if (!event) throw new Error("Event not found");

    const seriesName = event.v2_seasons?.v2_series?.name || "Unknown Series";
    const year = event.v2_seasons?.year || "";

    // Fetch sessions
    const { data: sessions } = await supabase
      .from("v2_sessions")
      .select("*")
      .eq("event_id", event_id)
      .eq("status", "published")
      .is("parent_session_id", null)
      .order("sort_order");

    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ error: "No published sessions" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch results for each session
    const sessionData: any[] = [];
    for (const s of sessions) {
      const type = s.session_type;
      const isRace = type === "race" || type === "sprint_race" || type === "endurance_race";
      const isQual = type === "qualifying" || type === "sprint_qualifying";
      const table = isRace ? "v2_race_results" : isQual ? "v2_qualifying_results" : "v2_practice_results";

      // For endurance races, also get child sessions results
      let resultsSessionId = s.id;
      if (type === "endurance_race") {
        const { data: children } = await supabase
          .from("v2_sessions")
          .select("id")
          .eq("parent_session_id", s.id)
          .eq("status", "published")
          .order("sort_order", { ascending: false })
          .limit(1);
        if (children && children.length > 0) resultsSessionId = children[0].id;
      }

      const { data: results } = await supabase
        .from(table)
        .select("*, v2_drivers(full_name, nationality), v2_teams(full_name, short_name), v2_cars(model_name, manufacturer)")
        .eq("session_id", resultsSessionId)
        .order("position")
        .limit(30);

      // Get incidents for race sessions
      let incidents: any[] = [];
      if (isRace) {
        const { data: inc } = await supabase
          .from("v2_incidents")
          .select("*")
          .eq("session_id", s.id);
        incidents = inc || [];
      }

      sessionData.push({
        session: s,
        results: (results || []).map((r: any) => ({
          position: r.position,
          driver: r.v2_drivers?.full_name,
          nationality: r.v2_drivers?.nationality,
          team: r.v2_teams?.short_name || r.v2_teams?.full_name,
          car: r.v2_cars ? `${r.v2_cars.manufacturer || ""} ${r.v2_cars.model_name}`.trim() : null,
          car_number: r.car_number,
          gap: r.gap_to_leader || r.gap_to_pole || r.gap_to_p1,
          laps: r.laps_completed || r.laps_run,
          status: r.status,
          dnf_reason: r.dnf_reason,
          best_time: r.best_lap_time || r.best_time || r.fastest_lap_time,
          class: r.extra_data?.Class,
        })),
        incidents,
      });
    }

    // Build summaries per session + overall
    const summaries: any[] = [];

    // Generate per-session summaries
    for (const sd of sessionData) {
      const s = sd.session;
      const type = s.session_type;
      const isRace = type === "race" || type === "sprint_race" || type === "endurance_race";
      const isQual = type === "qualifying" || type === "sprint_qualifying";

      let formatInstructions = "";
      if (isRace) {
        formatInstructions = `Format the summary as:
**Headline** — One punchy sentence capturing the story.
**The Win** — Who won, how close, and the decisive moment.
**The Battle** — The most compelling on-track fight of the race.
**Class Breakdown** — 1–2 sentences per class on how each played out (if multiclass).
**Standout Story** — One driver, team, or narrative worth highlighting.
**Season Implications** — Brief note on what this means going forward.`;
      } else if (isQual) {
        formatInstructions = `Format the summary as:
**Headline** — The pole story in one sentence.
**Class Poles** — One line per class: pole sitter, lap time, margin (if multiclass, otherwise just the pole).
**The Story Behind the Grid** — What the starting order means for the race.
**Drama** — Penalties, surprises, notable failures.`;
      } else {
        formatInstructions = `Format the summary as:
**Headline** — The single theme emerging across the session.
**Top Performers** — Who was fastest and why it mattered.
**Manufacturer Watch** — Who looked strong, who looked worried.
**Incidents & Damage** — Anything that may carry into the race.
**Takeaway** — What this session told us about the race ahead.`;
      }

      const prompt = `You are a motorsport journalist writing a session summary for ${seriesName} ${year} - ${event.name}.
Session: ${s.name} (${type.replace(/_/g, " ")})
Circuit: ${event.v2_circuits?.name || "Unknown"}, ${event.v2_circuits?.country || ""}

Results (top entries):
${JSON.stringify(sd.results.slice(0, 20), null, 1)}

${sd.incidents.length > 0 ? `Incidents: ${JSON.stringify(sd.incidents)}` : ""}

${formatInstructions}

IMPORTANT: Only reference ${seriesName}. Keep it concise, factual, and engaging. Use markdown formatting. If data is limited, work with what's available. Do not invent results.`;

      const resp = await callAI({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1200,
      });

      const aiData = await resp.json();
      const content = aiData.choices?.[0]?.message?.content || "Summary unavailable.";

      summaries.push({
        event_id,
        session_id: s.id,
        tab_key: s.id,
        summary_markdown: content,
      });
    }

    // Generate overall summary
    const allResults = sessionData.map(sd => `${sd.session.name}: ${JSON.stringify(sd.results.slice(0, 10))}`).join("\n");
    const overallPrompt = `You are a motorsport journalist writing an overall weekend summary for ${seriesName} ${year} - ${event.name}.
Circuit: ${event.v2_circuits?.name || "Unknown"}, ${event.v2_circuits?.country || ""}

Session summaries and results:
${allResults}

Format the summary as:
**Weekend Headline** — The story of the entire event in one sentence.
**The Winner's Weekend** — How the winning team/driver built toward victory across the whole event.
**Biggest Swing** — The team or driver whose weekend went from one extreme to the other.
**Breakout Performance** — A rookie, debutant, or underdog who made their mark.
**Manufacturer Standings** — Who won the weekend battle across the pit lane.
**What Comes Next** — One sentence on what this sets up for the season.

IMPORTANT: Only reference ${seriesName}. Keep concise, factual, engaging. Use markdown. Do not invent results.`;

    const overallResp = await callAI({
      messages: [{ role: "user", content: overallPrompt }],
      temperature: 0.7,
      max_tokens: 1200,
    });

    const overallData = await overallResp.json();
    const overallContent = overallData.choices?.[0]?.message?.content || "Summary unavailable.";

    summaries.push({
      event_id,
      session_id: null,
      tab_key: "overall",
      summary_markdown: overallContent,
    });

    // Upsert all summaries
    for (const s of summaries) {
      await supabase
        .from("v2_session_summaries")
        .upsert(
          { ...s, generated_at: new Date().toISOString() },
          { onConflict: "event_id,tab_key" }
        );
    }

    // Re-fetch to return
    const { data: saved } = await supabase
      .from("v2_session_summaries")
      .select("*")
      .eq("event_id", event_id);

    return new Response(JSON.stringify({ summaries: saved || summaries }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-session-summary error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
