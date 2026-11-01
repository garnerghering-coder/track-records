# Track Records

The record of motorsport, lap by lap: results, race replays, championships and career records for every series on the record.

The site is a static React app. **All data lives in this repository** under `data/`; there is no database server. Every data change is a commit you can review and revert.

## How it works

| Piece | Where |
|---|---|
| Data store | `data/<table>.ndjson` (one JSON row per line). Lap times, stints and pit stops are split per session: `data/<table>/<session_id>.ndjson` |
| Images | `public/media/` (car liveries, circuit layouts) |
| Query engine | `src/integrations/supabase/local-db.ts` — runs the same supabase-js style queries the pages use, over the data files, in the browser and in Node |
| Scoring | `supabase/functions/_shared/fingerprint-math.ts`, `driver-fingerprint.ts` (driver & circuit fingerprints), `imsa-points.ts` (official points rules), `src/lib/standings.ts` (championship standings) |
| Design | `docs/REIMAGINE.md` (product + visual identity), `src/index.css`, `src/site/` |
| Race digests | `src/lib/insights.ts` → `public/data/derived/digests.json` at build time (winners, podiums, insights, stats) |
| Records | `src/lib/record-book.ts` → `public/data/derived/records/` at build time (one small file per driver, team and car, plus a directory index) |
| Credits | `docs/CREDITS.md` → `public/data/credits.md` → `/credits` |
| Race Replay | `src/site/race/replay.ts` (pure engine) + `Replay.tsx` |
| Data sources | `docs/DATA-SOURCES.md` — importable series and events from official timing |

## Develop

```bash
npm install
npm run dev        # builds public/data from data/, then starts Vite on :8080
npx vitest run     # scoring, points and standings tests
npm run build      # production build in dist/
```

## Data scripts

Run with Node 22.6+:

```bash
node scripts/build-data.mjs                                              # data/ -> public/data (automatic before dev/build)
node --experimental-strip-types scripts/recompute-fingerprints.mjs       # recompute driver fingerprints
node scripts/export-from-supabase.mjs                                    # one-time export from the old Supabase backend
```

### Import an event from official timing (Al Kamel)

The IMSA / Al Kamel importer (`supabase/functions/import-imsa-results/core.ts`, also used by the
edge function) runs locally against `data/`. Event URLs are listed in `docs/DATA-SOURCES.md`.

```bash
# 1. find or create the series, season, classes, circuit and event; prints the event id
node --experimental-strip-types scripts/add-event.mjs --series "IMSA WeatherTech SportsCar Championship" \
  --year 2025 --event "2025 Acura Grand Prix of Long Beach" --round 3 --start 2025-04-11 --end 2025-04-12 \
  --circuit "Long Beach Street Circuit" --classes GTP,GTD

# 2. import results, lap times, stints, pit stops, flags and weather (--preview writes nothing;
#    --replace first deletes the event's existing sessions; --weather fills missing weather from Open-Meteo)
node --experimental-strip-types scripts/import-event.mjs --event <id> \
  --url "https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=07_Long%20Beach%20Street%20Circuit"

# 3. always recompute driver fingerprints afterwards, then review `git diff --stat data/` and commit
node --experimental-strip-types scripts/recompute-fingerprints.mjs
```

## What the site expects from an import (any series)

The pages work for any series that fills the same tables as the IMSA importer:

- **Classes are optional.** Multi-class races put the class in `extra_data.Class` and the class position in `extra_data.PIC`; without them the overall `position` is used and the copy says "wins", not "class wins".
- **Session types:** `race`, `endurance_race`, `sprint_race` (listed, but never counted as starts, wins or podiums), `qualifying`, `practice`. Hourly snapshots of a race set `parent_session_id`. Poles come from the event's main qualifying session (sessions named "Sprint …"/"Shootout" only count when there is no other).
- **Points:** `points` on race and qualifying rows are summed as stored (stage, sprint, fastest-lap, pole and bonus points included). Tie-breaks and the teams' table depend on the series name (`standingsRulesFor` in `src/lib/standings.ts`): IMSA rules for IMSA championships; elsewhere wins-then-seconds countback, the teams' table per car number (NASCAR owners, INDYCAR entrants) or per team (F1 constructors, from `team_id`).
- **Flags:** `v2_flag_segments.flag_state` may be `GREEN`, `YELLOW`, `CAUTION`, `FCY`, `SC`, `VSC`, `CODE60`, `RED`, `CHEQUERED` (normalised in `src/lib/flags.ts`).
- **Stages:** NASCAR-style stage finishes go in race rows' `extra_data` as `"Stage 1": 1`, `"Stage 2": 3`… (1 = stage win) for the stage insight.
- **Layouts:** a session's `layout_id` (e.g. the oval vs the road course) wins over the event's; lap records are kept per layout and per class or series.
- **Credits:** `docs/CREDITS.md` is published to `/credits` (headings, lists, pipe tables and links).

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: tests, build, publish to GitHub Pages. For a custom domain, set it in **Settings → Pages** and point DNS at GitHub Pages.
