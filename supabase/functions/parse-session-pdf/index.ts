import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, session_type, pdf_base64, file_name } = await req.json();
    if (!session_id || !pdf_base64) {
      return new Response(JSON.stringify({ error: "session_id and pdf_base64 required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Store the PDF
    const pdfBytes = Uint8Array.from(atob(pdf_base64), c => c.charCodeAt(0));
    const storagePath = `${session_id}/${file_name || "results.pdf"}`;
    const { error: uploadErr } = await adminClient.storage.from("session-documents").upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) console.error("Upload error:", uploadErr);

    // Update session with document URL
    await adminClient.from("v2_sessions").update({ source_document_url: storagePath } as any).eq("id", session_id);

    // Call AI to parse the PDF
    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_KEY) throw new Error("No AI provider available");

    const typeHint = session_type || "race";
    const prompt = `You are a motorsport data extraction expert. Extract ALL results from this PDF document into structured JSON.

The session type is "${typeHint}". Return a JSON object with a "results" array.

Each result object MUST have these fields:
- position: number (finishing position)
- car_number: string (car/driver number, from "NO" or "#" column)
- driver_name: string (full driver name)
- team_name: string (team/entrant name, if available)

For practice sessions, also include:
- best_lap_time: string (e.g. "1:23.456")
- gap: string (gap to P1)
- laps: number (laps run)

For qualifying sessions, also include:
- q1_time, q2_time, q3_time: string (segment times if available)
- best_time: string
- gap: string (gap to pole)
- laps: number

For race/sprint sessions, also include:
- laps_completed: number
- total_time: string (race time or gap to leader like "+5.123s" or "+1 Lap")
- status: string (one of: "finished", "dnf", "dns", "dsq", "classified")
- dnf_reason: string (if DNF)
- fastest_lap_time: string (if available)
- pit_stops: number (if available)
- points: number (if available)

Return ONLY valid JSON. No markdown, no explanation.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "user", content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdf_base64}` } }
          ]}
        ],
      }),
    });

    if (!aiResp.ok) {
      const status = aiResp.status;
      const errText = await aiResp.text();
      console.error("AI error:", status, errText);
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI parsing failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResp.json();
    let content = aiData.choices?.[0]?.message?.content || "";
    
    // Strip markdown code fences if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "Could not parse AI response", raw: content }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ results: parsed.results || [], storage_path: storagePath }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("parse-session-pdf error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
