# Track Records — Reimagined

A from-scratch product and design for Track Records. The data layer (`data/`, `local-db.ts`, scoring and points modules) is kept; **everything the visitor sees is new.**

## Who it's for, and what they come to do

| Visitor | Comes to… | We answer with… |
|---|---|---|
| Sportscar fan | "Who won? What happened?" | A **story** of the race, generated from the data, with a replay of how it unfolded |
| Data enthusiast | "How did it unfold? Who was fast?" | **Race Replay**, stint/pit drill-downs, analysis charts, comparisons |
| Driver / team | "Show my record" | A **driver record** page worth sharing: career shape, timeline, teammates, head-to-head |

## Product pillars

1. **Replay, don't list.** Every race with lap data can be replayed: a timing tower that reorders through race time, with the flag state, pit stops, stints and race control in sync.
2. **Stories from data.** Each event gets insights computed at build time (`src/lib/insights.ts`): closest finish, biggest climb, laps led, fastest lap, longest stint, most pit stops. Lead with these, not with tables.
3. **Records, not profiles.** Drivers, teams, cars and circuits are *records*: totals, timelines, shapes, records held.
4. **Championships are races too.** Points progression over the rounds, with standings underneath.
5. **Search is the front door.** ⌘K / `/` from anywhere; the Index overlay lists everything.

## Information architecture

```
/                     The Paddock — lead story (latest race), insights, championships, explore
/events/:id           Race Center — Story · Replay · Results · Analysis · Race control
/driver/:id           Driver record — hero, career shape, timeline, teammates, results
/compare?a=…&b=…      Head-to-head between two drivers
/team/:id, /car/:id   Records
/circuit/:id          Circuit record — map, character, winners by year, lap records
/series/:id           Championship — points race, standings, season strip
/drivers /teams /cars /circuits /series /calendar /results /articles /search
```

## Visual identity — "The Record"

Editorial, like a premium motorsport annual, with the precision of a timing system.

**Themes.** *Day* (default): warm paper and ink. *Night*: race-at-night. Both are first-class.

| Token | Day | Night | Use |
|---|---|---|---|
| `--paper` | `#F3F1EC` | `#0C0C0B` | page |
| `--sheet` | `#FBFAF7` | `#151513` | raised surfaces |
| `--ink` | `#121210` | `#EDEAE3` | text |
| `--ink-2` | `#55524B` | `#A39E93` | secondary text |
| `--ink-3` | `#8C877D` | `#6F6A61` | tertiary / labels |
| `--rule` | `#DCD7CC` | `#272520` | hairlines |
| `--hl` | `#D9F24A` | `#D9F24A` | highlighter — active, live, "now" (always with ink text) |

Class colours come from the season's settings in the data, with defaults in `src/lib/classes.ts`; they are the only other colour. Timing semantics are kept: purple marks the fastest lap.

**Type.**
- *Instrument Serif* for display: headlines, names, big statements (italic for emphasis).
- *Geist* for UI and body.
- *Geist Mono* for every number in data (tabular).
- *ModernAge* (the logo face) for position numbers and the largest numerals only.

**Shape and motion.**
- Large radius (14–20px) on interactive modules (replay, charts, cards), hairlines for text structure.
- Generous whitespace and asymmetric editorial grids.
- Liveries and track maps are the imagery; no stock photos.
- Motion is meaningful: the replay tower reorders with FLIP animation, numbers tick, and hover lifts. Everything respects `prefers-reduced-motion`.

**Rules of thumb.**
- Lead with a sentence, then the data.
- One highlighter moment per view.
- Never show an empty box: say what's missing and why.
- Every name is a link; every number has a unit or label.
- Works at 390px, keyboard-navigable, AA contrast in both themes.
