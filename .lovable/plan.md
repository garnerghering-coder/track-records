

## Race Results Management System

### Overview
Add a new "Race Results" tab to the Admin Dashboard that lets you enter results for an entire event at once. You search for drivers by name, select the correct one (handling duplicates like two "Felipe Nasr" entries), and save -- results are automatically verified and appear on each driver's profile page.

### How It Works

1. **New "Race Results" tab in Admin Dashboard**
   - You fill in the event details once at the top: Event Name (e.g. "24 Hours of Daytona"), Series Name, Season Year, and Category
   - Below that, you build a list of result entries by searching for drivers

2. **Driver search with disambiguation**
   - A search input lets you type a driver's name
   - A dropdown shows matching drivers with their photo, nationality flag, and category to help distinguish between drivers with the same name
   - Selecting a driver adds them to the results list for that event

3. **Per-driver result fields**
   - Once a driver is added to the event, you fill in their Finishing Position, Championship Position, and optional Notes
   - You can add as many drivers as needed and remove any before saving

4. **Bulk save with auto-verification**
   - Clicking "Save Results" inserts all entries into the `race_results` table with `verification_status: "verified"` (since admin-entered results are trusted)
   - Each result is linked to the correct `driver_profile_id`, so it immediately appears on their profile page with the verified badge

5. **Race results display on driver profile (already works)**
   - The existing driver profile page already shows race results with verification badges, so no changes needed there

### Technical Details

**Files modified:**
- `src/pages/Admin.tsx` -- Add a new "Race Results" tab containing:
  - Event-level fields (event name, series, year, category) at the top
  - A driver search input that queries `driver_profiles` with an `ilike` filter on first/last name
  - A results list where each row shows the selected driver + position fields
  - A bulk insert function that writes all results to `race_results` with `verification_status: 'verified'`

**No database changes needed** -- the existing `race_results` table and RLS policies already support admin inserts with verified status.

**No new dependencies** -- uses existing UI components (Input, Select, Button, Command/Popover for the search dropdown).

