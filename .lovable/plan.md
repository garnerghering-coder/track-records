
# Fix F1 Import: Alias Matching and Season Car Assignment

## Problem 1: Team aliases not checked during import
The importer currently only checks `v2_teams.full_name` and `v2_teams.short_name`. It misses entries in `v2_team_season_names` (aliases), so "Kick Sauber" from the F1 site doesn't match "Stake F1 Team Kick Sauber" (an alias of "Audi F1 Team").

### Fix
In the edge function, after loading existing teams, also load all `v2_team_season_names` for the event's season. The `matchTeam` function will check aliases in addition to canonical names. Flow:
1. Get the event's `season_id`
2. Query `v2_team_season_names` filtered to that season
3. In `matchTeam`, first check canonical team names (existing logic), then check alias `display_name` values -- if an alias matches, return that alias's `team_id`

## Problem 2: Cars are the same per team per season
F1 results pages don't list car models, but each team uses one car for an entire season. We can create a mapping table so the importer auto-assigns the correct car.

### Solution: New `v2_team_season_cars` table
A simple lookup table:

| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| team_id | uuid | FK to v2_teams |
| season_id | uuid | FK to v2_seasons |
| car_id | uuid | FK to v2_cars |
| created_at | timestamp | Auto |

Once you've set up the mapping for a season (e.g., Mercedes -> W16 for 2025), every import for that season will automatically fill in the car field for that team's entries.

### UI for managing these mappings
On the ManageTeams page (where aliases are already managed), add a "Season Cars" section so you can assign a car per team per season. Alternatively, this could live on the event detail page as a one-time setup step.

## Technical Changes

### 1. Database migration
- Create `v2_team_season_cars` table with RLS (public read, admin write)
- Unique constraint on `(team_id, season_id)` so each team has exactly one car per season

### 2. Edge function update (`import-f1-sessions/index.ts`)
- After loading the event, fetch its `season_id`
- Load `v2_team_season_names` for that season to use as alias lookup
- Load `v2_team_season_cars` for that season to auto-assign `car_id`
- Update `matchTeam` to check aliases before creating new teams
- When inserting results (practice/qualifying/race), look up the `car_id` from the team-season-car mapping and include it

### 3. UI for season car mappings (`ManageTeams.tsx`)
- In the existing alias dialog for a team, add a "Season Car" picker alongside the alias name
- This lets you set which car each team uses per season
- The car dropdown pulls from existing `v2_cars`

### File changes
1. **New migration** -- create `v2_team_season_cars` table
2. **Edit** `supabase/functions/import-f1-sessions/index.ts` -- add alias + car lookup logic
3. **Edit** `src/pages/manage/ManageTeams.tsx` -- add season car assignment UI
