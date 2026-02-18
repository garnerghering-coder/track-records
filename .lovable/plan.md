

## Fix Driver Profile "No Results" Bug + Discover Series Timeout

### Issue 1: "No race results yet" shown above actual results

The driver profile page has two separate results sections:
- **Legacy results** from the `race_results` table (lines 430-476) -- this shows "No race results yet" when empty
- **Event-based results** from `race_entry_drivers` joins (lines 479-516) -- this shows the actual imported race data

The problem: when the legacy table is empty but event-based results exist, the page displays "No race results yet" AND the actual results right below it.

**Fix in `src/pages/DriverProfile.tsx`:**
- Change the "No race results yet" condition to check BOTH `results.length === 0` AND `eventResults.length === 0`
- Only show that empty state when there are truly no results from either source

### Issue 2: Series Auto-Discovery "Failed to fetch"

The discover-series function works (logs confirm it discovered 12 events and started importing), but importing an entire season sequentially (each race involves scraping + AI parsing + database writes) takes many minutes. The browser's `fetch()` call times out before the function finishes, causing "Failed to fetch."

**Fix -- make the flow asynchronous with streaming progress:**
- Update the `discover-series` edge function to use **streaming responses** (Server-Sent Events / ReadableStream) so the connection stays alive and progress is sent incrementally
- Update the Admin UI `handleDiscoverSeries` to use `EventSource` or read from a streaming fetch, displaying each event's status as it arrives in real-time
- This prevents timeout and gives the admin a live progress log

### Technical Details

**File: `src/pages/DriverProfile.tsx`**
- Line 430: Change `results.length === 0` to `results.length === 0 && eventResults.length === 0`

**File: `supabase/functions/discover-series/index.ts`**
- Convert the response to use `TransformStream` / streaming
- Send each event's import status as a JSON line as it completes
- Return the final summary as the last streamed message

**File: `src/pages/Admin.tsx`**
- Update `handleDiscoverSeries` to read from a streaming response using `response.body.getReader()`
- Parse each line of progress and update UI state incrementally
- Show a live log of "Importing Round 1... done (30 entries)" as each event completes
- Display final summary when stream ends

