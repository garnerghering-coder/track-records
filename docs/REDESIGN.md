# Track Records — Redesign Brief

## 1. Where Track Records sits

| | What they do well | Where they fall short |
|---|---|---|
| **Official timing (IMSA / Al Kamel)** | Authoritative, complete, fast | PDFs and raw tables. No driver career view, no cross-series linking |
| **Motorsport Stats** | Clean, broad series coverage | Weak on multi-class sportscar racing, shallow session data |
| **DriverDB** | Career pages across many series | Dated UI, thin per-race detail, no lap or strategy data |
| **RacingSportsCars** | Huge historic sportscar archive | Hard to use, no modern analysis |
| **Speedhive (MyLaps)** | Club and amateur lap timing | Raw timing only, no editorial or career context |

The gap: nobody makes **modern, multi-class sportscar data** pleasant to read. That means lap-by-lap gaps, strategy, and class-aware results, all linked to driver careers.

## 2. SWOT

**Strengths**
- Session data most sites don't have: class time-delta charts, position progression, pit and stint strategy timelines, weather, incident flags
- Original analysis: circuit fingerprints (demand, character, braking, elevation) and driver fingerprints
- Data is linked across drivers, teams, cars, circuits and series
- Community reports and contributions, plus PDF export

**Weaknesses**
- Small coverage: 15 events, 3 series, 2025–26 IMSA ecosystem only
- The UI was generic, so the unique data didn't stand out. The homepage spent the whole first screen on a stock video
- The basic questions ("who won?", "what's next?") took several clicks to answer
- Calendar page read an empty legacy table, so it always showed nothing
- Results weren't class-aware at a glance, which is the core of multi-class racing

**Opportunities**
- **Driver resumes:** pro-am and feeder-series drivers (MX-5 Cup, Michelin Pilot Challenge) need a credible, shareable record for sponsors and teams. They are also the people who would share it, which brings in traffic
- **Own the sportscar niche** before going broad: IMSA → WEC → GT World Challenge
- Head-to-head comparisons and records ("most wins at Sebring in GTD") make shareable pages that rank well in search

**Threats**
- Series own their data and could build this themselves
- Entering data by hand doesn't scale (the import and enrichment functions help)
- Larger sites could add multi-class depth

## 3. Audience decision

**Primary: the sportscar paddock.** That means engaged fans plus the drivers and teams themselves. Fans come back every race weekend. Drivers share their profiles, which is how the site grows.
**Secondary: casual fans.** They get their answer ("who won, what's next") within one screen of the homepage, then can dig deeper.

What follows from that:
1. **Results come first.** The homepage opens with the latest winners by class, not a hero banner.
2. **Every result is class-aware.** Class colors come from the season settings in the database and are used everywhere.
3. **Driver pages work like a racing resume.** They lead with career totals (starts, wins, podiums, classes, teams) and are built to be shared.
4. **Search from anywhere.** A ⌘K command palette on every page.
5. **The analysis is shown off,** not hidden behind tabs.

### What we cut
- Full-screen hero video (heavy, and gives no information)
- Count-up animations and the custom target cursor
- Duplicate nav items that just pointed to search tabs

## 4. Design system: "timing screen"

Modeled on pro timing and scoring screens: dense, precise, high contrast. Color *means* something.

- **Surfaces:** nearly neutral graphite in dark mode and paper white in light mode. Both are supported, and the visitor's system setting decides by default.
- **Accent:** *signal yellow*, like a pit board. Used sparingly for active states, focus and key calls to action.
- **Timing colors (the same everywhere):** purple = fastest overall, green = personal best, yellow = flag/caution, red = DNF/retired.
- **Class colors:** read from `v2_season_classes.color` when set, otherwise from the IMSA-style defaults.
- **Type:**
  - *ModernAge* (the logo's typeface) for position numbers, big stats and display moments, which ties the UI back to the brand
  - *Barlow Condensed* for headings and uppercase labels, the broadcast-graphics feel
  - *Barlow* for body text
  - *JetBrains Mono* with tabular figures for every lap time, gap and number in a table
- **Shape:** 2–4px corners, 1px rules, no drop shadows. Results are presented as data rows, not stacks of cards.
