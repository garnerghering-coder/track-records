# Track Records — Major Update Plan

## Phase 1: New Data Models & Backend
- [x] Create `circuits` table (name, country, location, length, turns, website, description)
- [x] Create `series` table (name, category, description, website, logo_url)
- [x] Add `circuit_id`, `series_id`, `ticket_url` to `race_events`
- [x] Team enrichment edge function (mirror driver enrichment)
- [x] Admin: bulk/individual team enrich buttons
- [x] Seed circuits from existing race_events locations
- [x] Seed series from existing race_events series_name

## Phase 2: New Pages & Search
- [x] Circuit profile page (/circuit/:id) — history of events held there
- [x] Series profile page (/series/:id) — championship info, events, standings
- [x] Upcoming races page (/calendar) — timeline/list grouped by month, filterable
- [x] Universal search: inline dropdown + full /search results page (drivers, teams, series, circuits, races)
- [x] Hyperlink race results → circuits, series pages

## Phase 3: Contributor Enhancements
- [x] Social links in "edit existing" contributor flow
- [x] Social links in "add driver" and "add team" contributor forms
- [ ] Contributor form for upcoming events (with ticket URL, circuit selection)

## Phase 4: Visual Overhaul
- [x] Fonts: Rajdhani (600/700 headlines) + IBM Plex Sans (300/400/500 body)
- [x] Logo swap to new uploaded logo
- [x] Color theme: dark/carbon palette (blacks, dark grays, warm orange accent)
- [x] Homepage redesign: prominent search bar, live DB stats, featured/recent content
- [x] Icon cleanup: removed icons from nav links, reduced visual clutter
- [ ] Make logo elements editable via visual editor
