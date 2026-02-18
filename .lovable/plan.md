

## Direct JSON Import (No AI Required)

### Concept

Add a "Direct Import" mode to the Admin page that lets you:
1. Copy a ready-made JSON template from the admin UI
2. Paste it into ChatGPT / Claude / any AI yourself
3. Get back structured JSON
4. Paste the JSON back into the admin UI
5. It imports directly -- no backend AI calls, no API keys needed

### What Changes

**1. New Edge Function: `supabase/functions/direct-import/index.ts`**

A new backend function that accepts pre-structured JSON (same schema the AI currently outputs) and does the import logic (create event, match/create drivers, insert entries, fire enrichment). This is essentially the second half of `import-race-results` -- everything after the AI call -- extracted into its own function. No AI calls whatsoever.

Input payload:
```json
{
  "event_name": "Monaco Grand Prix",
  "series_name": "Formula 1",
  "season_year": 2025,
  "location": "Monte Carlo",
  "category": "formula",
  "entries": [
    {
      "finishing_position": 1,
      "car_number": "1",
      "team_name": "Red Bull Racing",
      "driver_names": ["Max Verstappen"],
      "race_class": null,
      "laps_completed": 78,
      "status": "Finished"
    }
  ]
}
```

**2. Admin UI: New tab or mode within "AI Import" tab**

Add a toggle/sub-tab in the existing AI Import section with two modes:
- **AI Import** (existing) -- paste raw text, AI parses it
- **Direct JSON Import** (new) -- paste pre-structured JSON, no AI

The Direct Import mode will include:
- A "Copy Template" button that copies the JSON schema + instructions to clipboard (ready to paste into ChatGPT)
- A JSON textarea for pasting the structured result back
- Basic client-side validation (is it valid JSON? does it have `entries`?)
- An "Import" button that sends it to the new `direct-import` function

**3. File: `src/pages/Admin.tsx`**

- Add state for the direct import mode (`directJsonText`, `directImporting`)
- Add a sub-tab toggle within the ai-import tab content
- Add the template copy button + JSON textarea + import button
- Add the handler that calls the new `direct-import` edge function

### The Copyable Template/Prompt

The "Copy Template" button will copy something like:

```
Parse these race results into this exact JSON format. Return ONLY valid JSON, no explanation:

{
  "event_name": "string",
  "series_name": "string",
  "season_year": number,
  "location": "string or null",
  "category": "one of: karting, single_seater, gt, touring_car, sports_car, rally, endurance, formula, stock_car, other",
  "entries": [
    {
      "finishing_position": number or null,
      "class_position": number or null,
      "car_number": "string or null",
      "team_name": "string or null",
      "driver_names": ["array of full driver name strings"],
      "race_class": "string or null",
      "laps_completed": number or null,
      "gap_to_leader": "string or null",
      "gap_to_class_leader": "string or null",
      "pit_stops": number or null,
      "status": "Finished, DNF, DNS, or DSQ"
    }
  ]
}

Here are the results to parse:
[PASTE YOUR RESULTS HERE]
```

### Technical Details

- The `direct-import` edge function reuses the same driver matching logic from `import-race-results` (exact match, partial match, abbreviated match, auto-create)
- Admin auth check is identical to `import-race-results`
- The function skips all AI calls entirely -- it just validates the JSON structure and runs the database inserts
- Client-side validation checks for valid JSON and presence of `entries` array before sending
- `supabase/config.toml` gets a `[functions.direct-import]` entry with `verify_jwt = false`

### No Database Changes

No new tables or migrations needed. The function writes to the same `race_events`, `race_entries`, and `race_entry_drivers` tables.
