
## Combined Improvements: AI Speed, Scraping Quality, Motorsport Intelligence, Flags, Reject Logic, and Bulk Delete

### 1. Speed Up All AI Calls

Switch the AI model from `google/gemini-3-flash-preview` (slow preview) to `google/gemini-2.5-flash` (production-ready, faster) in all four edge functions:
- `generate-race-event/index.ts`
- `scrape-race-results/index.ts`
- `import-race-results/index.ts`
- `enrich-driver-profile/index.ts`

This should noticeably reduce response times.

### 2. Improve URL Scraping Quality

In `scrape-race-results/index.ts`:
- Increase the markdown sent to the AI from 30,000 to 80,000 characters to capture full results pages
- Enhance the system prompt to stress extracting ALL table rows, every car/entry, not just summarizing

### 3. Improve Name-Based Search (generate-race-event)

In `generate-race-event/index.ts`:
- Improve the Firecrawl search query to `"{eventName} full race results classification {year}"` for better hits
- If the first search returns no useful content, try a fallback search with simplified terms
- Increase scraped content limit from 40,000 to 80,000 characters

### 4. Motorsport Intelligence for Raw Text Import

In `import-race-results/index.ts`:
- Update the system prompt to instruct the AI to use motorsport domain knowledge: infer team names from car numbers (e.g., #31 Cadillac = Whelen Engineering Racing), normalize team names to official forms, infer class from car type/team, and correct abbreviations

### 5. Flag Images Instead of Emojis

**New file: `src/components/FlagImage.tsx`**
- A component that renders flag images from `flagcdn.com` (a free flag CDN) using ISO country codes
- Props: `nationality: string | null`, `size?: number` (default 20)
- Falls back to a globe icon if nationality is unknown

**Updated: `src/lib/countries.ts`**
- Add a `getCountryCode(nationality: string): string | null` function that maps nationality strings (like "Danish", "American", "Brazilian") and country names to ISO codes

**Updated UI files** -- replace all `getFlagForCountry()` emoji usage with `<FlagImage>`:
- `src/pages/Admin.tsx` (driver table, entry driver tags, search results)
- `src/pages/DriverProfile.tsx` (profile header)
- `src/pages/Search.tsx` (search results)
- `src/pages/EventDetail.tsx` (entry driver links)

### 6. Reject = Full Delete

Update `handleRejectEvent` in `Admin.tsx` to fully remove all data instead of just marking entries as "rejected":
- Delete all `race_entry_drivers` rows for the event's entries
- Collect the `driver_profile_id` values from those junction rows
- Delete all `race_entries` rows for the event
- Delete the `race_events` row itself
- For each linked driver where `is_claimed = false`, check if they have any remaining `race_entry_drivers` links; if not, delete that auto-created driver profile too
- Refresh all relevant lists afterward

### 7. Bulk Select and Delete for Drivers and Races

**All Drivers tab:**
- Add a `selectedDriverIds` state (Set)
- Add a checkbox column to the table with a "select all" checkbox in the header
- Show a "Delete Selected (N)" button when any are checked, with a confirmation dialog
- Bulk delete removes each selected driver, then clears the selection

**All Races tab:**
- Add a `selectedEventIds` state (Set)
- Same checkbox column and select-all pattern
- "Delete Selected (N)" button with confirmation dialog
- Uses the existing `handleDeleteEvent` logic for each selected event

---

### Technical Details

**Edge function changes (model swap + prompt improvements):**

| File | Changes |
|------|---------|
| `generate-race-event/index.ts` | Model to `gemini-2.5-flash`, improved search query with year + "full results classification", fallback search, content limit to 80k |
| `scrape-race-results/index.ts` | Model to `gemini-2.5-flash`, markdown slice to 80k, prompt emphasizes ALL entries |
| `import-race-results/index.ts` | Model to `gemini-2.5-flash`, system prompt adds motorsport knowledge instructions (team name inference, class inference, abbreviation normalization) |
| `enrich-driver-profile/index.ts` | Model to `gemini-2.5-flash` |

**New file: `src/components/FlagImage.tsx`**
- Takes `nationality` prop, calls `getCountryCode()` to get ISO code
- Renders `<img src="https://flagcdn.com/w40/{code}.png" width={size} height={size} />` with inline styling
- Falls back to Globe icon from lucide-react

**Updated: `src/lib/countries.ts`**
- New export: `getCountryCode(nationality: string): string | null`
- Maps demonyms ("Danish" -> "DK", "American" -> "US", "Brazilian" -> "BR", etc.) and country names to their ISO codes using the existing COUNTRIES array plus a demonym lookup table

**Updated: `src/pages/Admin.tsx`**
- Import `FlagImage` component, add `Checkbox` import
- Replace all `getFlagForCountry()` calls with `<FlagImage nationality={...} />`
- `handleRejectEvent`: full cascade delete (junction rows -> entries -> event -> orphaned unclaimed drivers)
- New state: `selectedDriverIds`, `selectedEventIds` (both `Set<string>`)
- Drivers table: checkbox column with select-all, "Delete Selected" button with AlertDialog
- Races table: checkbox column with select-all, "Delete Selected" button with AlertDialog

**Updated: `src/pages/DriverProfile.tsx`**
- Replace `getFlagForCountry()` with `<FlagImage>`

**Updated: `src/pages/Search.tsx`**
- Replace `getFlagForCountry()` with `<FlagImage>`

**Updated: `src/pages/EventDetail.tsx`**
- Replace `getFlagForCountry()` with `<FlagImage>`

**No database changes needed.**
