

## Comprehensive Results & Driver Enhancement

This plan covers several interconnected changes: persisting column order, fixing styling, enhancing driver creation, adding nationality display, adding an "Int" (interval) column, and implementing auto-calculation for lap time fields.

---

### 1. Persist Column Order on Save/Publish

**Problem**: When you reorder columns via drag-and-drop, the order is lost on save because it's not stored anywhere.

**Solution**: Add a `column_order JSONB` column to the `v2_sessions` table. When saving/publishing, persist the current `columnOrder` array. When loading, read it back and initialize `columnOrder` from it.

- **Database migration**: `ALTER TABLE v2_sessions ADD COLUMN column_order jsonb DEFAULT NULL;`
- **ManageSessionResults.tsx**: On save, include `column_order` in the session update. On load, initialize `columnOrder` from `session.column_order` if present.

---

### 2. Fix Gap Column Styling

**Problem**: The Gap column in the public results view uses `text-muted-foreground` class, making it appear a different color than other mono-spaced values.

**Solution**: In `EventPage.tsx`, remove the `text-muted-foreground` class from Gap cells (`gap_to_p1`, `gap_to_pole`) so they use the same styling as Best Lap and other time fields.

---

### 3. Driver Quick-Create: Add Nationality + DOB, Remove Short Name

**Problem**: When creating a new driver inline (via the autocomplete "Create new driver" flow), only the name is captured. Users want to set nationality and DOB at creation time. The 3-letter code ("short_name") is not needed anywhere.

**Changes**:

- **QuickCreateModal.tsx**: For `entityType === "driver"`, add Nationality and Date of Birth fields (using the existing `extra` and `extra2` state). Pass nationality and date_of_birth in the insert payload.
- **ManageDrivers.tsx**: Remove the "Code" column from the table header and body. Remove the Short Name field from the edit form. Keep nationality and DOB.
- **EventPage.tsx**: Remove references to `v2_drivers.short_name` from the select query.
- **Site-wide**: The `short_name` column stays in the database but is no longer displayed or collected.

---

### 4. Auto "Nat" Column Next to Driver

**Problem**: The nationality flag should automatically appear next to the driver name, using the FlagImage component and flagcdn.com images.

**Changes**:

- **ManageSessionResults.tsx**: 
  - Add "nat" as a built-in column in `getDefaultColumns()`, right after "driver"
  - The "nat" column is auto-populated -- it reads the driver's nationality from the driver record and displays a small flag. No user input needed.
  - Fetch driver nationality data when loading results (already selecting `v2_drivers`)-- add `nationality` to the select.
  - Store `_driverNationality` on each row for display purposes.

- **EventPage.tsx**: 
  - Add "Nat" column after "Driver" in the public table
  - Fetch `v2_drivers(full_name, nationality)` 
  - Display FlagImage component

- **PDF export**: Add a "Nat" text column (3-letter country code since images can't go in jsPDF easily).

---

### 5. Built-in "Int" (Interval) Column

**Problem**: "Int" (interval to car ahead) should be a standard column, shown next to Gap.

**Changes**:

- **Database**: No new database column needed -- Int can be stored in `extra_data` under the key "Int", or we can add a dedicated `interval_to_ahead` column. Using `extra_data` is simpler and already works end-to-end.
- **ManageSessionResults.tsx**: Add "gap_int" as a built-in column in `getDefaultColumns()` for all session types, positioned after the gap column. Map it to `extra_data.Int` on save and load.
- **EventPage.tsx**: Display the "Int" value from extra_data.
- **PDF export**: Include "Int" column.

---

### 6. Auto-Calculation: Best Lap / Gap / Int

**Problem**: For practice (and all session types), when you type a Best Lap time, the system should auto-calculate Gap (difference to P1's best lap) and Int (difference to the row above). Editing any one of these three should update the others where possible.

**Implementation approach** (pure client-side math, no AI):

- **Time parsing utility functions**:
  - `parseTime(str)` -- converts "M:SS.mmm" or "SS.mmm" to milliseconds
  - `formatGap(ms)` -- formats a millisecond difference as "+S.mmm", "+SS.mmm", or "+M:SS.mmm"
  - `formatLapTime(ms)` -- formats milliseconds as "M:SS.mmm"

- **Auto-recalculation logic** in ManageSessionResults.tsx:
  - When Best Lap changes on any row: recalculate Gap (= row's best lap - P1's best lap) and Int (= row's best lap - previous row's best lap)
  - When Gap changes on a row: recalculate Best Lap (= P1's best lap + gap) and Int
  - When Int changes on a row: recalculate Best Lap (= previous row's best lap + int) and Gap
  - A flag tracks which field the user is currently editing to avoid circular updates
  - This applies to practice (best_lap_time, gap_to_p1, gap_int), qualifying (best_time, gap_to_pole, gap_int), and race (fastest_lap_time equivalents where applicable)

---

### Technical Details

**Database migration** (one statement):
```sql
ALTER TABLE v2_sessions ADD COLUMN IF NOT EXISTS column_order jsonb DEFAULT NULL;
```

**Files to modify**:

1. **`src/pages/manage/ManageSessionResults.tsx`**
   - Add `column_order` persistence on save
   - Load `column_order` from session data
   - Add "nat" and "gap_int" as built-in columns
   - Add auto-calculation logic for Best Lap / Gap / Int
   - Fetch driver nationality in the select query
   - Map "gap_int" to extra_data.Int on save/load

2. **`src/pages/EventPage.tsx`**
   - Remove `text-muted-foreground` from Gap cells
   - Add "Nat" column with FlagImage
   - Add "Int" column from extra_data
   - Remove `short_name` from driver select, add `nationality`

3. **`src/components/manage/QuickCreateModal.tsx`**
   - For driver: add Nationality and Date of Birth fields

4. **`src/pages/manage/ManageDrivers.tsx`**
   - Remove "Code" / short_name column and form field

5. **`src/lib/pdf-export.ts`**
   - Add "Nat" and "Int" columns to all table layouts

6. **`src/components/manage/AutocompleteField.tsx`**
   - For driver autocomplete: also fetch `nationality` so we can populate the nat column when a driver is selected

**No new dependencies needed.** FlagImage component already exists and uses flagcdn.com.

