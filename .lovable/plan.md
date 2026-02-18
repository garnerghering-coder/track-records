

## Add Inline Editing for Pending Race Entries

### What This Adds

When reviewing AI-imported results in the **Pending** tab, you'll be able to click on any cell in the table to edit it directly. This way if the AI got a position, team name, car number, class, or any other detail wrong, you can fix it right there before approving.

### How It Works

1. **Click any cell to edit** -- Each row in the pending entries table becomes editable. Click a value (position, car number, team, class, gap, status, notes) to turn it into an input field.
2. **Save on blur or Enter** -- When you click away or press Enter, the change saves to the database immediately.
3. **Visual feedback** -- Edited cells get a subtle highlight so you can see what you've changed. A toast confirms each save.
4. **Edit event details too** -- The event header (name, series, year, location) will also be editable via a small edit button.

### Technical Details

**File: `src/pages/Admin.tsx`**

1. Add state for tracking which cell is being edited: `editingCell: { entryId: string, field: string } | null`
2. Add state for the editing event header: `editingEventId: string | null` with fields for event name, series, year, location
3. Add an `handleUpdateEntry` function that calls `supabase.from("race_entries").update({...}).eq("id", entryId)` for individual field updates
4. Add an `handleUpdateEvent` function that calls `supabase.from("race_events").update({...}).eq("id", eventId)` for event-level edits
5. Replace the static `<td>` cells in the pending entries table with a component that renders an `<Input>` when that cell is active, and plain text otherwise
6. Add a small pencil icon button on the event header row to toggle editing the event name/series/location
7. After each save, refresh pending events via `fetchPendingEvents()`

**Editable fields per entry:**
- Finishing position (number input)
- Car number (text input)
- Team name (text input)
- Class (text input)
- Gap to leader (text input)
- Status (dropdown: Finished / DNF / DNS / DSQ)
- Notes (text input)

**Editable fields per event:**
- Event name
- Series name
- Season year
- Location
- Category

No database changes needed -- all updates use existing RLS policies (admin can update race_entries and race_events).

