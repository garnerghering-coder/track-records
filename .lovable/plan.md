

## Community-Driven Platform + Team Profiles

This is a major platform shift from "admin-only data entry" to "community-driven contributions with admin oversight." It also adds full team profiles. Here is the plan broken into phases.

---

### Phase 1: Team Profiles System

**Database changes (new table + modifications):**

- Create a `team_profiles` table (separate from the existing `organizations` table, which is for user accounts):
  - `id` (uuid, PK)
  - `name` (text, not null)
  - `logo_url` (text, nullable)
  - `website` (text, nullable)
  - `bio` (text, nullable)
  - `nationality` (text, nullable)
  - `primary_category` (racing_category, nullable)
  - `created_at`, `updated_at` (timestamps)
- RLS: public SELECT, admin-only INSERT/UPDATE/DELETE (contributors will go through the edit queue)
- Add `team_profile_id` (uuid, nullable, FK) column to `race_entries` table, linking entries to team profiles

**New pages:**
- `/teams` -- Browse all teams page (same layout as Find Drivers: search by name, filter by category)
- `/team/:id` -- Team profile page showing:
  - Team name, logo, bio, nationality, website
  - Current drivers (derived from most recent race entries)
  - Race history (all events the team has participated in, with links)

**Event detail updates:**
- Team names in the results table become hyperlinks to `/team/:id` when a `team_profile_id` exists

**Auto-population:**
- When race results are imported and a `team_name` matches an existing `team_profiles.name`, automatically link via `team_profile_id`
- Update the `direct-import` and `import-race-results` edge functions to perform this matching

---

### Phase 2: Header Navigation Updates

- Change the "Find Drivers" icon from `Search` to `User` (person icon)
- Add a "Teams" link with a `Users` icon pointing to `/teams`
- Add a "Contribute" link (visible to logged-in non-admin users) pointing to `/contribute`
- Keep "Admin" link for admin users (they see both "Contribute" and "Admin")
- The "Submit" page/route will be replaced by the new Contribute page

---

### Phase 3: Contributor System (Community Editing)

**Database changes:**

- Create an `edit_queue` table to track all contributor changes:
  - `id` (uuid, PK)
  - `submitted_by` (uuid, not null -- the contributor)
  - `edit_type` (text: 'create_driver', 'edit_driver', 'create_team', 'edit_team', 'create_event', 'edit_event', 'create_entry', 'edit_entry')
  - `target_table` (text: 'driver_profiles', 'team_profiles', 'race_events', 'race_entries')
  - `target_id` (uuid, nullable -- null for creates)
  - `proposed_data` (jsonb -- the full proposed row or changed fields)
  - `previous_data` (jsonb, nullable -- snapshot of the row before edit, for undo)
  - `status` (text: 'pending', 'approved', 'rejected', default 'pending')
  - `reviewed_by` (uuid, nullable)
  - `reviewed_at` (timestamptz, nullable)
  - `admin_notes` (text, nullable)
  - `created_at` (timestamptz, default now())
- RLS: Users can INSERT (where submitted_by = auth.uid()), users can SELECT own rows, admins can SELECT/UPDATE/DELETE all

**New page: `/contribute`**

Available to any logged-in user. Tabs:

1. **Add Race Results** -- A manual form (no AI) where contributors type in:
   - Series name, event name, season year, event date, location, category
   - A table of entries: position, driver name(s), team name, car number, class, status
   - Rows are added one by one via a form or inline table editing
   - On submit, the data goes into the `edit_queue` as a 'create_event' + 'create_entry' batch

2. **Add Driver** -- Simple form: first name, last name, nationality, category, bio
   - Submits to `edit_queue` as 'create_driver'

3. **Add Team** -- Simple form: team name, nationality, category, website, bio
   - Submits to `edit_queue` as 'create_team'

4. **Edit Existing** -- Search for an existing driver, team, or event and propose changes
   - Search bar that queries driver_profiles, team_profiles, and race_events
   - Select an item, see current data, modify fields, submit the diff to `edit_queue`

5. **My Contributions** -- List of all their submissions with status (pending/approved/rejected)

**Profanity filter:**
- Create a utility file `src/lib/profanity-filter.ts` with a blocklist of common profane words
- Run all text inputs through this filter before submitting to the edit queue
- If profanity is detected, show an error toast and block submission

---

### Phase 4: Admin Review Panel for Contributor Edits

**Admin page additions:**

- New tab: **"Edit Queue"** (or integrate into existing Pending tab)
  - Shows all pending edits from contributors
  - Each edit shows: who submitted it, what type, what's being changed (diff view for edits), timestamp
  - Admin actions: Approve (applies the change to the real table), Reject (with optional notes), Flag (moves to flags tab)
  - Approve logic:
    - For creates: INSERT the row into the target table
    - For edits: UPDATE the target table with proposed_data
  - Undo: For approved edits, admin can click "Undo" which uses `previous_data` to revert the change
- Badge count on the Edit Queue tab showing pending items

---

### Phase 5: Homepage & Messaging Shift

- Update hero section copy to emphasize community contribution:
  - "Your Racing Career, Verified." stays but the subtitle shifts to invite contributions
  - Add a CTA button: "Start Contributing" alongside existing buttons
- Update "How It Works" section to include contributing
- Update benefits to mention community-driven data

---

### Phase 6: Auth Flow Update

- Remove the "Driver" vs "Team / Sponsor" role selection from signup -- everyone is now a community member
- Simplify signup to just: name, email, password
- After signup, users can contribute immediately
- Drivers/teams can still claim profiles separately

---

### Technical Summary

| Area | Files Changed |
|------|------|
| Database | 1 new migration (team_profiles table, edit_queue table, team_profile_id on race_entries) |
| New pages | `/teams` (TeamSearch.tsx), `/team/:id` (TeamProfile.tsx), `/contribute` (Contribute.tsx) |
| Modified pages | Admin.tsx (edit queue tab), Index.tsx (messaging), Auth.tsx (simplified signup), EventDetail.tsx (team links) |
| Components | Header.tsx (nav updates) |
| Utilities | profanity-filter.ts (new) |
| Edge functions | direct-import/index.ts, import-race-results/index.ts (team matching) |
| Routes | App.tsx (add /teams, /team/:id, /contribute routes) |

