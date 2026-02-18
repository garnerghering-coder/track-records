

## Fix Unreliable Driver Enrichment

### Root Cause

The `enrich-driver-profile` edge function uses Groq's **tool calling** mode, which is non-deterministic. Sometimes the AI returns `null` for fields it actually knows (nationality, bio, etc.). When that happens:

1. The profile has empty fields (e.g., no nationality, no bio)
2. The AI returns `null` for those same fields
3. The update logic sees `!profile.nationality && enriched.nationality` -- both are falsy, so no update
4. The function reports "0 fields updated" and the toast says "All fields already populated"

This is the exact same Groq tool-calling reliability issue that was already fixed for the `import-race-results` function.

### Solution

Apply the same fix: switch from **tool calling** to **JSON mode** in the Groq API call. This is more reliable and consistent.

Additionally, add a `force` option so admins can re-enrich a driver even if fields are already populated (useful for correcting bad AI data).

### Changes

**File: `supabase/functions/enrich-driver-profile/index.ts`**

1. Remove `tools` and `tool_choice` parameters from the Groq API request
2. Update the system prompt to instruct the model to return ONLY a JSON object with the expected fields (nationality, bio, date_of_birth, primary_category, social links)
3. Add `response_format: { type: "json_object" }` to enforce JSON output
4. Add `max_tokens: 2048` for reliability
5. Change response parsing from `choices[0].message.tool_calls[0].function.arguments` to `JSON.parse(choices[0].message.content)`
6. Add try/catch around JSON parsing
7. Accept an optional `force: true` parameter in the request body -- when set, overwrite existing fields instead of skipping them

**File: `src/pages/Admin.tsx`**

8. Add a "Force Re-enrich" option: when a single enrich returns 0 fields updated, show a follow-up toast action or add a separate button that calls the function with `force: true`
9. Update `handleEnrichDriver` to accept an optional `force` parameter and pass it in the request body

### Why This Fixes It

- JSON mode is deterministic and reliable -- the model consistently returns all fields it knows about
- The `force` option gives admins a fallback to overwrite stale or incorrect AI data
- No database changes needed
