

## Enhancements: Publish Events, Car/Driver Numbers, PDF Import

Three features added to the manage section.

---

### 1. Publish/Unpublish Event from Event Detail Page

Currently the event detail page (`ManageEventDetail.tsx`) shows event status as a badge but provides no way to toggle it.

**Changes to `ManageEventDetail.tsx`:**
- Add a "Publish Event" / "Unpublish Event" button next to the event name/badge
- Clicking it updates `v2_events.status` to `published` or `draft`
- Also allow publishing all sessions within the event at once (optional bulk action)

---

### 2. Add Car Number and Driver Number to Results

The v2 result tables currently lack a `car_number` field (the old `race_entries` table had it). The uploaded PDF shows "NO" as a column -- this is the car/driver number.

**Database migration:**
- Add `car_number` (text, nullable) to `v2_race_results`, `v2_qualifying_results`, and `v2_practice_results`

**UI changes to `ManageSessionResults.tsx`:**
- Add a "No." column between Position and Driver in the results table
- Add `car_number` field to the `ResultRow` interface and `blankRow` function
- Include `car_number` in all save/load logic for all session types

---

### 3. PDF Upload and AI-Powered Autofill

Allow admins to upload a PDF results document (like the FIA classification sheet in the screenshot). An AI backend function parses it and pre-fills the session results form. The PDF is also stored for cross-reference.

**Database migration:**
- Add `source_document_url` (text, nullable) to `v2_sessions` to store the uploaded PDF path

**Storage:**
- Create a new storage bucket `session-documents` (private) for uploaded PDFs

**New edge function `parse-session-pdf`:**
- Receives the session ID and uploaded PDF file (as base64 or form data)
- Stores the PDF to the `session-documents` bucket
- Updates `v2_sessions.source_document_url` with the storage path
- Uses the Lovable AI gateway (google/gemini-2.5-flash -- supports document/image input) to extract structured results from the PDF
- Returns parsed rows (position, car number, driver name, team/entrant, lap time, gap, laps, etc.)
- Uses the existing `callAI` shared module

**UI changes to `ManageSessionResults.tsx`:**
- Add an "Import PDF" button at the top of the page (next to Save/Publish)
- Clicking it opens a file input dialog (accept=".pdf")
- On file selection, uploads to the edge function, shows a loading spinner
- On success, the returned parsed rows are mapped into the form:
  - Driver names are fuzzy-matched against existing `v2_drivers`; unmatched ones create new entries or leave as-is for manual review
  - Team names similarly matched against `v2_teams`
  - Car numbers, lap times, gaps, laps run, etc. are filled directly
- A toast confirms how many rows were imported
- The PDF link is shown on the page for reference (viewable/downloadable)

---

### Technical Details

**Edge function prompt strategy:**
The AI prompt will instruct the model to return JSON in a format matching the session type. The prompt will include the session type so it knows which fields to extract (practice times vs. qualifying segments vs. race results).

**Driver/team matching logic (client-side):**
After the AI returns parsed names, the frontend will:
1. Query existing `v2_drivers` and `v2_teams`
2. Do case-insensitive partial matching (e.g., "Lando NORRIS" matches "Lando Norris")
3. For unmatched names, auto-create new driver/team records via insert
4. Populate the autocomplete fields with the matched/created references

**Files to create:**
- `supabase/functions/parse-session-pdf/index.ts` -- new edge function

**Files to modify:**
- `src/pages/manage/ManageSessionResults.tsx` -- add No. column, PDF import button, source doc link
- `src/pages/manage/ManageEventDetail.tsx` -- add publish/unpublish event button

**Database migration (single migration):**
- Add `car_number` text column to `v2_race_results`, `v2_qualifying_results`, `v2_practice_results`
- Add `source_document_url` text column to `v2_sessions`
- Create `session-documents` storage bucket (private, admin-only upload)

