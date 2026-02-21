

# Fix: Convert Session Times to Track Time

## Problem
The F1 website dynamically shows times in the visitor's local timezone. When our scraper fetches the page, it gets times in the scraper server's timezone rather than the circuit's local "track time."

## Solution
The scraped markdown already contains both clocks:
```
MY TIME11:17TRACK TIME19:17
```

We can extract both values, calculate the offset (e.g., +8 hours for Bahrain), and apply it to all session start/end times.

## Technical Details

### Single file change: `supabase/functions/import-f1-sessions/index.ts`

1. **Extract timezone offset from hub markdown**
   - Parse the line containing `MY TIME` and `TRACK TIME` using a regex like:
     `MY TIME(\d{1,2}:\d{2})TRACK TIME(\d{1,2}:\d{2})`
   - Calculate the offset in minutes between the two (e.g., 19:17 - 11:17 = +480 minutes)

2. **Apply offset in `parseScheduleFromHub`**
   - Accept the offset as a parameter
   - After parsing each session's `start_time` and `end_time`, add the offset to convert from "my time" to "track time"
   - Handle day wraparound (times crossing midnight stay as valid HH:MM)

3. **Pass offset through**
   - Extract the offset before calling `parseScheduleFromHub`
   - Pass it in so all schedule times are stored as track-local times

### Example
- Scraped: Practice 1 at 07:30 - 08:30 (server time)
- Offset: +8 hours
- Stored: Practice 1 at 15:30 - 16:30 (track time)

This is fully deterministic -- no AI, no external timezone API needed. Just simple arithmetic from data already present in the scraped page.

