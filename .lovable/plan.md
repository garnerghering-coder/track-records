

## AI-Powered Race Results Ingestion

### Overview
Add an AI-powered import system where you can paste raw race results (from a website, PDF, timing sheet, etc.) and the AI automatically extracts structured data -- drivers, positions, teams, classes, gaps, and more. Results land in a "pending" approval queue so an admin can review and publish them with one click.

### How It Works

1. **New "Import Results" section in the Admin Dashboard**
   - A text area where you paste raw race results (copy from a timing page, PDF export, etc.)
   - Optionally provide event context (event name, series) to help the AI
   - Click "Process with AI" to send the text to the backend

2. **Backend AI processing (edge function)**
   - Receives the raw text and sends it to Lovable AI (Gemini Flash) with a structured prompt
   - The AI extracts: event name, series, year, location, category, and for each entry: finishing position, class position, car number, team name, driver name(s), race class, laps, gaps, pit stops, status
   - Uses tool calling to get clean structured JSON output
   - The function then matches driver names against existing `driver_profiles` (fuzzy match on first/last name)
   - Inserts a new `race_event` and `race_entries` with `verification_status: 'pending'`
   - For matched drivers, creates `race_entry_drivers` links; for unmatched ones, stores the name in a notes field for admin review

3. **Pending results approval queue**
   - New section in the Admin Dashboard showing events with pending entries
   - Admin can review the AI-extracted data, correct any mistakes, and then approve (sets status to 'verified') or reject entries
   - Approved results instantly appear on the public site and driver profiles

### Technical Details

**New edge function: `supabase/functions/import-race-results/index.ts`**
- Accepts `{ rawText: string, eventHint?: string, seriesHint?: string }` 
- Calls Lovable AI gateway with tool calling to extract structured race data
- Queries `driver_profiles` to match extracted driver names
- Inserts into `race_events`, `race_entries`, `race_entry_drivers` using the service role key
- Returns the created event ID and a summary of matched/unmatched drivers

**Database changes: None required**
- `race_entries` already has `verification_status` with a default of `'verified'` -- imported entries will explicitly use `'pending'`
- No schema changes needed

**Files modified:**
- `src/pages/Admin.tsx` -- Add an "Import Results" panel with a text area and "Process with AI" button, plus a pending approval queue showing events with pending entries where admin can approve/reject
- `supabase/config.toml` -- Register the new edge function with `verify_jwt = false`

**Files created:**
- `supabase/functions/import-race-results/index.ts` -- Edge function for AI parsing and database insertion

**How the AI extraction works:**
- Uses Lovable AI (google/gemini-3-flash-preview) via tool calling
- The tool schema defines the exact structure expected: event metadata + array of entries with driver names, positions, classes, gaps, etc.
- This ensures clean, typed output rather than fragile JSON parsing
- Driver matching uses case-insensitive name comparison against existing profiles

