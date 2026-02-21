

# Auto-Import F1 Sessions and Results (No AI)

## Overview
Add a button to the event detail page that lets you paste a formula1.com race URL (e.g., `https://www.formula1.com/en/racing/2025/bahrain`). The system will scrape all session pages, parse the results using deterministic regex/text parsing, and create draft sessions with fully populated results -- all without AI.

## How It Works

**Step 1 -- You paste the F1 race URL**
A dialog on the ManageEventDetail page accepts a URL like `https://www.formula1.com/en/racing/2025/bahrain`.

**Step 2 -- Edge function scrapes and parses (no AI)**
A new backend function (`import-f1-sessions`) does the following:
1. Scrapes the race hub page via Firecrawl to discover which sessions exist (Practice 1, Practice 2, Practice 3, Qualifying, Race) and their result page URLs
2. Scrapes each result page individually
3. Parses the markdown tables using regex -- the F1 site has a very consistent format:
   - Driver names come as `OscarPiastriPIA` -- regex splits on camelCase boundaries to extract first/last name
   - Car numbers, teams, lap times, gaps, laps, points are all in fixed table columns
   - Qualifying has Q1/Q2/Q3 columns; Practice has Time/Gap + Laps; Race has Laps + Time/Retired + Pts

**Step 3 -- Smart matching against existing data**
Before inserting, the function queries your existing `v2_drivers`, `v2_teams`, and `v2_cars` tables and tries to match:
- **Drivers**: Exact full name match, then fuzzy first+last match, then abbreviated match (e.g., "L. Norris" -> "Lando Norris"). Only creates new records if no match found.
- **Teams**: Case-insensitive name matching against existing team records. Creates new ones only if not found.
- **Cars**: For F1, car models are typically not listed on the results page, so this field would be left empty (you can fill it in manually or via a mapping).

**Step 4 -- Sessions created as drafts**
Each session is created in `v2_sessions` with status "draft", and its results go into the appropriate table (`v2_practice_results`, `v2_qualifying_results`, or `v2_race_results`). You review and publish when ready.

## What Gets Imported Per Session Type

| Session Type | Fields Imported |
|---|---|
| Practice 1/2/3 | Position, Car #, Driver, Team, Best Lap Time, Gap to P1, Laps Run |
| Qualifying | Position, Car #, Driver, Team, Q1, Q2, Q3, Laps |
| Race | Position, Car #, Driver, Team, Laps Completed, Total Time/Gap, Points, Status (DNF/DSQ) |

## UI Changes

- **ManageEventDetail page**: Add an "Import from F1.com" button next to the "Add Session" button
- Clicking it opens a dialog where you paste the URL
- Shows a progress indicator while scraping/parsing
- On completion, shows a summary: "Created 5 sessions with 20 entries each. 18 drivers matched, 2 new drivers created."
- Sessions appear as draft cards ready for review

## Technical Details

### New Edge Function: `import-f1-sessions`
- Receives: `{ url: string, event_id: string }`
- Uses Firecrawl to scrape the hub page, extracts result page URLs via regex
- Scrapes each result page, parses the markdown table rows
- Driver name parsing: regex pattern `/^([A-Z][a-z]+)([A-Z][a-z]+(?:\s[a-z]+)*)([A-Z]{3})$/` handles names like `OscarPiastriPIA`, `MaxVerstappenVER`, `KimiAntonelliANT`
- Matches drivers/teams against existing DB records using case-insensitive comparison and fuzzy matching
- Inserts sessions + results into V2 tables
- Returns summary of what was created/matched

### Duplicate Prevention
- Before creating sessions, checks if sessions with the same name already exist for this event
- Driver matching uses a multi-step strategy: exact match, then first+last name match, then partial/abbreviated matching
- Team matching is case-insensitive with common alias handling (e.g., "Haas F1 Team" matches "Haas")

### Files to Create/Modify
1. **Create** `supabase/functions/import-f1-sessions/index.ts` -- the edge function with scraping + parsing logic
2. **Modify** `src/pages/manage/ManageEventDetail.tsx` -- add import button and dialog
3. **Update** `supabase/config.toml` -- register the new function with `verify_jwt = false`

