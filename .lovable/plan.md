

## Switch All AI Edge Functions to Groq (Llama 3.3 70B)

### Setup

You'll need to add your Groq API key as a backend secret called `GROQ_API_KEY`. You can get a free key from [console.groq.com](https://console.groq.com).

### Why This Is Simple

Groq's API is OpenAI-compatible, so the changes in each function are minimal -- just 3 things per function:

1. Replace `LOVABLE_API_KEY` env check with `GROQ_API_KEY`
2. Change the API URL from `https://ai.gateway.lovable.dev/v1/chat/completions` to `https://api.groq.com/openai/v1/chat/completions`
3. Change the model from `google/gemini-2.5-flash` to `llama-3.3-70b-versatile`

The request body format (messages, tools, tool_choice) stays identical since Groq supports OpenAI-compatible tool calling.

### Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/generate-race-event/index.ts` | Swap API key, URL, and model |
| `supabase/functions/scrape-race-results/index.ts` | Swap API key, URL, and model |
| `supabase/functions/import-race-results/index.ts` | Swap API key, URL, and model |
| `supabase/functions/enrich-driver-profile/index.ts` | Swap API key, URL, and model |

### Error Handling Update

- Keep 429 (rate limit) handling as-is -- Groq returns 429 too
- Remove the 402 (credits exhausted) handling since Groq's free tier doesn't use that error code
- Add handling for 401 (invalid API key)

### Groq Free Tier Limits

- Llama 3.3 70B: 30 requests/minute, 1,000 requests/day, 100,000 tokens/minute
- This should be plenty for admin-only race imports and driver enrichment

### No other changes needed

The tool calling schema, database logic, driver matching, and all frontend code remain exactly the same.

