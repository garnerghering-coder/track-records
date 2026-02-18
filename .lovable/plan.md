

## Tweaks: Contributor Entries, Auto-Populate Teams, Logo Swap

Three changes in one pass.

---

### 1. Enhanced Contribute "Add Race Results" Entry Rows

The current entry row only has 6 fields (Position, Driver(s), Team, Car#, Class, Status). This update expands it to match admin-level data and adds autocomplete for drivers, teams, and series.

**Entry fields (updated):**
- Position (number, optional)
- Class Position (number, optional)
- Car # (text, optional)
- Team Name (text with autocomplete from `team_profiles`, optional)
- Driver(s) (text with autocomplete from `driver_profiles`, comma-separated, required)
- Laps (number, optional)
- Gap to Leader (text, optional)
- Gap to Class Leader (text, optional)
- Pits (number, optional)
- Class (text, optional)
- Status (dropdown: Finished, DNF, DNS, DSQ, DQ, Running -- optional)

**Autocomplete behavior:**
- **Driver names**: As the user types, suggest matching driver profiles (first + last name). User can pick a suggestion or type a new name. Works per-name (comma-separated).
- **Team name**: Suggest from `team_profiles` table as user types. Can still type a new team name.
- **Series name**: Suggest from distinct `series_name` values in `race_events`. Can still type a new one.

The submitted `proposed_data` in `edit_queue` will include all the new fields (`class_position`, `laps_completed`, `gap_to_leader`, `gap_to_class_leader`, `pit_stops`).

**File changed:** `src/pages/Contribute.tsx`

---

### 2. Auto-Populate Team Profiles from Existing Race Entries

Since there are 0 team profiles but ~100+ distinct team names in `race_entries`, we need a one-time seed plus ongoing logic.

**Approach: Admin-triggered "Seed Teams" button**
- Add a button on the Admin page Teams section (or as a one-time action): "Seed Teams from Results"
- When clicked, it:
  1. Fetches all distinct `team_name` values from `race_entries` where `team_profile_id IS NULL`
  2. Groups near-duplicates using case-insensitive matching (same logic as driver duplicates)
  3. Creates a `team_profiles` row for each unique team name (using the most common casing)
  4. Updates all matching `race_entries` rows to set `team_profile_id`
- This runs client-side using the existing admin RLS policies (admin can insert team_profiles and update race_entries)

**Team Duplicates tab in Admin:**
- Extend the existing `DuplicatesTab` pattern to also detect team duplicates
- Create a new `TeamDuplicatesTab` component with the same merge/dismiss UX
- Uses case-insensitive name matching to find potential duplicates (e.g., "AF Corse" vs "Af Corse", "JDC Miller MotorSports" vs "JDC-Miller MotorSports")
- Merging teams: reassign all `race_entries.team_profile_id` from secondary to primary, then delete secondary
- Add a `dismissed_team_duplicates` table (or reuse `dismissed_duplicates` with a type column) to track dismissed pairs

**Database change:** Add a `dismissed_team_duplicates` table (same structure as `dismissed_duplicates` but with `team_id_1` and `team_id_2`).

**Files changed/created:**
- `src/pages/Admin.tsx` (add Seed Teams button + Team Duplicates tab)
- `src/components/TeamDuplicatesTab.tsx` (new, modeled after DuplicatesTab)
- Database migration for `dismissed_team_duplicates`

---

### 3. Logo Swap in Header and Footer

Once you upload the logo image, it will be:
- Copied to `src/assets/logo-full.png` (replacing the current file) or saved as a new file
- Used in the Header to replace the current "TR" square icon + "TrackRecord" text with the logo image
- Used in the Footer to replace the current icon + text combination
- Sized appropriately (header: ~32-40px height, footer: ~28px height)

This step will be completed once the logo file is uploaded.

---

### Technical Summary

| Change | Files |
|--------|-------|
| Expanded entry form + autocomplete | `src/pages/Contribute.tsx` |
| Seed teams from results | `src/pages/Admin.tsx` |
| Team duplicates tab | `src/components/TeamDuplicatesTab.tsx` (new) |
| Dismissed team duplicates table | New migration |
| Logo swap | `src/components/Header.tsx`, `src/components/Footer.tsx` (after upload) |

