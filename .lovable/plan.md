

## Add Web Search and URL Scraping for Race Data

### Problem
The AI model (Gemini Flash) has a knowledge cutoff and can't find results for very recent races. You need two ways to get fresh data: automatic web search and paste-a-URL scraping.

### Solution

#### 1. Connect Firecrawl (URL Scraping)
Connect the Firecrawl connector to this project. This gives the edge functions access to a web scraping API that can read any results page you paste in.

#### 2. New Edge Function: `scrape-race-results`
A new backend function that:
- Accepts a `{ url: string }` payload
- Uses Firecrawl to scrape the page content as markdown
- Feeds that markdown into the AI (Gemini Flash) with the same `submit_race_results` tool-calling schema
- Inserts the structured results into the database (same logic as `generate-race-event`)
- Everything lands as "pending" for review

#### 3. Update `generate-race-event` with Web Search
Upgrade the existing function to use a two-step approach:
- **Step 1**: Use Firecrawl's search API to find recent results pages for the given race name (e.g., searching "2026 Rolex 24 at Daytona results")
- **Step 2**: Scrape the top result to get actual timing data as markdown
- **Step 3**: Feed that real data into the AI for structured extraction (instead of relying on the AI's training data alone)
- This means the "Generate Race" feature now works for races that happened yesterday, not just ones in the AI's training data

Also update the system prompt with date context and anti-TBD rules (the fix from the previous plan).

#### 4. Admin UI Updates
In the AI Import tab of `src/pages/Admin.tsx`:
- Add a **"Import from URL"** section: a URL input field and "Import" button. Paste a link to any results page and the system scrapes and extracts it.
- The existing "Generate Race from Name" input stays, but now it searches the web first for better accuracy.
- The existing "Advanced Import" text area for pasting raw text remains unchanged.

### Technical Details

**Connector setup:**
- Connect Firecrawl via the connector system (provides `FIRECRAWL_API_KEY` as an environment variable)

**New file: `supabase/functions/scrape-race-results/index.ts`**
- Admin auth check (same pattern as other functions)
- Calls Firecrawl scrape API: `POST https://api.firecrawl.dev/v1/scrape` with `{ url, formats: ['markdown'], onlyMainContent: true }`
- Passes scraped markdown to Lovable AI with the `submit_race_results` tool schema
- Reuses the same DB insertion logic (create event, entries, match/create drivers, link junctions)
- Auto-enriches newly created drivers

**Modified file: `supabase/functions/generate-race-event/index.ts`**
- Before calling the AI, search the web using Firecrawl search: `POST https://api.firecrawl.dev/v1/search` with query `"${eventName} race results"`
- If search returns results, scrape the top result for markdown content
- Include the scraped content in the AI prompt as context: "Here is data from a results page: [markdown]. Extract structured race results from this."
- Fall back to AI-only generation if Firecrawl key is not configured or search returns nothing
- Add current date to system prompt and reject TBD/placeholder entries

**Modified file: `src/pages/Admin.tsx`**
- Add `importUrl` state and `handleImportFromUrl` function
- Add URL input field with "Import from URL" button in the AI Import tab
- Wire it to call the `scrape-race-results` edge function

**Updated file: `supabase/config.toml`**
- Register `scrape-race-results` function with `verify_jwt = false`

**No database changes needed.**

