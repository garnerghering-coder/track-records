

## Phase 1: New Database Schema + New Admin Panel at /manage

This phase creates the entire new database schema and builds the new admin panel with full CRUD for all entities including the session-based results entry system. Phase 2 (next message) will handle the public pages and PDF export.

---

### 1. Database Migration — New Tables

Create all new tables from scratch. Old tables remain untouched.

**Enums:**
- `session_type_enum`: practice, qualifying, sprint_qualifying, sprint_race, race, warmup, other
- `event_status_enum`: draft, published
- `result_status_enum`: finished, dnf, dns, dsq, classified

**Master tables:**
| Table | Columns |
|-------|---------|
| `v2_drivers` | id (uuid PK), full_name (text NOT NULL), short_name (text, 3-char code), nationality (text), date_of_birth (date), created_at, updated_at |
| `v2_teams` | id (uuid PK), full_name (text NOT NULL), short_name (text), nationality (text), created_at, updated_at |
| `v2_cars` | id (uuid PK), model_name (text NOT NULL), manufacturer (text), created_at, updated_at |
| `v2_circuits` | id (uuid PK), name (text NOT NULL), location (text), country (text), layout_image_url (text), created_at, updated_at |

**Event tables:**
| Table | Columns |
|-------|---------|
| `v2_series` | id (uuid PK), name (text NOT NULL), short_name (text), created_at, updated_at |
| `v2_seasons` | id (uuid PK), series_id (FK to v2_series), year (int NOT NULL), created_at |
| `v2_events` | id (uuid PK), season_id (FK to v2_seasons), circuit_id (FK to v2_circuits), name (text NOT NULL), round_number (int), start_date (date), end_date (date), description (text), status (event_status_enum DEFAULT 'draft'), created_at, updated_at |
| `v2_sessions` | id (uuid PK), event_id (FK to v2_events), name (text NOT NULL), session_type (session_type_enum NOT NULL), date (timestamptz), status (event_status_enum DEFAULT 'draft'), created_at, updated_at |

**Result tables:**
| Table | Columns |
|-------|---------|
| `v2_race_results` | id, session_id (FK), position (int), driver_id (FK), team_id (FK), car_id (FK), laps_completed (int), total_time (text), gap_to_leader (text), fastest_lap_time (text), average_lap_time (text), pit_stops (int), points (numeric), status (result_status_enum), dnf_reason (text), created_at |
| `v2_qualifying_results` | id, session_id (FK), position (int), driver_id (FK), team_id (FK), car_id (FK), q1_time (text), q2_time (text), q3_time (text), best_time (text), gap_to_pole (text), laps_run (int), created_at |
| `v2_practice_results` | id, session_id (FK), position (int), driver_id (FK), team_id (FK), car_id (FK), best_lap_time (text), gap_to_p1 (text), laps_run (int), created_at |
| `v2_pit_stops` | id, session_id (FK), driver_id (FK), lap_number (int), stop_duration (text), total_pit_time (text), created_at |
| `v2_incidents` | id, session_id (FK), lap_number (int), description (text), penalty_type (text), outcome (text), driver_ids (uuid[]), created_at |
| `v2_fastest_laps` | id, session_id (FK), driver_id (FK), lap_number (int), lap_time (text), position (int), created_at |

**RLS Policies (all tables):**
- SELECT: public (anyone can read)
- INSERT/UPDATE/DELETE: admin only (using existing `has_role(auth.uid(), 'admin')` function)

**Updated_at triggers:** Auto-update via `update_updated_at_column()` trigger on all tables with `updated_at`.

---

### 2. New Admin Panel — File Structure

Create a new set of files under `src/pages/manage/`:

```text
src/pages/manage/
  ManageLayout.tsx        -- Sidebar layout wrapper (shared by all manage pages)
  ManageEvents.tsx        -- Events list + create/edit form
  ManageEventDetail.tsx   -- Single event detail with sessions
  ManageSessionResults.tsx -- Full-screen results entry
  ManageDrivers.tsx       -- Drivers CRUD
  ManageTeams.tsx         -- Teams CRUD
  ManageCars.tsx          -- Cars CRUD
  ManageCircuits.tsx      -- Circuits CRUD
  ManageSeries.tsx        -- Series CRUD (includes seasons)
```

Shared components:
```text
src/components/manage/
  AutocompleteField.tsx   -- Smart autocomplete with inline create
  QuickCreateModal.tsx    -- Modal for creating driver/team/car inline
```

---

### 3. ManageLayout (Sidebar Navigation)

- Uses a sidebar with nav links: Events, Drivers, Teams, Cars, Circuits, Series
- Content area fills the rest of the screen
- Admin role check on mount -- redirects non-admins to home
- Clean, minimal design matching the existing dark theme

### 4. Master Data Pages (Drivers, Teams, Cars, Circuits, Series)

Each follows the same pattern:
- Table view listing all records with key columns
- "New [Entity]" button opens a dialog/modal with a form
- Each row has Edit and Delete buttons
- Edit opens the same form pre-filled
- Series page also shows/manages seasons (nested list under each series)

### 5. Events List Page

- Table with columns: Round, Event Name, Circuit, Series, Dates, Status
- "New Event" button opens form with:
  - Series dropdown (from v2_series)
  - Season dropdown (filtered by selected series)
  - Round number, Event name
  - Circuit (searchable dropdown from v2_circuits)
  - Start date, End date (date pickers)
  - Description (textarea)
  - Status toggle (draft/published)
- Clicking an event row navigates to ManageEventDetail

### 6. Event Detail Page

- Shows event info at top (name, circuit, series, dates, description)
- "Edit Event" button to modify
- Sessions section below with session cards
- "Add Session" button opens modal:
  - Session name (text input)
  - Session type (dropdown: Practice, Qualifying, Sprint Qualifying, Sprint Race, Race, Warmup, Other)
  - Date and time
- Each session card shows: name, type badge, date, status
- "Enter Results" button on each card navigates to ManageSessionResults

### 7. Session Results Entry (Core UI)

This is the most complex page. It receives session_id and session_type from the URL.

**Dynamic columns based on session_type:**

| Type | Columns |
|------|---------|
| Practice | Position, Driver, Team, Car, Best Lap Time, Gap to P1, Laps Run, Notes |
| Qualifying | Position, Driver, Team, Car, Q1, Q2, Q3, Best Time, Gap to Pole, Laps Run |
| Race / Sprint Race | Position, Driver, Team, Car, Laps, Time/Gap, Fastest Lap, Avg Lap, Pits, Points, Status |
| Other | Position, Driver, Team, Notes |

**Table entry behavior:**
- "Add Row" button appends a blank row; position auto-increments
- Each row has an X delete button
- Driver, Team, Car cells use AutocompleteField component
- Tab moves to next cell; Enter/down-arrow moves to next row's first cell
- Race results: Status dropdown (Finished/DNF/DNS/DSQ/Classified); DNF shows inline reason field
- Qualifying: toggle for number of segments (Q1 only, Q1+Q2, Q1+Q2+Q3)

**Collapsible sections at bottom (race/sprint only):**
- Pit Stop Log: Driver (autocomplete), Lap, Stop Duration, Total Pit Time
- Incident Log: Lap, Description, Drivers Involved, Penalty, Outcome

**Save actions:**
- "Save Draft" -- saves all data, status stays draft
- "Publish Session" -- saves and sets status to published

### 8. AutocompleteField Component

- Text input that searches the relevant v2_ table as user types
- Shows dropdown of matches
- If no match: shows "+ Create new [driver/team/car]" option
- Clicking create opens QuickCreateModal
- On create, the new record is auto-selected
- Debounced search (300ms)

### 9. Routing Changes

Add to `App.tsx`:
```
/manage                    -> ManageEvents (default)
/manage/events             -> ManageEvents
/manage/events/:id         -> ManageEventDetail
/manage/events/:id/session/:sessionId -> ManageSessionResults
/manage/drivers            -> ManageDrivers
/manage/teams              -> ManageTeams
/manage/cars               -> ManageCars
/manage/circuits           -> ManageCircuits
/manage/series             -> ManageSeries
```

Add "Manage" link to Header for admins (alongside existing Admin link).

---

### Technical Notes

- All lap times stored as text (e.g., "1:23.456") -- avoids numeric formatting complexity
- Points stored as numeric to support half-points (e.g., 12.5)
- driver_ids in incidents table is a uuid array for multi-driver incidents
- The v2_ prefix keeps new tables cleanly separated from old ones
- Foreign keys enforce referential integrity between all tables
- No changes to old tables, old admin, or existing edge functions

### What's Deferred to Phase 2

- Public event page (/events/[slug]) with session tabs
- PDF export (jsPDF)
- Updated public navigation (Series dropdown, etc.)
- Replacing existing public pages (Results, DriverProfile, etc.)
- Updated homepage to reference new tables

