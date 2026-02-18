

## Edit Verified Race Results and Remove "Race Results" Tab

### What Changes

1. **Remove the "Race Results" tab** from the admin tabs -- the manual event entry form is redundant since AI Import covers this workflow.

2. **Add an "Edit" button to each race in the "All Races" tab** that opens an inline expanded view showing all entries for that event, with the same click-to-edit behavior already built for the Pending tab. This lets you fix any detail on any race, whether it was AI-imported or manually created.

3. **Add an "Edit" button on the public Event Detail page** (visible only to admins) that links directly to the race's edit view in the admin panel.

### How Editing Works in All Races

- Click the **pencil icon** on any race row to expand it and load its entries
- The expanded section shows the same table as the Pending tab: position, car number, team, drivers, class, gap, status, notes
- Click any cell to edit it inline (same click-to-edit pattern already built)
- Event-level details (name, series, year, location, category) are also editable via an "Edit Event" button in the expanded header
- Changes save immediately to the database

### Technical Details

**File: `src/pages/Admin.tsx`**

- Remove the `race-results` TabsTrigger and TabsContent block (the manual entry form ~lines 915, 1154-1383)
- Remove associated state variables: `eventName`, `seriesName`, `seasonYear`, `eventCategory`, `eventLocation`, `eventDate`, `eventNotes`, `eventEntries`, `savingEvent`, `activeEntryKey`, `driverSearch`, `searchResults`, `searchOpen`, `searching`, and the manual entry helper functions (`addEntryRow`, `addDriverToEntry`, `removeDriverFromEntry`, `updateEventEntry`, `removeEventEntry`, `handleSaveEventResults`, `handleDriverSearch`)
- Add `expandedEventId` state to track which race row is expanded for editing
- When expanded, fetch that event's entries with drivers (reusing the same query pattern from `fetchPendingEvents`)
- Add `expandedEntries` state to hold the loaded entries
- Reuse existing `editingCell`, `editingCellValue`, `startEditCell`, `handleUpdateEntry` for cell editing -- these already work on `race_entries` table
- Reuse existing `editingEventId`, `editingEventFields`, `startEditEvent`, `handleUpdateEvent` for event header editing -- these already work on `race_events` table
- In the All Races table, add a pencil button per row that sets `expandedEventId` and fetches entries
- Below the row, render a collapsible section with the entries table (same structure as pending tab)

**File: `src/pages/EventDetail.tsx`**

- Add admin detection (same pattern as Header.tsx -- check `user_roles` for admin)
- If admin, show an "Edit in Admin" button in the event header that links to `/admin?edit={eventId}`
- On the Admin page, check URL params on load -- if `edit` param exists, auto-switch to "All Races" tab and expand that event

### No database changes needed

All updates use existing RLS policies (admin can update `race_entries` and `race_events`).
