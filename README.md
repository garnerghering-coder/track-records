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
| Design system | `docs/REDESIGN.md`, `src/index.css`, `src/components/tr/` |
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

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: tests, build, publish to GitHub Pages. For a custom domain, set it in **Settings → Pages** and point DNS at GitHub Pages.
