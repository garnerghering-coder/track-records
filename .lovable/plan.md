

## Fix "AI Processing Failed" Error on Raw Text Import

### Root Cause

Groq's Llama 3.3 70B tool calling is failing when results have many entries (40+ cars). The model generates a very large tool call response that exceeds Groq's internal tool-use validation, returning a 400 error with `"tool_use_failed"`. This is a known limitation of Groq's tool calling with large structured outputs.

### Solution

Switch the `import-race-results` function from **tool calling** to **direct JSON output**. Instead of asking the model to call a function, we instruct it to return raw JSON in a specific schema, then parse it ourselves. This bypasses Groq's tool-call size limitation entirely.

### Changes

**File: `supabase/functions/import-race-results/index.ts`**

1. **Remove the `tools` and `tool_choice` parameters** from the Groq API request
2. **Update the system prompt** to instruct the model to respond with ONLY a JSON object matching the expected schema (event_name, series_name, season_year, location, category, entries array)
3. **Add `max_tokens: 8192`** to ensure enough room for large result sets
4. **Add `response_format: { type: "json_object" }`** to enforce JSON output mode on Groq
5. **Update response parsing**: instead of extracting `choices[0].message.tool_calls[0].function.arguments`, parse `choices[0].message.content` directly with `JSON.parse()`
6. **Add a try/catch around the JSON parse** with a clear error message if the model returns invalid JSON

All other logic (driver matching, event creation, entry insertion) stays exactly the same -- only the AI call and response parsing changes.

### Why This Works

- Groq's JSON mode doesn't have the same output size constraints as tool calling
- The model is perfectly capable of returning structured JSON without tool calling
- `max_tokens: 8192` gives plenty of room for 60+ entries
- This is actually simpler code than the tool-calling approach

### No other files affected

The frontend, database logic, and other edge functions remain unchanged.
