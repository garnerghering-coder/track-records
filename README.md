# Track Records

Multi-class sportscar results, timing analysis and driver records — IMSA and beyond.

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

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: tests, build, publish to GitHub Pages. For a custom domain, set it in **Settings → Pages** and point DNS at GitHub Pages.
