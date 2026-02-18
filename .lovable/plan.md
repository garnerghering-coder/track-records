

## Admin AI Key Manager

### What This Adds

A new "AI Keys" tab in the Admin dashboard where you can:

- **Add API keys** for any OpenAI-compatible provider (Groq, OpenRouter, Together, etc.) with a label, endpoint URL, model name, and the key itself
- **See all configured keys** in a table with their status (active/disabled), provider name, and last-used timestamp
- **Enable/disable keys** with a toggle -- disabled keys are skipped
- **Delete keys** you no longer need
- **Priority ordering** -- keys are tried top-to-bottom; drag or reorder to set priority

The edge functions will try each active key in priority order, falling back to the next one on 429 (rate limit) or failure, with the Lovable AI gateway as the final fallback.

### How It Works

1. A new `ai_api_keys` database table stores the keys (encrypted at rest by the database). Only admins can read/write this table via RLS.
2. The shared `callAI` logic in each edge function is updated to:
   - Fetch all active keys from `ai_api_keys` ordered by priority
   - Try each one in sequence until one succeeds
   - Fall back to the Lovable AI gateway as the last resort
   - Update `last_used_at` on the key that worked
3. The Admin UI gets a new "AI Keys" tab with a simple form and table

### UI Design

The "AI Keys" tab will show:
- **Add Key form**: Fields for Label (e.g. "My Groq Key"), Provider URL (defaults to Groq's endpoint), Model name (defaults to "llama-3.3-70b-versatile"), and the API Key itself
- **Keys table**: Label, Provider URL, Model, Status toggle, Last Used timestamp, Delete button
- Keys are stored with a `priority` integer -- lower number = tried first

### Technical Details

**New database table: `ai_api_keys`**
```text
- id (uuid, primary key)
- label (text) -- e.g. "Groq Key #2"
- provider_url (text) -- e.g. "https://api.groq.com/openai/v1/chat/completions"
- model_name (text) -- e.g. "llama-3.3-70b-versatile"
- api_key (text) -- the actual key
- is_active (boolean, default true)
- priority (integer, default 0) -- lower = tried first
- last_used_at (timestamptz, nullable)
- created_at (timestamptz, default now())
```

RLS: Only admins can SELECT, INSERT, UPDATE, DELETE.

**Shared helper function: `supabase/functions/_shared/call-ai.ts`**
- A single shared `callAI` function that all edge functions import
- Fetches active keys from `ai_api_keys` ordered by priority
- Tries each key in sequence, skipping on 429 or error
- Falls back to `GROQ_API_KEY` env var (existing behavior) and then Lovable AI gateway
- Updates `last_used_at` on success

**Edge functions updated** (discover-series, scrape-race-results, generate-race-event, enrich-driver-profile, import-race-results, parse-submission):
- Replace the inline `callAI` function with an import from the shared helper

**File: `src/pages/Admin.tsx`**
- Add "AI Keys" tab
- Form to add new keys (label, provider URL, model, API key)
- Table listing all keys with toggle, delete, and last-used info
- API key values are masked in the UI (show last 4 chars only)

