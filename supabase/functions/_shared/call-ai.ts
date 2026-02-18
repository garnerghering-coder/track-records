import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Shared AI caller that tries database-stored keys first (by priority),
 * then falls back to GROQ_API_KEY env var, then Lovable AI gateway.
 */
export async function callAI(body: Record<string, any>): Promise<Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Try database-stored keys ordered by priority
  try {
    const { data: keys } = await adminClient
      .from("ai_api_keys")
      .select("id, provider_url, model_name, api_key")
      .eq("is_active", true)
      .order("priority", { ascending: true });

    if (keys && keys.length > 0) {
      for (const key of keys) {
        try {
          const resp = await fetch(key.provider_url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key.api_key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ...body, model: key.model_name }),
          });

          if (resp.status === 429) {
            console.log(`Key "${key.id}" rate limited, trying next...`);
            continue;
          }

          // Update last_used_at (fire-and-forget)
          adminClient
            .from("ai_api_keys")
            .update({ last_used_at: new Date().toISOString() })
            .eq("id", key.id)
            .then(() => {});

          return resp;
        } catch (err) {
          console.error(`Key "${key.id}" failed:`, err);
          continue;
        }
      }
      console.log("All database keys exhausted, falling back...");
    }
  } catch (err) {
    console.error("Failed to fetch AI keys from database:", err);
  }

  // 2. Fall back to GROQ_API_KEY env var
  const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
  if (GROQ_KEY) {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, model: "llama-3.3-70b-versatile" }),
    });
    if (resp.status !== 429) return resp;
    console.log("Groq env key rate limited, falling back to Lovable AI");
  }

  // 3. Final fallback: Lovable AI gateway
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_KEY) throw new Error("No AI provider available");
  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, model: "google/gemini-2.5-flash" }),
  });
}
