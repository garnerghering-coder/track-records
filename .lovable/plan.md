

## Four Fixes for Track Records

### 1. Series Profile: Show V2 Events

**Problem**: The Series Profile page (`/series/:id`) only queries the V1 `race_events` table. Published V2 events live in `v2_events`, linked through `v2_seasons` (which has a `series_id` foreign key to `v2_series`).

**Fix**: In `src/pages/SeriesProfile.tsx`, add a second query that fetches V2 events by joining `v2_events -> v2_seasons -> v2_series` where `v2_series.id` matches the series ID. Merge both V1 and V2 events into the display, with V2 events linking to `/events/:id` instead of `/event/:id`. The series ID used in the URL corresponds to the `series` table (V1), so we also need to check if there's a matching `v2_series` record (by name) and include those events too.

---

### 2. Public Results: Add Car Number Column + Custom Columns

**Problem**: The `EventPage.tsx` session results table is missing the "No." (car number) column. Also, any custom columns added during data entry are not displayed.

**Fix**: In `src/pages/EventPage.tsx`:
- Add a `No.` column between `Pos` and `Driver` in all session type table layouts, displaying `r.car_number`
- For custom columns: since custom column data would need to be stored in the database to be displayed publicly (currently they're only in-memory during editing), we'll add the `car_number` fix now. Custom column persistence is a separate database migration task -- noted below.

**Note on custom columns**: Currently custom columns exist only in the manage UI's local state and are not saved to the database. To display them publicly, we'd need a JSONB `extra_data` column on each result table. This plan will add that database migration and wire it up end-to-end so custom columns persist and display publicly.

---

### 3. PDF Export: Fix and Redesign Without AI

**Problem**: The Export PDF button calls `exportSessionPdf` which uses jsPDF. It needs to:
- Actually work (currently it does use jsPDF which should work client-side, but may be missing car_number)
- Include the uploaded Track Records black logo as a header image
- Include car number column
- Include custom column data

**Fix**: In `src/lib/pdf-export.ts`:
- Copy the uploaded logo image to `src/assets/track-records-logo.png` and convert it to a base64 data URI for embedding in the PDF via `doc.addImage()`
- Add "No." column to all table layouts (between Pos and Driver)
- Accept optional `customColumns` parameter and append those to the table
- Keep the existing jsPDF approach -- no AI involved, purely client-side rendering

---

### 4. Drag-and-Drop Column and Row Reordering in Manage

**Problem**: Admins want to reorder columns and rows by dragging.

**Fix**: In `src/pages/manage/ManageSessionResults.tsx`:
- **Row reordering**: Make table rows draggable using HTML5 drag-and-drop (no extra library needed). Each row gets `draggable`, `onDragStart`, `onDragOver`, `onDrop` handlers. Dropping a row between others reorders the `rows` array and auto-updates position numbers.
- **Column reordering**: Store the column order in state as an array of column keys (e.g., `["position", "car_number", "driver", "team", "car", "best_lap_time", ...]`). Column headers get drag handles. Dragging a column header to a new position reorders the array, which changes both the header and cell render order. This applies to the fixed columns as well as custom columns.

---

### Technical Details

**Files to modify:**

1. **`src/pages/SeriesProfile.tsx`** -- Add V2 event query via `v2_events` joined through `v2_seasons` where series matches
2. **`src/pages/EventPage.tsx`** -- Add `car_number` column to all three table layouts (practice, qualifying, race); add custom column rendering from `extra_data` JSONB
3. **`src/lib/pdf-export.ts`** -- Add logo image embedding via `addImage()`, add car number column, accept custom columns param
4. **`src/pages/manage/ManageSessionResults.tsx`** -- Add HTML5 drag-and-drop for rows and columns; wire up `extra_data` JSONB saving for custom columns
5. **Copy logo asset** -- `user-uploads://Untitled_design_-_2026-02-19T131913.407.png` to `src/assets/track-records-logo.png`

**Database migration needed:**
- Add `extra_data JSONB DEFAULT '{}'` column to `v2_race_results`, `v2_qualifying_results`, and `v2_practice_results` tables to persist custom column data

**No new dependencies required** -- HTML5 drag-and-drop is native browser API, jsPDF is already installed.
