

## Bulk Column Edit for Race Entries

### What It Does

Adds the ability to select multiple race entries within an event and bulk-edit (or clear) a specific column for all of them at once. For example, you can select all entries and clear the "Class" column, or set all statuses to "Finished".

### How It Works

1. **Checkboxes on every entry row** -- A checkbox appears on each row in the entries table (used in both Pending and All Races expanded views). A "select all" checkbox in the header selects/deselects all entries for that event.

2. **Bulk action bar** -- When one or more entries are selected, a toolbar appears above the table with:
   - A dropdown to pick which column to edit (Class, Status, Team, Car #, Gap, Notes, etc.)
   - An input/select for the new value (or leave empty to clear the field)
   - An "Apply to Selected" button
   - A "Clear Field" button (shortcut to set the value to null for all selected)

3. **Database update** -- Clicking "Apply" runs a single Supabase update targeting all selected entry IDs for the chosen field.

### Technical Details

**File: `src/pages/Admin.tsx`**

- Add state: `selectedEntryIds: Set<string>`, `bulkField: string`, `bulkValue: string`
- Add a "select all" checkbox in the entries table header and per-row checkboxes in `renderEntriesTable`
- Add a bulk action bar rendered above the table when `selectedEntryIds.size > 0`
- Add a `handleBulkUpdateEntries` function that calls `supabase.from("race_entries").update({ [bulkField]: value }).in("id", [...selectedEntryIds])`, then refreshes the data and clears selection
- The editable columns will be: `race_class`, `status`, `team_name`, `car_number`, `gap_to_leader`, `gap_to_class_leader`, `notes`, `finishing_position`, `class_position`, `laps_completed`, `pit_stops`
- Status field uses a Select dropdown; all others use a text/number input
- Selection resets when switching between events or tabs

No database changes needed -- this uses the existing `race_entries` table and existing admin RLS policies.

