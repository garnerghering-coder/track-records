

## Smarter AI Automation: Auto-Enrich Drivers and Auto-Generate Races

### Overview

Two new backend functions that use AI to do the heavy lifting, so you barely need to type anything:

1. **Auto-Enrich Driver Profiles** -- Whenever a driver is created (via import or manually), an AI function researches and fills in nationality, bio, primary category, date of birth, and social links automatically.

2. **Auto-Generate Race from Name** -- Enter just a race name (e.g. "2025 Rolex 24 at Daytona") and the AI researches and generates the full event with all entries, drivers, positions, teams, and classes -- all landing in the pending queue for review.

### Feature 1: Auto-Enrich Driver Profiles

**How it works:**
- New edge function `enrich-driver-profile` that takes a driver profile ID
- Calls Lovable AI (Gemini Flash) with the driver's name and asks it to research and return: nationality, a short bio, date of birth, primary racing category, and social media URLs
- Updates the driver profile with the AI-generated data (only fills in fields that are currently empty)
- Called automatically after the import function creates new drivers, and also available as a manual "Enrich with AI" button in the Admin panel on any driver

**Admin UI changes:**
- Add a sparkle/magic button next to each driver in the "All Drivers" tab that triggers enrichment
- Add a "Bulk Enrich" button that enriches all drivers missing key info (nationality, bio, etc.)
- After import completes, automatically enrich all newly created driver profiles

### Feature 2: Auto-Generate Race from Name

**How it works:**
- New edge function `generate-race-event` that takes just a race/event name string
- Calls Lovable AI with a prompt like: "Research the race event '[name]'. Return the full results including all entries with driver names, finishing positions, teams, car numbers, classes, gaps, laps, and status."
- Uses the same tool-calling schema as the import function for structured output
- Reuses the same database insertion logic: creates/finds the event, creates entries, matches/creates driver profiles, links everything
- Everything lands as "pending" for admin review

**Admin UI changes:**
- Replace (or supplement) the current AI Import text area with a simpler "Generate Race" input: just type a race name and click "Generate"
- The existing raw-text import stays available as an "Advanced Import" option for when you have timing sheet data to paste
- Add the generated event to the pending queue automatically

### Technical Details

**New edge function: `supabase/functions/enrich-driver-profile/index.ts`**
- Accepts `{ driverProfileId: string }` (or `{ driverProfileIds: string[] }` for bulk)
- Requires admin auth (same pattern as import function)
- Calls Lovable AI with tool calling, tool schema:
  - `nationality` (string, e.g. "Danish")
  - `bio` (string, 2-3 sentence description of the driver's career)
  - `date_of_birth` (string, ISO date or null)
  - `primary_category` (enum matching existing racing categories)
  - `social_website`, `social_instagram`, `social_twitter`, `social_linkedin` (URLs or null)
- Updates `driver_profiles` row, only overwriting fields that are currently null/empty
- Returns the enriched data so the UI can show what changed

**New edge function: `supabase/functions/generate-race-event/index.ts`**
- Accepts `{ eventName: string }`
- Requires admin auth
- Calls Lovable AI with a research prompt and the same `submit_race_results` tool schema used by import
- Reuses the same DB insertion logic: check for existing event, create entries, match/create drivers, link via junction table
- After inserting, calls the enrich function for any newly created drivers
- Returns event ID and summary

**Files modified:**
- `src/pages/Admin.tsx` -- Add "Generate Race" input field in the AI Import tab (simple name-only input above the existing text area); add "Enrich" button per driver in All Drivers tab; add "Bulk Enrich" button; wire up the new edge function calls
- `supabase/config.toml` -- Register two new functions with `verify_jwt = false`

**Files created:**
- `supabase/functions/enrich-driver-profile/index.ts`
- `supabase/functions/generate-race-event/index.ts`

**No database changes needed** -- all fields already exist on `driver_profiles` and `race_events`.

**No new dependencies needed.**

