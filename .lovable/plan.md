

# Fix: Convert Session Times to Track Time

## Status: IMPLEMENTED ✅

## Problem
The F1 website renders schedule times in a server-side timezone that differs from both the scraper's browser timezone and track time. The previous offset approach (MY TIME vs TRACK TIME) was unreliable because the schedule times and the clock indicator use different timezone sources.

## Solution
Instead of calculating timezone offsets, we now use Firecrawl's `actions` feature to click the "Track time" toggle on the F1 hub page before scraping. This makes the schedule render in track-local time directly — no math needed.

## Implementation
Single file: `supabase/functions/import-f1-sessions/index.ts`

- Added Firecrawl `actions` to the hub page scrape: wait 2s for page load, click `menu li:nth-child(2) button` (the "Track time" toggle), wait 1s for re-render
- Removed `extractTrackTimeOffsetMinutes` and `applyTimeOffset` helper functions
- Removed offset parameter from `parseScheduleFromHub` — times are used as-is since they're already in track time
