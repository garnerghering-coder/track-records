import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/call-ai.ts";

// Use the npm: specifier for Deno-compatible pdf-parse
import pdf from "npm:pdf-parse/lib/pdf-parse.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Text-based heuristic parser ──────────────────────────────────────

interface ParsedResult {
  position: number | null;
  car_number: string;
  driver_name: string;
  team_name: string;
  best_lap_time?: string;
  gap?: string;
  laps?: number;
  q1_time?: string;
  q2_time?: string;
  q3_time?: string;
  best_time?: string;
  laps_completed?: number;
  total_time?: string;
  status?: string;
  dnf_reason?: string;
  fastest_lap_time?: string;
  pit_stops?: number;
  points?: number;
}

const TIME_RE = /^\d{1,2}:\d{2}\.\d{2,4}$/;
const GAP_RE = /^[+-]?\d+\.\d{1,4}s?$/;
const LAP_GAP_RE = /^\+\d+\s*Lap/i;
const STATUS_KEYWORDS = ["DNF", "DNS", "DSQ", "RET", "NC", "NOT CLASSIFIED", "DISQUALIFIED", "RETIRED", "EXCLUDED"];
const HEADER_KEYWORDS = ["POS", "NO", "#", "DRIVER", "ENTRANT", "TEAM", "CONSTRUCTOR", "TIME", "GAP", "LAPS", "BEST", "INTERVAL"];

function looksLikeHeader(line: string): boolean {
  const upper = line.toUpperCase();
  let hits = 0;
  for (const kw of HEADER_KEYWORDS) {
    if (upper.includes(kw)) hits++;
  }
  return hits >= 2;
}

function isTimeLike(s: string): boolean {
  return TIME_RE.test(s) || GAP_RE.test(s) || LAP_GAP_RE.test(s);
}

function isStatusKeyword(s: string): boolean {
  const u = s.toUpperCase().trim();
  return STATUS_KEYWORDS.some(k => u === k || u.startsWith(k));
}

function parseTextResults(text: string, sessionType: string): ParsedResult[] | null {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) return null;

  // Find header line to skip it
  let dataStartIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    if (looksLikeHeader(lines[i])) {
      dataStartIdx = i + 1;
      break;
    }
  }

  const results: ParsedResult[] = [];

  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i];
    // Split on 2+ spaces or tabs to get columns
    const cols = line.split(/\s{2,}|\t/).map(c => c.trim()).filter(Boolean);
    if (cols.length < 3) continue;

    // Try to parse: position, car_number, driver, team, ...time fields
    let ci = 0;

    // Position: first token should be a number or a status like "RET"
    let position: number | null = null;
    const posCandidate = cols[ci];
    if (/^\d{1,3}$/.test(posCandidate)) {
      position = parseInt(posCandidate, 10);
      ci++;
    } else if (isStatusKeyword(posCandidate)) {
      // No numeric position (e.g. "RET" or "DNF" in pos column)
      ci++;
    } else {
      // Doesn't look like a result row
      continue;
    }

    if (ci >= cols.length) continue;

    // Car number: usually 1-4 digits
    let car_number = "";
    if (/^\d{1,4}$/.test(cols[ci])) {
      car_number = cols[ci];
      ci++;
    }

    if (ci >= cols.length) continue;

    // Driver name: next non-numeric, non-time text
    let driver_name = "";
    if (!isTimeLike(cols[ci]) && !/^\d{1,4}$/.test(cols[ci])) {
      driver_name = cols[ci];
      ci++;
    }

    // Team name: next text field that isn't a time
    let team_name = "";
    if (ci < cols.length && !isTimeLike(cols[ci]) && !isStatusKeyword(cols[ci]) && !/^\d{1,3}$/.test(cols[ci])) {
      team_name = cols[ci];
      ci++;
    }

    if (!driver_name && !car_number) continue;

    // Collect remaining fields as times, gaps, laps, status
    const remaining = cols.slice(ci);
    const times: string[] = [];
    let laps: number | undefined;
    let status: string | undefined;
    let dnfReason: string | undefined;

    for (const token of remaining) {
      if (isTimeLike(token)) {
        times.push(token);
      } else if (/^\d{1,3}$/.test(token) && parseInt(token) > 0) {
        laps = parseInt(token);
      } else if (isStatusKeyword(token)) {
        status = token.toUpperCase();
        if (status === "RET" || status === "RETIRED") status = "dnf";
        else if (status === "NC" || status === "NOT CLASSIFIED") status = "classified";
        else status = status.toLowerCase();
      }
    }

    const result: ParsedResult = {
      position,
      car_number,
      driver_name,
      team_name,
    };

    const isRace = ["race", "sprint_race", "sprint"].some(t => sessionType.toLowerCase().includes(t));
    const isQualifying = sessionType.toLowerCase().includes("qual");

    if (isRace) {
      result.laps_completed = laps;
      result.total_time = times[0] || undefined;
      result.fastest_lap_time = times[1] || undefined;
      result.status = status || (position ? "finished" : "dnf");
    } else if (isQualifying) {
      result.best_time = times[0] || undefined;
      result.q1_time = times[0] || undefined;
      result.q2_time = times[1] || undefined;
      result.q3_time = times[2] || undefined;
      result.gap = times.find(t => t.startsWith("+")) || undefined;
      result.laps = laps;
    } else {
      // Practice
      result.best_lap_time = times[0] || undefined;
      result.gap = times.find(t => t.startsWith("+")) || times[1] || undefined;
      result.laps = laps;
    }

    results.push(result);
  }

  return results.length >= 3 ? results : null;
}

// ── AI fallback prompt ───────────────────────────────────────────────

function buildAIPrompt(sessionType: string): string {
  const typeHint = sessionType || "race";
  return `You are a motorsport data extraction expert. Extract ALL results from this PDF document into structured JSON.

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
}

// ── Main handler ─────────────────────────────────────────────────────

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

    const typeHint = session_type || "race";

    // ── Layer 1: Text-based extraction ──
    let textResults: ParsedResult[] | null = null;
    try {
      const pdfData = await pdf(Buffer.from(pdfBytes));
      const extractedText = pdfData.text || "";
      console.log(`Extracted ${extractedText.length} chars of text from PDF`);

      if (extractedText.length > 50) {
        textResults = parseTextResults(extractedText, typeHint);
        if (textResults) {
          console.log(`Text parser found ${textResults.length} results`);
        }
      }
    } catch (pdfErr) {
      console.error("PDF text extraction failed:", pdfErr);
    }

    if (textResults && textResults.length >= 3) {
      return new Response(JSON.stringify({ results: textResults, storage_path: storagePath, method: "text" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Layer 2: AI fallback via callAI ──
    console.log("Text extraction insufficient, falling back to AI...");

    const aiResp = await callAI({
      messages: [
        { role: "user", content: [
          { type: "text", text: buildAIPrompt(typeHint) },
          { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdf_base64}` } }
        ]}
      ],
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
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "Could not parse AI response", raw: content }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ results: parsed.results || [], storage_path: storagePath, method: "ai" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("parse-session-pdf error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
