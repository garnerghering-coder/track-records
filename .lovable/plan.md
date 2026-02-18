

## Remove Lovable Branding + Smart AI Fallback (Groq-first, Lovable AI backup)

### 1. Remove Lovable Branding from `index.html`

Update all meta tags to use "TrackRecord" branding:
- Title: "TrackRecord - Motorsport Driver Profiles"
- Description: "The verified motorsport driver profile platform."
- Author: "TrackRecord"
- OG tags updated, Lovable OG images removed
- Twitter `@Lovable` reference removed
- TODO comments removed

The "Edit in Lovable" button in the bottom-right is a platform feature -- go to **Settings** in Lovable and toggle **"Hide 'Lovable' Badge"** (requires a paid plan). It cannot be removed through code.

### 2. Smart AI Fallback in All 4 Edge Functions

The pattern for each function: try Groq first, and if it returns a 429 (rate limit), automatically retry the same request using the Lovable AI gateway instead.

**Functions to update:**
- `enrich-driver-profile` -- uses JSON mode
- `generate-race-event` -- uses tool calling
- `import-race-results` -- uses JSON mode
- `scrape-race-results` -- uses tool calling

**How it works in each function:**

```text
1. Build the request body (messages, tools, etc.)
2. Try Groq (api.groq.com, GROQ_API_KEY, llama-3.3-70b-versatile)
3. If response is 429:
   - Log "Groq rate limited, falling back to Lovable AI"
   - Retry same request to ai.gateway.lovable.dev with LOVABLE_API_KEY and google/gemini-2.5-flash
4. If Groq succeeds, use that response
5. Next request starts with Groq again (no persistent state needed)
```

This means Groq is always the first choice. Lovable AI only kicks in when Groq is temporarily unavailable. Since each edge function invocation is independent, there's no state to manage -- it just tries Groq first every time.

### Technical Details

A shared helper pattern will be added near the top of each function:

```typescript
async function callAI(body: Record<string, any>): Promise<Response> {
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  const groqBody = { ...body, model: "llama-3.3-70b-versatile" };

  if (GROQ_API_KEY) {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(groqBody),
    });
    if (resp.status !== 429) return resp;
    console.log("Groq rate limited, falling back to Lovable AI");
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("No AI provider available");

  const lovableBody = { ...body, model: "google/gemini-2.5-flash" };
  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(lovableBody),
  });
}
```

Each function's existing `fetch("https://api.groq.com/...")` call gets replaced with `callAI({ messages, ... })`. The error handling for non-429 errors (401, 500, etc.) stays the same but the error messages become generic ("AI processing failed") instead of Groq-specific.

The initial check `if (!GROQ_API_KEY) throw new Error(...)` is also removed since the function can now work without Groq.

### No database changes needed
