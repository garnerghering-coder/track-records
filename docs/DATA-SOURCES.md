# Data sources: importable series, seasons and events

This page lists what can be imported into Track Records from Al Kamel timing sites, and how
to import it from `/manage`. The catalog was built on 2026-11-01 from read-only requests to
the Al Kamel index pages (one request per event page). Al Kamel adds and revises files after
each event, so check an event page before importing it.

## How the importer works

`supabase/functions/import-imsa-results` (the built-in "IMSA" parser in the Import Data
dialog) takes one Al Kamel **event page** URL plus the Track Records event to fill:

1. It fetches the event page and collects every `Results/<season>/<event>/<series>/<session>/…`
   link. Every series that ran that weekend is on the same page.
2. It keeps the links whose **series folder** (for example `03_Whelen Mazda MX-5 Cup presented by Michelin`)
   matches the event's series name or one of its **series aliases**. Names are normalised
   before comparison: the order prefix, "presented by …", "IMSA", "Whelen" and punctuation
   are ignored.
3. For each session folder it reads one classification JSON (`03_Results_<session>_<mark>.JSON`).
   It prefers Official over Provisional over Unofficial, and an Amended or Revised file over
   the file it replaces. Endurance races also get per-hour sub-sessions from the `Hour N` folders.
4. It adds lap times, stints and pit stops from `23_Time Cards*.CSV` (pit stops from the
   `PIT_TIME` column when present), weather from `26_Weather*.JSON`, and flags from
   `25_FlagsAnalysis*.JSON`. Without that JSON it OCRs the PDF version of the report when an AI
   key is configured, and otherwise derives the flag periods from the time cards' `FLAG_AT_FL`
   column (accurate to about one lap).
5. It creates sessions, drivers, teams and cars, reusing existing ones through search aliases.
   It skips any session whose name the event already has, so you can safely run it again.

**The importer needs `.JSON` results.** Events that only publish PDF, CSV or XML (marked "no" in
the tables) cannot be imported yet. All Al Kamel series use the same JSON schema
(`session`, `fastest_lap`, `classification[]` with `class`, `drivers[]`, `vehicle`, `team`), so
single-class series (Mazda MX-5 Cup: class `ND2`) and non-IMSA class names (Porsche Carrera Cup:
`Pro`/`Pro-Am`/`Masters`, Lamborghini Super Trofeo: `Pro`/`ProAm`/`Am`/`LBCup`, Mustang Challenge:
`DH`/`DHL`) import without changes.

### FIA WEC (fiawec.alkamelsystems.com): not available

The FIA WEC Al Kamel site is now a single-page app behind Cloudflare Turnstile and a sign-in
("Season Pass" token-gated content). It no longer serves the public `?season=…&evvent=…` index
with `Results/…` links. The importer accepts any `*.alkamelsystems.com` or `*.alkamelcloud.com`
host, but it cannot read that site without credentials. **Do not try to get around the gate.**
To add WEC, get permission or a data feed from Al Kamel or the FIA, or enter results by hand
from the official PDF classifications.

## Summary (imsa.results.alkamelcloud.com)

"Importable" means the event page has JSON classification files for that series.

| Series | Year | Events listed | Race weekends (excl. tests) | Importable (JSON results) |
|---|---|---|---|---|
| IMSA WeatherTech SportsCar Championship | 2024 | 13 | 11 | 12 |
| IMSA WeatherTech SportsCar Championship | 2025 | 12 | 11 | 12 |
| IMSA WeatherTech SportsCar Championship | 2026 | 13 | 11 | 13 |
| IMSA Michelin Pilot Challenge | 2024 | 11 | 10 | 10 |
| IMSA Michelin Pilot Challenge | 2025 | 11 | 10 | 11 |
| IMSA Michelin Pilot Challenge | 2026 | 11 | 10 | 11 |
| IMSA VP Racing SportsCar Challenge | 2024 | 6 | 5 | 6 |
| IMSA VP Racing SportsCar Challenge | 2025 | 6 | 5 | 6 |
| IMSA VP Racing SportsCar Challenge | 2026 | 6 | 5 | 6 |
| IMSA Airbnb Endurance Challenge (2026) | 2026 | 4 | 4 | 4 |
| Mazda MX-5 Cup Shootout | 2024 | 1 | 0 | 0 |
| Mazda MX-5 Cup Shootout | 2025 | 1 | 0 | 0 |
| Spec MX-5 Shootout | 2024 | 1 | 0 | 0 |
| Spec MX-5 Shootout | 2025 | 1 | 0 | 0 |
| Mazda MX-5 Cup | 2024 | 8 | 8 | 7 |
| Mazda MX-5 Cup | 2025 | 9 | 8 | 6 |
| Mazda MX-5 Cup | 2026 | 7 | 7 | 7 |
| Porsche Carrera Cup North America | 2024 | 8 | 7 | 5 |
| Porsche Carrera Cup North America | 2025 | 8 | 8 | 5 |
| Porsche Carrera Cup North America | 2026 | 8 | 8 | 6 |
| Lamborghini Super Trofeo North America | 2024 | 5 | 5 | 5 |
| Lamborghini Super Trofeo North America | 2025 | 6 | 6 | 5 |
| Lamborghini Super Trofeo North America | 2026 | 6 | 6 | 5 |
| Ford Mustang Cup | 2025 | 1 | 0 | 0 |
| Mustang Challenge | 2024 | 5 | 5 | 5 |
| Mustang Challenge | 2025 | 6 | 6 | 5 |
| Mustang Challenge | 2026 | 6 | 6 | 6 |
| Historic Sportscar Racing (HSR Classic 24) | 2025 | 1 | 1 | 1 |
| Historic Sportscar Racing (HSR Classic 24) | 2026 | 1 | 1 | 1 |
| NASCAR Classic (HSR) | 2024 | 1 | 1 | 1 |

Not shown in the table: `2024 / 20_Circuit of the Americas (PCCNA)` and `2024 / 23_Jerez de la Frontera Circuit`
(the Lamborghini World Final) have no series folder and only PDF/XML files. Neither can be imported.

## Recommended import plan

The order follows the site's sportscar focus (multi-class prototypes and GT first), the value
of each series' data (time cards, weather and flags let the strategy and fingerprint features
work), and how much work each one takes.

1. **Finish IMSA WeatherTech 2024–2026** (12 + 12 + 13 events, all importable). This is the
   flagship series and already has a series in the database. Start with the endurance rounds
   (Daytona, Sebring, Watkins Glen, Indianapolis, Road Atlanta), which include hour-by-hour results.
2. **IMSA Michelin Pilot Challenge 2024–2026** (10–11 events per year, all importable except
   ROAR 2024). It shares weekends and circuits with WeatherTech, so drivers and teams overlap
   and it adds GS and TCR classes. The Daytona and Road Atlanta 4-hour races also have hour results.
3. **IMSA VP Racing SportsCar Challenge 2024–2026** (6 per year, all importable). This is the
   LMP3 and GSX ladder series and adds prototype depth.
4. **Lamborghini Super Trofeo NA and Porsche Carrera Cup NA** (one-make GT3 series with
   pro-am classes). Import the rounds held on IMSA weekends. PCCNA rounds on F1 weekends (Miami,
   Montreal, COTA) and the Lamborghini World Finals (Misano, Monza) publish only PDF, CSV or XML.
   Importing them would need an XML or CSV reader.
5. **Mazda MX-5 Cup 2024–2026** (6–7 importable events per year, single class). Already in the
   database, so this fills in the remaining events.
6. **Mustang Challenge**: only if you want broad IMSA-paddock coverage. Skip HSR/Classic 24 and
   the NASCAR Classic (historic exhibitions) and the test days (ROAR, Daytona Test), unless test
   times are wanted.
7. **IMSA Airbnb Endurance Challenge (2026)**: four standalone events. Check the classes on one
   event page before you create a series for it.
8. **FIA WEC**: blocked, see above.

Points: only WeatherTech and Michelin Pilot Challenge currently get championship points. Other
series are imported with no points until their schemes are added through `resolvePointsScheme()`
in `supabase/functions/import-imsa-results/series-points.ts`. **Before you import IMSA VP Racing
or the Airbnb Endurance Challenge**, make sure the points code uses that hook. The old rule treats
any series whose name contains "IMSA" as WeatherTech.

## Import locally into the repo (current workflow)

The importer's logic lives in `supabase/functions/import-imsa-results/core.ts` and runs under
Node against `data/` (Node 22.6+). Nothing hosted is involved; every change is a reviewable diff.

```bash
# 1. Series / season / classes / circuit / event: matched case-insensitively (series also by
#    v2_series_aliases), created only when missing. Prints the event id; new events are 'published'.
node --experimental-strip-types scripts/add-event.mjs --series "IMSA WeatherTech SportsCar Championship" \
  --year 2025 --event "2025 Acura Grand Prix of Long Beach" --round 3 \
  --start 2025-04-11 --end 2025-04-12 --circuit "Long Beach Street Circuit" --classes GTP,GTD

# 2. Import (use the Results URL from the tables below). Sessions are created 'published'.
node --experimental-strip-types scripts/import-event.mjs --event <id> --url "<Results URL>" [--preview]
#    --preview   fetch and count only, write nothing
#    --replace   delete the event's sessions and all their rows first (needed to re-import)
#    --weather   fill Open-Meteo weather for sessions that got none from Al Kamel
#    --cache DIR reuse downloaded files on reruns (be polite to Al Kamel)

# 3. Recompute driver fingerprints, then review and commit
node --experimental-strip-types scripts/recompute-fingerprints.mjs
git diff --stat data/
```

The import prints the rows added per table and the growth of `data/` (a sprint-race weekend
with time cards adds about 0.4–0.9 MB). Check the summary for `drivers_created` /
`teams_created` / `cars_created`: drivers are matched case-, accent- and "(R)"-insensitively and
through `search_aliases`, so new rows should be genuinely new people, teams or models.

## Step by step in the old hosted admin (legacy)

The `/manage` pages below belonged to the Supabase-hosted site and are kept for reference.

You must be signed in as an admin (`user_roles.role = 'admin'`). Every import function now
rejects other callers.

1. **Series**: go to `/manage/series` and select **New Series** (for example "Porsche Carrera Cup North America").
   - Add **aliases** for the Al Kamel folder names that don't contain the series name, for example
     "Lamborghini Super Trofeo" when the series is called "Lamborghini Super Trofeo North America".
     The tables below list the exact folder names. Usually none are needed, because the
     normalised matching already handles "Whelen … presented by Michelin" and "… North America".
   - Aliases of 5 characters or fewer (such as "PCCNA") must equal the folder name exactly, so
     they won't match folders by accident.
2. **Season**: on the same page, select **Add Season** under the series (year). Edit the season to mark it
   **multi-class** and add its classes with colours (`v2_season_classes`). Without this,
   classes the site doesn't know (`Pro-Am`, `ND2`, `DH`, …) show in grey and in alphabetical order.
3. **Circuit**: go to `/manage/circuits` and check that the circuit exists with one layout.
   With one layout, the importer assigns it to each session automatically.
4. **Event**: go to `/manage/events` and select **New Event**. Choose the series, the season and
   the circuit, then the name and dates.
5. **Import**: open the event (`/manage/events/<id>`) and select **Import Data**. Paste the
   **Results URL** from the tables below, for example
   `https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=16_Road%20America`.
   - The URL should auto-select the built-in IMSA parser. If it doesn't, select **Override parser
     selection** and choose it.
   - Running the parser writes to the database immediately. There is no preview step for this parser.
   - If it reports *"No results JSON files found for this series"*, the response lists
     `series_folders_on_page`. Add the right one as a series alias and run it again.
6. **After import**:
   - Sessions are created as `draft`. Review them on the event page, then publish.
   - In `/manage/drivers`, merge any duplicate drivers created by spelling differences and add
     search aliases. Then select **Recalculate All** to rebuild driver fingerprints.
   - In `/manage/issues`, fill in DNF reasons. **AI Resolve Reasons** uses paid AI credits.
   - Weather comes from the Al Kamel weather JSON. The per-session weather fetch on the event page is only
     needed when that file is missing.

### Re-importing existing events

Earlier versions of the importer read the **Unofficial** classification. When an event page had
Official, Provisional and Unofficial files, it took the last one listed, and this happened for
about 220 of 924 session folders across 2024–2026. Unofficial results can be missing post-race
penalties. The importer now picks the Official file. Sessions already in the database are not
changed, because the importer skips sessions by name. To correct them, re-import the event with
`scripts/import-event.mjs --replace`, then compare.

`--replace` deletes the event's sessions, so anything attached to them by hand (session
summaries, `column_order`, `highlights_url`) has to be re-attached to the new sessions by name.

### What the feeds look like (learned importing WeatherTech and MPC 2024–2026)

- **Points**: every 2024 event page carries IMSA's end-of-season POINTS DATA, not the file as it
  stood after that round. The importer finds the round being imported in the file by name (the
  event name, the Al Kamel event folder and the circuit name: "Sebring", "CTMP",
  "Michelin Raceway" = Road Atlanta) or, failing that, by round number, so events need correct
  round numbers. A round found by name is trusted even where IMSA's figures differ from the
  position-based scale (penalties: 2024 Sebring GT qualifying, 2026 Long Beach GTD qualifying,
  2026 Indianapolis GT qualifying scored 0).
- **Hour results**: 2024 Daytona publishes the hourly classification as PDF/CSV only (just Hour 24
  has JSON), so that event has Race + Hour 24 and no other hours. 2024 Daytona also has no
  Qualifying: it was run at the Roar, which is CSV/PDF only.
- **Start times**: `session_date` in the results JSON uses a 12-hour clock without AM/PM. Session
  start times come from the session folder name (`202503151010_Race` = 10:10 local).
- **Name variants**: Al Kamel spells the same car or team differently between years
  ("Mercedes AMG GT3" / "Mercedes-AMG GT3", "Cadillac VSeries.R", "Ligier  LMP2" for the
  JS P217, "VasserSullivan", "TeamTGM", "Turner Motorpsort") and marks MX-5 Cup drivers "(R)" or
  "(V)". The importer ignores spacing, punctuation and the markers; for typos add a
  `search_aliases` row (entity_type `driver`, `team` or `car`, canonical = the row id).
  Entry-list placeholders (driver "TBD TBD", no team or car) are skipped.
- **Multi-race weekends** (MX-5 Cup, VP Racing): "Race N" takes the N-th race of the weekend in
  IMSA's points data. MX-5 Cup gets IMSA's per-driver points; VP Racing has no points scheme yet
  (`resolvePointsScheme` returns `imsa_vprc`, which records none).
- **VP Racing classes** are `P3`, `GSX` and, in 2025 only, `GTDX`. The VPRC rounds at Daytona are
  on the ROAR event pages. 2025 VIR also holds the "CTMP Race 2 Makeup" race.

## NTT INDYCAR SERIES (indycar.com) — imported 2024–2026

INDYCAR is not on Al Kamel. `scripts/import-indycar.mjs` reads INDYCAR's own results:

- **indycar.com results API** (the JSON behind https://www.indycar.com/Results, no key needed):
  `/api/results/SeasonDropDown?id=b856a4f1-e85c-4fac-8c36-fd58d962227a` lists every season, event and
  session id; `/api/results/EventsSessionDetails?id=<session>` gives the classification (positions, laps,
  elapsed, gaps, laps led, pit stops, status, **points earned including pole, laps-led, most-laps-led and
  Indianapolis 500 qualifying points**) and links to the session's PDF reports;
  `/api/results/YearPointSummary?year=<y>&id=<series>` is the official championship table (used to verify).
- **Official timing PDFs** (Indy Racing Information System), linked from the API as `http://www.imscdn.com/<Url>`
  and fetched over HTTPS from the same S3 bucket (`https://s3.amazonaws.com/www.imscdn.com/<Url>`), converted with
  `pdftotext -layout` (poppler-utils): the race **Results** PDF (chassis/engine per car, caution summary with
  laps and reasons, penalty summary) and **Section Results** (every lap of every car with pit-lane SF→PI and
  PI→PO times).

```bash
node --experimental-strip-types scripts/import-indycar.mjs --year 2025 --list          # events and EventIDs
node --experimental-strip-types scripts/import-indycar.mjs --year 2024,2025,2026 --cache /tmp/indycar-cache
node --experimental-strip-types scripts/import-indycar.mjs --year 2025 --event 5502 --replace   # one event again
node --experimental-strip-types scripts/indycar-liveries.mjs --year 2026 --teams       # car illustrations
node --experimental-strip-types scripts/render-track-map.mjs --in map.svg --layout <layoutId> --min-dark 0.7
node --experimental-strip-types scripts/recompute-fingerprints.mjs
```

How the data is shaped:

- One v2_event per points race (the Iowa and Milwaukee doubleheaders are two events each; the 2024
  "$1 Million Challenge" exhibition at Thermal is skipped). Round = order of the races in the season.
  Event names are `<year> <official name>` except `<year> Indianapolis 500`.
- Sessions: every practice (Group 1/2 splits only when there is no "All Cars" report), warm-up, one
  **Qualifying** session (the "Combined Qualifications" order; ovals: the single qualifying session; the 2024
  Indianapolis 500, which has no combined report, is rebuilt from its segments in starting-grid order), and the
  race. Oval qualifying `best_time` is the official 2- or 4-lap total (laps and average speed in extra_data).
- `points` on race rows are INDYCAR's points as awarded; qualifying rows carry none (pole and Indianapolis 500
  qualifying points are already in the race points). Standings computed by the site match the official tables
  for 2024–2026 (top 10 and every driver's total).
- No classes (extra_data.Class unset). Teams are organisations (`Andretti Global w/ Curb-Agajanian` → Andretti
  Global); the entrant name per car is in `extra_data.entrant`. Cars are `Dallara IR-18 Honda` / `IR-18 Chevrolet`.
- Lap times: elapsed = cumulative Section Results lap times, plus the car's start offset behind the leader
  (official elapsed − sum of laps for finishers; nearest finisher on the grid for others). Since mid-2025 the
  report also times the lap after the chequered flag; laps beyond the car's completed laps are dropped. A single
  missing lap is filled from the official elapsed time. INDYCAR's elapsed times exclude red-flag stoppages; the
  replay keeps short stoppages in real time as RED periods (from the winner's stopped lap), and takes a
  suspension longer than two hours (2026 Milwaukee race 1, finished the next day) out of the timeline.
- Flags: CAUTION periods from the results PDF's caution summary (laps → leader's lap times), RED from stopped
  laps, CHEQUERED from the leader's finish to the last finisher. Race control notes: green, cautions with
  reasons, penalties, red flags, chequered flag (`[Lap n] (+h:mm:ss.sss) text`).
- Pit stops: one row per pit-lane passage in Section Results (includes drive-throughs), `stop_duration` = pit-in
  to pit-out time.

## Full catalog

Columns: Sessions (races) is the number of session folders and how many are races. Time cards
is `23_Time Cards*.CSV`. Weather is `26_Weather*.JSON`, or the CSV only. Flags is
`25_FlagsAnalysis*.JSON` or the PDF fallback. Hour results means per-hour sub-sessions for
endurance races. "yes (needs this update)" marks events that publish only `03_Results.JSON`,
which the previous file pattern skipped.


### IMSA WeatherTech SportsCar Championship

Series folder names seen: `01_IMSA WeatherTech SportsCar Championship`


**2024** (13 events, 12 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| ROAR Before the 24 *(test/no race)* | 7 (0) | yes | CSV | - | - | no - CSV/PDF only | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=01_ROAR%20Before%20the%2024 |
| Daytona International Speedway | 7 (1) | yes | JSON | PDF | yes | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=02_Daytona%20International%20Speedway |
| Sebring International Raceway | 7 (1) | yes | JSON | PDF | yes | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=05_Sebring%20International%20Raceway |
| Long Beach Street Circuit | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=06_Long%20Beach%20Street%20Circuit |
| Weathertech Raceway Laguna Seca | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=08_Weathertech%20Raceway%20Laguna%20Seca |
| Detroit Street Course | 7 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=09_Detroit%20Street%20Course |
| Watkins Glen International | 6 (1) | yes | JSON | PDF | yes | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=12_Watkins%20Glen%20International |
| Canadian Tire Motorsport Park | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=13_Canadian%20Tire%20Motorsport%20Park |
| Road America | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=14_Road%20America |
| VIRginia International Raceway | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=15_VIRginia%20International%20Raceway |
| Tire Rack.com Battle On The Bricks | 6 (1) | yes | JSON | PDF | yes | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=17_Tire%20Rack.com%20Battle%20On%20The%20Bricks |
| Road Atlanta | 6 (1) | yes | JSON | PDF | yes | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=19_Road%20Atlanta |
| Daytona International Speedway *(test/no race)* | 7 (0) | yes | JSON | - | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=24_Daytona%20International%20Speedway |

**2025** (12 events, 12 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| ROAR Before the 24 *(test/no race)* | 8 (0) | yes | JSON | - | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=01_ROAR%20Before%20the%2024 |
| Daytona International Speedway | 7 (1) | yes | JSON | PDF | yes | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=02_Daytona%20International%20Speedway |
| Sebring International Raceway | 7 (1) | yes | JSON | PDF | yes | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=06_Sebring%20International%20Raceway |
| Long Beach Street Circuit | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=07_Long%20Beach%20Street%20Circuit |
| Weathertech Raceway Laguna Seca | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=10_Weathertech%20Raceway%20Laguna%20Seca |
| Detroit Street Course | 8 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=11_Detroit%20Street%20Course |
| Watkins Glen International | 7 (1) | yes | JSON | PDF | yes | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=14_Watkins%20Glen%20International |
| Canadian Tire Motorsport Park | 7 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=15_Canadian%20Tire%20Motorsport%20Park |
| Road America | 7 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=16_Road%20America |
| VIRginia International Raceway | 7 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=17_VIRginia%20International%20Raceway |
| Indianapolis Motor Speedway RC | 5 (1) | yes | JSON | PDF | yes | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=20_Indianapolis%20Motor%20Speedway%20RC |
| Road Atlanta | 7 (1) | yes | JSON | PDF | yes | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=22_Road%20Atlanta |

**2026** (13 events, 13 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Daytona Test *(test/no race)* | 7 (0) | yes | JSON | - | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=00_Daytona%20Test |
| ROAR Before the 24 *(test/no race)* | 7 (0) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=01_ROAR%20Before%20the%2024 |
| Daytona International Speedway | 6 (1) | yes | JSON | JSON | yes | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=02_Daytona%20International%20Speedway |
| Sebring International Raceway | 6 (1) | yes | JSON | JSON | yes | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=06_Sebring%20International%20Raceway |
| Long Beach Street Circuit | 5 (1) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=07_Long%20Beach%20Street%20Circuit |
| Weathertech Raceway Laguna Seca | 5 (1) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=09_Weathertech%20Raceway%20Laguna%20Seca |
| Detroit Street Course | 6 (1) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=11_Detroit%20Street%20Course |
| Watkins Glen International | 5 (1) | yes | JSON | JSON | yes | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=14_Watkins%20Glen%20International |
| Canadian Tire Motorsport Park | 6 (1) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=15_Canadian%20Tire%20Motorsport%20Park |
| Road America | 5 (1) | yes | JSON | JSON | yes | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=16_Road%20America |
| VIRginia International Raceway | 6 (1) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=18_VIRginia%20International%20Raceway |
| Indianapolis Motor Speedway RC | 6 (1) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=20_Indianapolis%20Motor%20Speedway%20RC |
| Road Atlanta | 7 (1) | yes | JSON | JSON | yes | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=21_Road%20Atlanta |

### IMSA Michelin Pilot Challenge

Series folder names seen: `01_IMSA Michelin Pilot Challenge`, `02_IMSA Michelin Pilot Challenge`


**2024** (11 events, 10 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| ROAR Before the 24 *(test/no race)* | 5 (0) | yes | CSV | - | - | no - CSV/PDF only | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=01_ROAR%20Before%20the%2024 |
| Daytona International Speedway | 7 (1) | yes | JSON | PDF | - | yes (needs this update) | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=02_Daytona%20International%20Speedway |
| Sebring International Raceway | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=05_Sebring%20International%20Raceway |
| Weathertech Raceway Laguna Seca | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=08_Weathertech%20Raceway%20Laguna%20Seca |
| Mid-Ohio Sports Car Course | 6 (1) | yes | JSON | PDF | yes | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=11_Mid-Ohio%20Sports%20Car%20Course |
| Watkins Glen International | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=12_Watkins%20Glen%20International |
| Canadian Tire Motorsport Park | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=13_Canadian%20Tire%20Motorsport%20Park |
| Road America | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=14_Road%20America |
| VIRginia International Raceway | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=15_VIRginia%20International%20Raceway |
| Tire Rack.com Battle On The Bricks | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=17_Tire%20Rack.com%20Battle%20On%20The%20Bricks |
| Road Atlanta | 5 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=19_Road%20Atlanta |

**2025** (11 events, 11 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| ROAR Before the 24 *(test/no race)* | 6 (0) | yes | JSON | - | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=01_ROAR%20Before%20the%2024 |
| Daytona International Speedway | 7 (1) | yes | JSON | PDF | yes | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=02_Daytona%20International%20Speedway |
| Sebring International Raceway | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=06_Sebring%20International%20Raceway |
| Weathertech Raceway Laguna Seca | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=10_Weathertech%20Raceway%20Laguna%20Seca |
| Mid-Ohio Sports Car Course | 7 (1) | yes | JSON | PDF | yes | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=12_Mid-Ohio%20Sports%20Car%20Course |
| Watkins Glen International | 7 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=14_Watkins%20Glen%20International |
| Canadian Tire Motorsport Park | 7 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=15_Canadian%20Tire%20Motorsport%20Park |
| Road America | 7 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=16_Road%20America |
| VIRginia International Raceway | 7 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=17_VIRginia%20International%20Raceway |
| Indianapolis Motor Speedway RC | 6 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=20_Indianapolis%20Motor%20Speedway%20RC |
| Road Atlanta | 7 (1) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=22_Road%20Atlanta |

**2026** (11 events, 11 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| ROAR Before the 24 *(test/no race)* | 5 (0) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=01_ROAR%20Before%20the%2024 |
| Daytona International Speedway | 7 (1) | yes | JSON | JSON | yes | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=02_Daytona%20International%20Speedway |
| Sebring International Raceway | 5 (1) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=06_Sebring%20International%20Raceway |
| Weathertech Raceway Laguna Seca | 5 (1) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=09_Weathertech%20Raceway%20Laguna%20Seca |
| Mid-Ohio Sports Car Course | 6 (1) | yes | JSON | JSON | yes | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=12_Mid-Ohio%20Sports%20Car%20Course |
| Watkins Glen International | 6 (1) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=14_Watkins%20Glen%20International |
| Canadian Tire Motorsport Park | 6 (1) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=15_Canadian%20Tire%20Motorsport%20Park |
| Road America | 5 (1) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=16_Road%20America |
| VIRginia International Raceway | 6 (1) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=18_VIRginia%20International%20Raceway |
| Indianapolis Motor Speedway RC | 6 (1) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=20_Indianapolis%20Motor%20Speedway%20RC |
| Road Atlanta | 6 (1) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=21_Road%20Atlanta |

### IMSA VP Racing SportsCar Challenge

Series folder names seen: `01_IMSA VP Racing SportsCar Challenge`, `02_IMSA VP Racing SportsCar Challenge`, `03_IMSA VP Racing SportsCar Challenge`


**2024** (6 events, 6 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| ROAR Before the 24 *(test/no race)* | 6 (2) | yes | JSON | PDF | - | yes (needs this update) | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=01_ROAR%20Before%20the%2024 |
| St- Petersburg Street Course | 5 (2) | yes | - | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=04_St-%20Petersburg%20Street%20Course |
| Mid-Ohio Sports Car Course | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=11_Mid-Ohio%20Sports%20Car%20Course |
| Canadian Tire Motorsport Park | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=13_Canadian%20Tire%20Motorsport%20Park |
| VIRginia International Raceway | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=15_VIRginia%20International%20Raceway |
| Road Atlanta | 6 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=19_Road%20Atlanta |

**2025** (6 events, 6 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| ROAR Before the 24 *(test/no race)* | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=01_ROAR%20Before%20the%2024 |
| Circuit of the Americas (VPRC) | 6 (2) | yes | - | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=05_Circuit%20of%20the%20Americas%20%28VPRC%29 |
| Mid-Ohio Sports Car Course | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=12_Mid-Ohio%20Sports%20Car%20Course |
| Canadian Tire Motorsport Park | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=15_Canadian%20Tire%20Motorsport%20Park |
| VIRginia International Raceway | 8 (3) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=17_VIRginia%20International%20Raceway |
| Road Atlanta | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=22_Road%20Atlanta |

**2026** (6 events, 6 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| ROAR Before the 24 *(test/no race)* | 6 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=01_ROAR%20Before%20the%2024 |
| Circuit of the Americas (VPRC) | 6 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=04_Circuit%20of%20the%20Americas%20%28VPRC%29 |
| Mid-Ohio Sports Car Course | 6 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=12_Mid-Ohio%20Sports%20Car%20Course |
| Canadian Tire Motorsport Park | 7 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=15_Canadian%20Tire%20Motorsport%20Park |
| VIRginia International Raceway | 7 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=18_VIRginia%20International%20Raceway |
| Road Atlanta | 7 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=21_Road%20Atlanta |

### IMSA Airbnb Endurance Challenge (2026)

Series folder names seen: `01_IMSA AirBNB Endurance Challenge`


**2026** (4 events, 4 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Sebring International Raceway (AEC) | 5 (1) | yes | JSON | - | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=05_Sebring%20International%20Raceway%20%28AEC%29 |
| Circuit of the Americas (AEC) | 6 (1) | yes | JSON | - | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=10_Circuit%20of%20the%20Americas%20%28AEC%29 |
| VIRginia International Raceway (AEC) | 6 (1) | yes | JSON | - | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=13_VIRginia%20International%20Raceway%20%28AEC%29 |
| Road America (AEC) | 6 (1) | yes | JSON | - | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=17_Road%20America%20%28AEC%29 |

### Mazda MX-5 Cup Shootout

Series folder names seen: `01_Mazda MX-5 Cup Shootout`


**2024** (1 events, 0 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Homestead-Miami Speedway *(test/no race)* | 10 (0) | yes | - | - | - | no - CSV/PDF only | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=22_Homestead-Miami%20Speedway |

**2025** (1 events, 0 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Circuit Florida *(test/no race)* | 15 (0) | yes | - | - | - | no - CSV/PDF only | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=25_Circuit%20Florida |

### Spec MX-5 Shootout

Series folder names seen: `02_Spec MX-5 Shootout`


**2024** (1 events, 0 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Homestead-Miami Speedway *(test/no race)* | 10 (0) | yes | - | - | - | no - CSV/PDF only | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=22_Homestead-Miami%20Speedway |

**2025** (1 events, 0 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Circuit Florida *(test/no race)* | 13 (0) | yes | - | - | - | no - CSV/PDF only | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=25_Circuit%20Florida |

### Mazda MX-5 Cup

Series folder names seen: `01_Welen Mazda MX-5 Cup Presented by Michelin`, `01_Whelen Mazda MX-5 Cup presented by Michelin`, `03_Whelen Mazda MX-5 Cup presented by Michelin`, `04_Whelen Mazda MX-5 Cup presented by Michelin`, `05_Whelen Mazda MX-5 Cup presented by Michelin`, `06_Whelen Mazda MX-5 Cup Presented by Michelin`


**2024** (8 events, 7 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Daytona International Speedway | 7 (2) | yes | JSON | PDF | - | yes (needs this update) | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=02_Daytona%20International%20Speedway |
| Sebring International Raceway | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=05_Sebring%20International%20Raceway |
| Weathertech Raceway Laguna Seca | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=08_Weathertech%20Raceway%20Laguna%20Seca |
| Mid-Ohio Sports Car Course | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=11_Mid-Ohio%20Sports%20Car%20Course |
| Canadian Tire Motorsport Park | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=13_Canadian%20Tire%20Motorsport%20Park |
| VIRginia International Raceway | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=15_VIRginia%20International%20Raceway |
| Road Atlanta | 6 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=19_Road%20Atlanta |
| Martinsville Speedway | 4 (1) | yes | - | - | - | no - CSV/PDF only | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=21_Martinsville%20Speedway |

**2025** (9 events, 6 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Daytona International Speedway | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=02_Daytona%20International%20Speedway |
| St- Petersburg Street Course | 7 (2) | yes | - | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=04_St-%20Petersburg%20Street%20Course |
| Barber Motorsports Park | 6 (2) | yes | - | PDF | - | no - CSV/PDF only | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=08_Barber%20Motorsports%20Park |
| Mid-Ohio Sports Car Course | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=12_Mid-Ohio%20Sports%20Car%20Course |
| Canadian Tire Motorsport Park | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=15_Canadian%20Tire%20Motorsport%20Park |
| VIRginia International Raceway | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=17_VIRginia%20International%20Raceway |
| Martinsville Speedway - Test *(test/no race)* | 2 (0) | yes | - | - | - | no - CSV/PDF only | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=18_Martinsville%20Speedway%20-%20Test |
| Road Atlanta | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=22_Road%20Atlanta |
| Martinsville (MX-5 Cup) | 4 (1) | - | - | - | - | no - PDF/XML only | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=24_Martinsville%20%28MX-5%20Cup%29 |

**2026** (7 events, 7 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Daytona International Speedway | 6 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=02_Daytona%20International%20Speedway |
| St- Petersburg Street Course (MX-5) | 4 (2) | yes | - | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=03_St-%20Petersburg%20Street%20Course%20%28MX-5%29 |
| Mid-Ohio Sports Car Course | 6 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=12_Mid-Ohio%20Sports%20Car%20Course |
| Canadian Tire Motorsport Park | 7 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=15_Canadian%20Tire%20Motorsport%20Park |
| VIRginia International Raceway | 7 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=18_VIRginia%20International%20Raceway |
| Indianapolis Motor Speedway RC | 6 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=20_Indianapolis%20Motor%20Speedway%20RC |
| Road Atlanta | 7 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=21_Road%20Atlanta |

### Porsche Carrera Cup North America

Series folder names seen: `00_Porsche Carrera Cup North America`, `01_Porsche Carrera Cup North America`, `02_Porsche Carrera Cup North America`, `03_Porsche Carrera Cup North America`, `04_Porsche Carrera Cup North America`, `05_Porsche Carrera Cup North America`


**2024** (8 events, 5 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| PCCNA Sebring Test *(test/no race)* | 5 (0) | yes | - | - | - | no - CSV/PDF only | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=03_PCCNA%20Sebring%20Test |
| Sebring International Raceway | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=05_Sebring%20International%20Raceway |
| Miami Grand Prix | 6 (2) | - | - | - | - | no - PDF/XML only | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=07_Miami%20Grand%20Prix |
| Montreal | 6 (2) | - | - | - | - | no - PDF/XML only | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=10_Montreal |
| Watkins Glen International | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=12_Watkins%20Glen%20International |
| Road America | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=14_Road%20America |
| Tire Rack.com Battle On The Bricks | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=17_Tire%20Rack.com%20Battle%20On%20The%20Bricks |
| Road Atlanta | 6 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=19_Road%20Atlanta |

**2025** (8 events, 5 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Sebring International Raceway | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=06_Sebring%20International%20Raceway |
| Miami Grand Prix | 6 (2) | - | - | - | - | no - PDF/XML only | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=09_Miami%20Grand%20Prix |
| Circuit Gilles Villeneuve (PCCNA) | 7 (2) | - | - | - | - | no - PDF/XML only | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=13_Circuit%20Gilles%20Villeneuve%20%28PCCNA%29 |
| Watkins Glen International | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=14_Watkins%20Glen%20International |
| Road America | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=16_Road%20America |
| Indianapolis Motor Speedway RC | 6 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=20_Indianapolis%20Motor%20Speedway%20RC |
| Road Atlanta | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=22_Road%20Atlanta |
| Circuit of the Americas (PCCNA) | 4 (2) | - | - | - | - | no - PDF/XML only | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=23_Circuit%20of%20the%20Americas%20%28PCCNA%29 |

**2026** (8 events, 6 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Sebring International Raceway | 6 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=06_Sebring%20International%20Raceway |
| Long Beach Street Circuit | 6 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=07_Long%20Beach%20Street%20Circuit |
| Miami Grand Prix | 6 (2) | - | - | - | - | no - PDF/XML only | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=08_Miami%20Grand%20Prix |
| Watkins Glen International | 7 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=14_Watkins%20Glen%20International |
| Road America | 8 (3) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=16_Road%20America |
| Indianapolis Motor Speedway RC | 7 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=20_Indianapolis%20Motor%20Speedway%20RC |
| Road Atlanta | 7 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=21_Road%20Atlanta |
| Circuit of The Americas (PCCNA) | 4 (2) | yes | - | - | - | no - CSV/PDF only | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=23_Circuit%20of%20The%20Americas%20%28PCCNA%29 |

### Lamborghini Super Trofeo North America

Series folder names seen: `01_Lamborghini Super Trofeo`, `03_Lamborghini Super Trofeo`


**2024** (5 events, 5 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Sebring International Raceway | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=05_Sebring%20International%20Raceway |
| Weathertech Raceway Laguna Seca | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=08_Weathertech%20Raceway%20Laguna%20Seca |
| Watkins Glen International | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=12_Watkins%20Glen%20International |
| Circuit of the Americas | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=16_Circuit%20of%20the%20Americas |
| Tire Rack.com Battle On The Bricks | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=17_Tire%20Rack.com%20Battle%20On%20The%20Bricks |

**2025** (6 events, 5 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Sebring International Raceway | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=06_Sebring%20International%20Raceway |
| Weathertech Raceway Laguna Seca | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=10_Weathertech%20Raceway%20Laguna%20Seca |
| Watkins Glen International | 9 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=14_Watkins%20Glen%20International |
| Road America | 9 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=16_Road%20America |
| Indianapolis Motor Speedway RC | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=20_Indianapolis%20Motor%20Speedway%20RC |
| Misano World Circuit (LST) | 7 (2) | yes | - | - | - | no - CSV/PDF only | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=26_Misano%20World%20Circuit%20%28LST%29 |

**2026** (6 events, 5 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Sebring International Raceway | 7 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=06_Sebring%20International%20Raceway |
| Weathertech Raceway Laguna Seca | 7 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=09_Weathertech%20Raceway%20Laguna%20Seca |
| Watkins Glen International | 7 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=14_Watkins%20Glen%20International |
| Road America | 8 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=16_Road%20America |
| Indianapolis Motor Speedway RC | 8 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=20_Indianapolis%20Motor%20Speedway%20RC |
| Autodromo Nazionale Monza (LST) | 6 (2) | - | - | - | - | no - PDF/XML only | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=22_Autodromo%20Nazionale%20Monza%20%28LST%29 |

### Ford Mustang Cup

Series folder names seen: `_Ford Mustang Cup`


**2025** (1 events, 0 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| VIRginia International Raceway *(test/no race)* | 1 (0) | yes | CSV | - | - | no - CSV/PDF only | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=03_VIRginia%20International%20Raceway |

### Mustang Challenge

Series folder names seen: `01_Mustang Challenge`, `01_Mustang Challenge North America`, `02_Mustang Challenge`, `04_Mustang Challenge`, `04_Mustang Challenge North America`, `05_Mustang Challenge`, `05_Mustang Challenge North America`


**2024** (5 events, 5 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Mid-Ohio Sports Car Course | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=11_Mid-Ohio%20Sports%20Car%20Course |
| Watkins Glen International | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=12_Watkins%20Glen%20International |
| Road America | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=14_Road%20America |
| Circuit of the Americas | 6 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=16_Circuit%20of%20the%20Americas |
| Indianapolis Motor Speedway RC | 5 (2) | yes | - | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=18_Indianapolis%20Motor%20Speedway%20RC |

**2025** (6 events, 5 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Sebring International Raceway | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=06_Sebring%20International%20Raceway |
| Weathertech Raceway Laguna Seca | 7 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=10_Weathertech%20Raceway%20Laguna%20Seca |
| Road America | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=16_Road%20America |
| VIRginia International Raceway | 8 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=17_VIRginia%20International%20Raceway |
| Circuit of the Americas (MC) | 7 (2) | yes | CSV | PDF | - | no - CSV/PDF only | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=19_Circuit%20of%20the%20Americas%20%28MC%29 |
| Charlotte Motor Speedway | 6 (2) | yes | - | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=21_Charlotte%20Motor%20Speedway |

**2026** (6 events, 6 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Sebring International Raceway | 6 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=06_Sebring%20International%20Raceway |
| Weathertech Raceway Laguna Seca | 5 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=09_Weathertech%20Raceway%20Laguna%20Seca |
| Mid-Ohio Sports Car Course | 6 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=12_Mid-Ohio%20Sports%20Car%20Course |
| Watkins Glen International | 7 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=14_Watkins%20Glen%20International |
| VIRginia International Raceway | 7 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=18_VIRginia%20International%20Raceway |
| Circuit of The Americas (MC) | 7 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=19_Circuit%20of%20The%20Americas%20%28MC%29 |

### Historic Sportscar Racing (HSR Classic 24)

Series folder names seen: `04_Historic Sportscar Racing`


**2025** (1 events, 1 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Daytona International Speedway | 4 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=25_2025&evvent=02_Daytona%20International%20Speedway |

**2026** (1 events, 1 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| Daytona International Speedway | 4 (2) | yes | JSON | JSON | - | yes | https://imsa.results.alkamelcloud.com/?season=26_2026&evvent=02_Daytona%20International%20Speedway |

### NASCAR Classic (HSR)

Series folder names seen: `05_NASCAR Classic Presented by Petty's Garage`


**2024** (1 events, 1 importable)

| Event | Sessions (races) | Time cards | Weather | Flags | Hour results | Importable | Results URL |
|---|---|---|---|---|---|---|---|
| VIRginia International Raceway | 4 (2) | yes | JSON | PDF | - | yes | https://imsa.results.alkamelcloud.com/?season=24_2024&evvent=15_VIRginia%20International%20Raceway |

## Formula 1 — FIA Formula One World Championship (Jolpica + OpenF1)

F1 does not use Al Kamel. `scripts/import-f1.mjs` imports Grands Prix and Sprints from two open APIs:

| Source | Used for |
|---|---|
| [Jolpica](https://api.jolpi.ca/ergast/f1/) (Ergast-compatible) | calendar, race / sprint / qualifying classifications (Q1–Q3), championship points incl. the 2024 fastest-lap point, drivers (date of birth, nationality), constructors, official standings for verification, lap times as a fallback |
| [OpenF1](https://api.openf1.org/v1/) | session times (local), practice and sprint-qualifying classifications, lap-by-lap timing → `v2_lap_times.elapsed`, tyre stints → `v2_stints`, pit-lane passages → `v2_pit_stops`, race control → `v2_annotation_items` and `v2_flag_segments`, weather → `v2_session_weather` |

```bash
# one season per run; every API response is cached (default .cache/f1, git-ignored; or F1_CACHE / --cache)
node --experimental-strip-types scripts/import-f1.mjs --year 2025              # every round with race results
node --experimental-strip-types scripts/import-f1.mjs --year 2026 --round 19     # one round
node --experimental-strip-types scripts/import-f1.mjs --year 2025 --replace     # re-import rounds already in the data
node --experimental-strip-types scripts/import-f1.mjs --year 2025 --verify-only # stored points vs official standings
node --experimental-strip-types scripts/f1-media.mjs                            # liveries + track maps (see docs/CREDITS.md)
node --experimental-strip-types scripts/recompute-fingerprints.mjs
```

How the data is shaped:

- Series `Formula 1` (short `F1`; aliases F1 / Formula One / FIA Formula One World Championship — the site picks F1
  rules by this name); one single-class season per year, no classes (`extra_data.Class` unset). Events are named `<year> <Grand Prix name>` with the Jolpica round number; rounds without race
  results yet are skipped (re-run after the weekend).
- Sessions: `Practice 1–3` (practice), `Sprint Qualifying` and `Qualifying` (qualifying), `Sprint` (sprint_race),
  `Race` (race), in chronological order, with local start/end times.
- Teams are constructors (one `v2_teams` row each, `team_id` set on every result row; Sauber and Audi are separate constructors); cars are the chassis per
  season (`v2_cars` e.g. McLaren MCL39, linked in `v2_team_season_cars`). Drivers are matched to existing rows by
  accent-insensitive name, or birthday + family name.
- `v2_race_results.points` are the points awarded in that session (sprint points on the Sprint row, the 2024
  fastest-lap point on the Race row). Classified retirements are `classified` with the reason in `dnf_reason`;
  `extra_data` carries `PIC` (= position; the site reads wins, podiums and poles from it), the grid position, `position_text` and the fastest-lap rank. Grand Prix qualifying rows also carry `PIC` (pole = PIC 1; sprint-qualifying rows deliberately do not, so sprint poles are not counted as poles). Qualifying rows carry `q1_time`–`q3_time`; `best_time` is the time from the
  last part reached and `gap_to_pole` is relative to the fastest time in that part.
- Lap elapsed times are measured from the race start, set so the winner's last lap ends at the official race time
  (so red-flag stoppages are included, as in the official time). When OpenF1 is missing laps (2025 Miami), the race's
  Jolpica lap times are used instead. Flags: SC from "SAFETY CAR DEPLOYED" until the track goes green after
  "SAFETY CAR IN THIS LAP"; VSC → `VSC`; track red flag → `RED` until the session restarts; full-track yellows →
  `YELLOW`; `CHEQUERED` from the chequered flag until the last car finishes. Blue-flag messages are left out of the race-control annotations.
- After a full-season run the script compares every driver's and constructor's stored points with Jolpica's official
  standings and prints any mismatch (2024 and 2025 match exactly; 2026 matches through the last imported round).

## NASCAR Cup Series (cf.nascar.com feeds)

NASCAR Cup data does not come from Al Kamel. `scripts/import-nascar.mjs` reads the public JSON
feeds the NASCAR apps use on `cf.nascar.com` (series_id 1 = Cup) and writes through the local
store like the IMSA importer. Imported so far: **2024** (36 points races), **2025** (36) and
**2026** (34 run as of 2026-11-01; Martinsville and the Homestead finale are skipped until their
results are posted — rerun the season to add them).

```bash
# whole seasons (events that already have sessions are skipped)
node --experimental-strip-types scripts/import-nascar.mjs --season 2024 --season 2025 --cache ~/.cache/nascar
# one race weekend again, after NASCAR revised it (a Duel race id re-imports its Daytona 500 event)
node --experimental-strip-types scripts/import-nascar.mjs --season 2026 --race 5632 --replace --cache ~/.cache/nascar
# --preview fetches and counts only; then, as always:
node --experimental-strip-types scripts/recompute-fingerprints.mjs
```

| Feed | Used for |
|---|---|
| `cacher/<year>/1/race_list_basic.json` | schedule and race ids (`race_type_id` 1 = points race; 2 = Clash, Duels, All-Star) |
| `cacher/<year>/1/<race_id>/weekend-feed.json` | race results (`points_earned` already includes stage points), stage results, laps led, cautions, practice and qualifying runs |
| `cacher/<year>/1/<race_id>/lap-times.json` | every car's lap times and running position per lap, per-lap flag state → `v2_lap_times`, `v2_flag_segments` |
| `cacher/<year>/1/<race_id>/lap-notes.json` | lap-by-lap notes → Race Control |
| `cacher/live/series_1/<race_id>/live-pit-data.json` | pit stops (lap, pit-road time) |
| `cacher/live/series_1/<race_id>/live-flag-data.json` | red flags, green-flag time of day |
| `live/feeds/series_1/<race_id>/live_points.json` | per-race points, only when the weekend feed was never filled (2025 Talladega playoff race) |
| `cacher/drivers.json` | date of birth and hometown country of new drivers |
| `cacher/<year>/1/points-feed.json` | official final standings, used only to verify |

How the feeds are mapped:

- One event per race weekend at its track **layout** (oval and road course at the same venue are
  separate layouts: Charlotte oval / Roval, Daytona, Indianapolis, COTA Grand Prix 2024 / National
  Circuit 2025–). Sessions: practice runs, every qualifying round, the race; the Daytona Duels are
  `sprint_race` sessions of the Daytona 500 event (they pay points to the top 10). Exhibition races
  (Clash, All-Star Open/Race) are not imported.
- `points` = `points_earned` from the weekend feed (finish + stage points, + the 2025–26 fastest-lap
  point). Post-race penalties and the playoff reset are **not** in the per-race data: summing
  `points` gives each driver's points earned on track, not NASCAR's official playoff standings.
  `extra_data` holds `Start`, `Laps Led`, `Stage N` (stage finishing position), `Stage N Pts`,
  `Playoff Pts`, sponsor, crew chief and manufacturer.
- Lap times start at each car's own crossing of the start line, and red-flag laps are sometimes
  9999.999 or missing. Elapsed time = cumulative lap time + a per-car offset (start-line delay, and a
  re-sync after unknown laps) fitted so the order of line crossings agrees with the running
  positions NASCAR publishes for every lap and with the final classification. Unknown laps are
  estimated from the field's median lap; when the lap feed stops early (2025 Brickyard, 2026
  Southern 500) the missing laps are estimated the same way. Red-flag time that NASCAR counted
  inside a lap stays in the timeline.
- Flags: each leader lap's flag state (green/white → GREEN, caution → YELLOW, red flag → RED).
- Pit stops: placed on the car's own lap timeline; `stop_duration` is the pit-road time.
- `nascar.com`, `jayski.com` and the team sites answer 403 / a bot challenge to scripts, so no car
  side-profile images could be sourced for the Cup cars (the feeds carry none).
