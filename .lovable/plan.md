# Track Records — Major Update Plan

## Phase 1: New Data Models & Backend
- [ ] Create `circuits` table (name, country, location, length, turns, website, description)
- [ ] Create `series` table (name, category, description, website, logo_url)
- [ ] Add `circuit_id`, `series_id`, `ticket_url` to `race_events`
- [ ] Team enrichment edge function (mirror driver enrichment)
- [ ] Admin: bulk/individual team enrich buttons
- [ ] Seed circuits from existing race_events locations
- [ ] Seed series from existing race_events series_name

## Phase 2: New Pages & Search
- [ ] Circuit profile page (/circuit/:id) — history of events held there
- [ ] Series profile page (/series/:id) — championship info, events, standings
- [ ] Upcoming races page (/calendar) — timeline/list grouped by month, filterable
- [ ] Universal search: inline dropdown + full /search results page (drivers, teams, series, circuits, races)
- [ ] Hyperlink race results → circuits, series pages

## Phase 3: Contributor Enhancements
- [ ] Social links in "edit existing" contributor flow
- [ ] Social links in "add driver" and "add team" contributor forms
- [ ] Contributor form for upcoming events (with ticket URL, circuit selection)

## Phase 4: Visual Overhaul
- [ ] Fonts: Rajdhani (600/700 headlines) + IBM Plex Sans (300/400/500 body)
- [ ] Logo swap to new uploaded logo
- [ ] Color theme: dark/carbon palette (blacks, dark grays, subtle warm/cool accent)
- [ ] Homepage redesign: prominent search bar, live DB stats, featured/recent content
- [ ] Icon cleanup: remove unnecessary icons from nav, reduce visual clutter
- [ ] Make logo elements editable via visual editor
