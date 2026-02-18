

## Three Admin Improvements: Edit Drivers on Entries, Data Anomaly Flags, and Date Sorting

### 1. Edit Drivers on Race Entries (Admin)

Currently, when you expand a race event in the Admin "All Races" or "Pending" tabs, you can inline-edit position, car number, team, class, gap, status, and notes -- but the Driver(s) column is read-only text. You need to be able to change which drivers are linked to an entry.

**What changes:**
- The Driver(s) column in `renderEntriesTable` becomes clickable for admins
- Clicking it opens a small inline editor that shows the currently linked drivers with remove buttons, plus a search input to add new drivers
- Adding a driver creates a `race_entry_drivers` junction row; removing deletes it
- The search uses existing `driver_profiles` data to find drivers by name

### 2. Data Anomaly Flags (New Admin Tab)

Add a new "Flags" tab in the Admin dashboard that automatically detects data quality issues. Initially it will detect:

- **Duplicate entry in same event**: A driver appears in multiple entries within the same race event (e.g., finishing in two different cars -- usually an error)
- **Missing drivers**: Entries with no linked drivers at all
- **Missing positions**: Entries with no finishing position

Each flagged item shows the event name, the problematic entry, and a "View" button that navigates to the event in the All Races tab for editing. Flags are computed client-side from the already-fetched data (entries + junctions).

**Detection approach:**
- Fetch all race entries with their driver junctions grouped by event
- For each event, check if any driver_profile_id appears in more than one entry
- Check for entries with zero drivers
- Check for entries with null finishing_position

### 3. Sort Race Results by Date + Show Date on Driver Profile Cards

On the Driver Profile page, event result cards currently sort by `season_year` descending and don't show the event date.

**What changes:**
- Sort `eventResults` by `event_date` (falling back to `season_year`) in descending order so most recent races appear first
- Add the event date to each result card, displayed as a small date string next to the series/year info
- The date is already available from the `race_events` join (`ev.event_date`)

### Technical Details

**Admin.tsx -- renderEntriesTable driver editing:**
- Replace the static driver name `<td>` with a clickable cell
- On click, show an inline panel with:
  - Current drivers listed with X buttons to remove (deletes from `race_entry_drivers`)
  - A text input that filters `drivers` state array by name
  - Clicking a search result inserts into `race_entry_drivers`
- After any change, refresh the entries table

**Admin.tsx -- New "Flags" tab:**
- Add a new tab trigger "Flags" with a badge count
- On tab activation, fetch all entries with driver junctions across all events
- Run anomaly detection:
  ```
  For each event:
    Group entries by event_id
    For each driver in the event, check if they appear in multiple entries
    Flag entries with 0 drivers
    Flag entries with null finishing_position
  ```
- Display flags in categorized sections with links to edit

**DriverProfile.tsx -- Date sorting and display:**
- Change the sort on line 114 from sorting by `season_year` to sorting by `event_date` (with `season_year` as fallback)
- Add `event_date` display to the card (line 498 area), showing it as a formatted date next to the existing series/year text

**Files to modify:**
- `src/pages/Admin.tsx` -- Add driver editing in entries table, add Flags tab
- `src/pages/DriverProfile.tsx` -- Sort by date, show date on cards

**No database changes needed.**
