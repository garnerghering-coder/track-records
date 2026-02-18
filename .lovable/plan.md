

## Enriched Race Results System

### Overview
Restructure the race results data model to support multi-driver entries, teams, car numbers, race classes, and detailed per-entry stats (laps, gaps, pit stops). Add a dedicated event detail page where users can see full classified results, click on any driver to visit their profile, and click on any team to view their page.

### New Database Tables

The current `race_results` table stores one row per driver per event, which doesn't support multi-driver entries (e.g., endurance racing co-drivers). We need three new tables:

1. **`race_events`** -- One row per race event
   - `id` (uuid, PK)
   - `event_name` (text, required) -- e.g. "Rolex 24 at Daytona"
   - `series_name` (text, required) -- e.g. "IMSA WeatherTech SportsCar Championship"
   - `season_year` (integer, required)
   - `category` (racing_category enum)
   - `location` (text, nullable) -- e.g. "Daytona International Speedway"
   - `event_date` (date, nullable)
   - `notes` (text, nullable)
   - `created_at`, `updated_at`

2. **`race_entries`** -- One row per car/team entry in an event
   - `id` (uuid, PK)
   - `race_event_id` (uuid, FK to race_events)
   - `team_name` (text, nullable) -- e.g. "Action Express Racing"
   - `organization_id` (uuid, nullable, FK to organizations) -- links to team page if exists
   - `car_number` (text, nullable) -- e.g. "31"
   - `race_class` (text, nullable) -- e.g. "GTP", "LMP2", "GTD"
   - `finishing_position` (integer, nullable) -- overall
   - `class_position` (integer, nullable) -- position within class
   - `laps_completed` (integer, nullable)
   - `gap_to_leader` (text, nullable) -- e.g. "+1 Lap", "+32.445s"
   - `gap_to_class_leader` (text, nullable)
   - `pit_stops` (integer, nullable)
   - `status` (text, nullable) -- e.g. "Finished", "DNF", "DNS", "DSQ"
   - `notes` (text, nullable)
   - `verification_status` (verification_status enum, default 'verified')
   - `created_at`

3. **`race_entry_drivers`** -- Junction table linking drivers to entries (supports multiple drivers per car)
   - `id` (uuid, PK)
   - `race_entry_id` (uuid, FK to race_entries)
   - `driver_profile_id` (uuid, FK to driver_profiles)
   - `created_at`
   - Unique constraint on (race_entry_id, driver_profile_id)

RLS policies: Public SELECT on all three tables. Admin-only INSERT/UPDATE/DELETE.

### New Pages and Routes

1. **Event Detail Page (`/event/:id`)** -- Shows full race information:
   - Header section with event name, series, date, location, category
   - Results table grouped and sorted by class, then by class position
   - Each row shows: overall position, class position, car number, team name (clickable if linked to organization), driver name(s) with nationality flags (each clickable to their profile), laps completed, gap to leader, gap to class leader, pit stops, status
   - Verified badge on verified entries

2. **Updated Results Page (`/results`)** -- Now shows a list of race events rather than individual driver results
   - Search/filter by event name, series, year, category
   - Each card shows event name, series, date, location
   - Clicking an event navigates to `/event/:id`

3. **Updated Admin Race Results Tab** -- Event-centric entry form:
   - Step 1: Create or select an event (name, series, year, category, location, date)
   - Step 2: Add entries -- for each entry: car number, team name, race class, then search and select one or more drivers
   - Step 3: Fill in finishing details per entry (positions, laps, gaps, pit stops, status)
   - Save all entries at once, auto-verified

4. **Driver Profile Page** -- Update to also show results from the new tables, listing events the driver participated in with links to the event detail page

### Technical Details

**Database migration:**
- Create `race_events`, `race_entries`, `race_entry_drivers` tables with appropriate foreign keys and indexes
- Add RLS: public SELECT, admin INSERT/UPDATE/DELETE on all three tables
- The old `race_results` table remains untouched for backward compatibility; over time new results use the new tables

**Files created:**
- `src/pages/EventDetail.tsx` -- Event detail page with classified results table
- Route `/event/:id` added to `App.tsx`

**Files modified:**
- `src/pages/Results.tsx` -- Rewritten to list race events from `race_events` table with search/filter
- `src/pages/Admin.tsx` -- Race Results tab updated for event-centric entry with multi-driver support, car number, class, and detailed stats fields
- `src/pages/DriverProfile.tsx` -- Add section showing events from the new tables alongside existing race_results
- `src/App.tsx` -- Add `/event/:id` route

**No new dependencies needed** -- uses existing UI components (Table, Input, Select, Popover, Badge, etc.)

