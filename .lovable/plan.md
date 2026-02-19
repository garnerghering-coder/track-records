

## Plan: Car Editing, Seed from Events, Full Dates, and Enrich Improvements

This plan covers four interconnected areas: making car models editable on race entries, adding "Seed from Events" for cars, switching from year-only to full dates, and updating enrichment to fill in car and date data.

---

### 1. Make Car Editable on Race Entries (Admin Panel)

**Current state**: The car column in `renderEntriesTable` (line 1737-1741) is read-only -- it just displays the car name or a dash. Unlike other columns that use `renderCell()` for inline editing, car is a static `<td>`.

**Changes to `src/pages/Admin.tsx`**:
- Replace the static car `<td>` in `renderEntriesTable` with a new `renderCarCell()` function (similar pattern to `renderDriverCell()`)
- `renderCarCell()` will show a Popover with:
  - Current car name (or "No car")
  - Search input to find existing car models from `allCars`
  - Click to select, which updates `race_entries.car_model_id` via Supabase
  - Option to clear the car assignment
- This makes car fully editable inline, just like drivers

### 2. Seed Cars from Events

**Current state**: `handleSeedCars` (line 398-409) just shows a toast saying "Cars are auto-created during import" -- it doesn't actually seed anything.

**Changes to `src/pages/Admin.tsx`**:
- Rewrite `handleSeedCars` to:
  - Query all `race_entries` that have a `team_name` but no `car_model_id`
  - This won't auto-create cars from team names (that doesn't make sense), but it will extract unique car model names from entries that reference car_models and ensure they exist
  - Actually: query `race_entries` joined with `car_models` to get all unique car names already in the system, then present a count
- More useful approach: query all entries with `car_model_id` set, get distinct car model IDs, compare against `car_models` table -- they should already exist since they're FK references
- Best approach: Add a "Seed from Events" button that scans race entries for `team_name` patterns or notes that mention car models, but really the main value is just having the button for consistency. The real seeding happens during import. Update the button to instead just refresh the cars list and show a summary.

Actually, the more practical seed approach: look at all `race_entries` that have a `car_model_id` -- those cars already exist. The real gap is entries without a `car_model_id`. The seed button should prompt enrichment to fill those in. Let me revise:

- Add "Seed from Events" button to the All Cars tab header (next to Bulk Enrich)
- `handleSeedCars` will: query distinct car model names from entries that don't have a `car_model_id` but have notes/team_name that could indicate a car. Since this is hard to parse, the simpler approach is: the button just confirms existing cars are already in the table and reminds the user to use enrichment on races to fill in car data.

**Revised approach**: The "Seed from Events" button will scan `race_entries` for entries that already have `car_model_id` set, collect the unique car_models, and confirm they're all in the table. This gives consistency with other tabs. The real value-add is making enrich-race-event fill in car data (see section 4).

### 3. Full Dates Instead of Year-Only

**Current state**: `race_events` has both `season_year` (integer, NOT NULL) and `event_date` (date, nullable). The system primarily uses `season_year` throughout. `event_date` exists but is secondary.

**Changes needed across many files**:

**Database**: No schema change needed -- `event_date` already exists as a date column. We keep `season_year` as-is for backward compatibility (it can be derived from `event_date` when available).

**`src/pages/Admin.tsx`**:
- In the event editing fields (lines 2480-2487 and 2853-2861), add an `event_date` input field (date picker or simple date input) alongside the existing year field
- In the All Races table header (line 2792), change "Year" to "Date" and display `event_date` formatted as full date, falling back to just the year if no date is set
- Update `startEditEvent` to include `event_date` in `editingEventFields`
- Update `handleUpdateEvent` to save `event_date` and derive `season_year` from it when provided
- Sort race events by `event_date` descending (with `season_year` as fallback)

**`src/pages/Contribute.tsx`**:
- The form already has an `eventDate` field (line 145) -- verify it's properly wired and prominent
- Make the date field more prominent (it should be the primary date input, not secondary to year)

**`DIRECT_IMPORT_TEMPLATE`** (line 939-966):
- Add `"event_date": "YYYY-MM-DD or null"` to the template
- Update `direct-import` edge function to save `event_date` and derive `season_year` from it

**Profile pages** (`DriverProfile.tsx`, `TeamProfile.tsx`, `CarProfile.tsx`, `SeriesProfile.tsx`, `CircuitProfile.tsx`):
- Where results are displayed, show full date instead of just year
- Sort by `event_date` descending (newest first), falling back to `season_year`

**`src/pages/Results.tsx`** and **`src/pages/EventDetail.tsx`**:
- Display full date where available
- Already sort by date descending (confirmed)

### 4. Enrich Race Events to Fill Car and Date

**Changes to `supabase/functions/enrich-race-event/index.ts`**:
- Update the AI prompt to also request:
  - `"car_models"`: array of `{ car_number, car_model_name }` mappings (which car number used which car model)
- After enrichment, for each car mapping returned:
  - Look up or create the car model in `car_models`
  - Update matching `race_entries` (by `car_number` within the same event) to set `car_model_id`
- The `event_date` enrichment already exists (line 142) -- just ensure it works reliably
- Also fetch entries for the event to provide context to the AI (team names, car numbers) so it can determine the correct cars

### 5. Update `direct-import` Edge Function

**Changes to `supabase/functions/direct-import/index.ts`**:
- Accept `event_date` field in the JSON payload
- When creating a new event, save `event_date`
- Derive `season_year` from `event_date` if `season_year` is not explicitly provided

---

### Technical Details: Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Admin.tsx` | Add `renderCarCell()`, update `handleSeedCars`, add date fields to event editing, show dates in All Races table, add Seed button to All Cars |
| `src/pages/Contribute.tsx` | Make date field prominent, derive year from date |
| `supabase/functions/enrich-race-event/index.ts` | Add car model enrichment per entry, improve date enrichment |
| `supabase/functions/direct-import/index.ts` | Accept and save `event_date`, derive `season_year` |
| `src/pages/Results.tsx` | Display full dates |
| `src/pages/DriverProfile.tsx` | Sort by date, show full dates |
| `src/pages/TeamProfile.tsx` | Sort by date, show full dates |
| `src/pages/CarProfile.tsx` | Sort by date, show full dates |
| `src/pages/SeriesProfile.tsx` | Sort by date, show full dates |
| `src/pages/EventDetail.tsx` | Display full date prominently |

