
## JSON Template Import/Export for Session Results

### Overview
Add a "JSON Edit" button to the session dataset toolbar that opens a dialog where you can:
1. Copy a pre-filled JSON template (based on the current session type and columns, including any custom columns)
2. Edit or paste back completed JSON data
3. Apply it to fill/replace the table rows, with auto-calculation of Gap, Int, and Nat kicking in automatically

No AI required -- purely client-side JSON parsing.

---

### How It Works

1. **Button**: A new "JSON" button in the toolbar (next to "Import PDF" and "Add Column")
2. **Dialog**: Opens a full-screen-ish dialog with:
   - A "Copy Template" button that puts a JSON template into the clipboard, pre-configured for the session type with placeholder comments
   - A large textarea for pasting/editing JSON
   - An "Apply" button that parses the JSON, matches drivers/teams/cars by name (creating new ones if needed, same as PDF import), and populates the table
3. **Template structure**: An array of row objects with keys matching the current columns (including custom columns). Example for a practice session:

```json
[
  {
    "position": 1,
    "car_number": "44",
    "driver_name": "Max Verstappen",
    "team_name": "Red Bull Racing",
    "car_name": "RB20",
    "best_lap_time": "1:23.456",
    "laps_run": 15
  }
]
```

4. **After apply**: Gap, Int, and Nat columns auto-populate from the existing calculation and driver-lookup logic already in the codebase.

---

### Technical Details

**File modified: `src/pages/manage/ManageSessionResults.tsx`**

- Add state: `jsonDialogOpen`, `jsonText`
- Add a `generateTemplate()` function that builds a JSON array with one example row, keyed to the current session type and custom columns
- Add an `applyJson()` function that:
  - Parses the textarea content as JSON
  - Validates it is an array of objects
  - For each entry, fuzzy-matches `driver_name`, `team_name`, `car_name` against existing records (reusing the same logic from `handlePdfImport`)
  - Creates new drivers/teams/cars if no match found
  - Builds `ResultRow` objects and calls `setRows()`
  - Triggers `recalcFromBestLap()` on the new rows for auto Gap/Int
  - Fetches driver nationalities for auto Nat
- Add a "JSON" button in the toolbar
- Add a Dialog with:
  - A "Copy Template" button
  - A `<textarea>` (monospace, large)
  - "Apply" and "Cancel" buttons

**No new files or dependencies needed.** The dialog uses the existing `Dialog` component and the entity-matching logic already present in `handlePdfImport`.
