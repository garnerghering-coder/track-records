

## Fixes and New Features

### 1. Prevent Duplicate Race Events from AI Import

**Problem:** When importing Rolex 24 results, the AI created two separate events with different categories (endurance vs sports_car).

**Fix:** Update the edge function (`supabase/functions/import-race-results/index.ts`) to check for an existing event with the same name, series, and year before inserting. If a match is found, add entries to the existing event instead of creating a new one. This prevents duplicates from partial imports or retries.

### 2. Rename "Event Results" to "Race Results" on Driver Profile

**Problem:** On the driver profile page, results from the new tables show under a heading called "Event Results" separate from "Race Results."

**Fix:** In `src/pages/DriverProfile.tsx`, merge both result sections under a single "Race Results" heading. The event-based results will be displayed alongside (or below) the legacy race_results data, all under the same heading.

### 3. Add "All Races" Tab to Admin Panel

**Problem:** There is no way for admins to browse all race events in the admin panel.

**Fix:** Add a new "All Races" tab in `src/pages/Admin.tsx` that lists all race events from the `race_events` table, similar to the "All Drivers" tab. Each row shows event name, series, year, category, location, entry count. Actions include: view (navigate to `/event/:id`), delete event (with confirmation).

### 4. Add "Report" Button to Races and Driver Profiles

**Problem:** Users cannot report incorrect information on driver profiles or race event pages.

**Fix:**
- Create a new `reports` database table to store user reports
- Add a "Report" button on both the Event Detail page (`src/pages/EventDetail.tsx`) and the Driver Profile page (`src/pages/DriverProfile.tsx`)
- Clicking opens a dialog where the user describes the issue
- Reports appear in a new "Reports" tab in the Admin panel for review

### Technical Details

**Database migration -- new `reports` table:**
```sql
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL, -- 'driver' or 'event'
  target_id uuid NOT NULL,   -- driver_profile.id or race_event.id
  reporter_id uuid,          -- auth user id (nullable for anonymous)
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, reviewed, dismissed
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a report
CREATE POLICY "Anyone can insert reports" ON public.reports
  FOR INSERT WITH CHECK (true);

-- Users can view own reports
CREATE POLICY "Users can view own reports" ON public.reports
  FOR SELECT USING (reporter_id = auth.uid());

-- Admins can view all reports
CREATE POLICY "Admins can view all reports" ON public.reports
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Admins can update reports
CREATE POLICY "Admins can update reports" ON public.reports
  FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- Admins can delete reports
CREATE POLICY "Admins can delete reports" ON public.reports
  FOR DELETE USING (has_role(auth.uid(), 'admin'));
```

**Files modified:**
- `supabase/functions/import-race-results/index.ts` -- Add duplicate event detection (check by event_name + series_name + season_year before inserting)
- `src/pages/DriverProfile.tsx` -- Rename "Event Results" heading to merge under "Race Results"; add Report button with dialog
- `src/pages/EventDetail.tsx` -- Add Report button with dialog
- `src/pages/Admin.tsx` -- Add "All Races" tab with event listing and delete; add "Reports" tab showing pending reports with dismiss/review actions; fetch `race_events` and `reports` on load

**No new dependencies needed.**

