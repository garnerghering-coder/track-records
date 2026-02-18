

## Scale Up: Auto-Discovery, Scheduled Imports, and Community Submissions

### Overview
Three new systems to dramatically reduce manual work: (1) an AI-powered series discovery tool that finds and imports all races for an entire series/season automatically, (2) scheduled recurring imports from known results websites, and (3) a public submission form so drivers/teams can contribute their own results.

---

### 1. Series Auto-Discovery (Admin Tool)

A new admin tool where you type something like "IMSA SportsCar Championship 2024" and the system automatically:
- Searches the web to find the full season calendar
- Discovers result URLs for each round
- Scrapes and imports each race's results one by one
- Shows progress as it works through the season

**How it works:**
1. Admin enters a series name + year (e.g. "F4 US Championship 2024")
2. A new edge function `discover-series` uses Firecrawl search to find the season calendar and individual race result pages
3. For each discovered race, it calls the existing `scrape-race-results` logic to import results
4. The UI shows a progress log: "Found 12 rounds... Importing Round 1... Imported 30 entries... Importing Round 2..."
5. Skips events that already exist in the database (matched by event name + series + year)

**New edge function:** `supabase/functions/discover-series/index.ts`
- Accepts `{ seriesName: string, seasonYear: number }`
- Step 1: Firecrawl search for `"{seriesName} {seasonYear} full season results schedule"` 
- Step 2: From results, use AI to extract a list of race event names and their result page URLs
- Step 3: For each event URL, scrape and import using the same logic as `scrape-race-results`
- Returns a summary: events found, events imported, events skipped (already exist), errors

**Admin UI changes:**
- New section in the "Add Race" tab: "Import Entire Series"
- Input fields: series name, year
- "Discover & Import" button
- Progress display showing each round being processed with status indicators

---

### 2. Scheduled Imports (Recurring Sources)

A new database table `import_sources` stores URLs of websites that publish race results regularly (e.g., a specific series results page). A cron job checks these periodically and imports any new results.

**Database changes:**

```text
TABLE: import_sources
  id          uuid PK
  name        text          -- friendly name like "IMSA Results Page"
  url         text          -- URL to scrape
  series_hint text          -- helps AI identify the series
  frequency   text          -- 'daily', 'weekly', 'monthly'
  last_run_at timestamptz
  last_status text          -- 'success', 'error', 'no_new_data'
  is_active   boolean       -- enable/disable
  created_at  timestamptz
  created_by  uuid
```

RLS: Admin-only for all operations.

**New edge function:** `supabase/functions/scheduled-import/index.ts`
- Called by a pg_cron job (daily)
- Queries `import_sources` for active sources due for a run
- For each source, scrapes the URL and imports results, skipping events already in the database
- Updates `last_run_at` and `last_status`

**Cron setup:** A daily pg_cron job that calls the `scheduled-import` function.

**Admin UI:**
- New tab or section: "Import Sources"
- Table listing all sources with name, URL, frequency, last run status, active toggle
- Add/edit/delete sources
- "Run Now" button to trigger an immediate import for a specific source

---

### 3. Community Submissions

Let logged-in users (drivers, teams) submit race results through a public form. Submissions go into a review queue for admin approval before being added to the main database.

**Database changes:**

```text
TABLE: community_submissions
  id              uuid PK
  submitted_by    uuid          -- auth user who submitted
  event_name      text
  series_name     text
  season_year     integer
  event_date      date
  category        racing_category
  location        text
  raw_data        text          -- the pasted/typed results text
  parsed_entries  jsonb         -- AI-parsed structured data (stored for admin review)
  status          text          -- 'pending', 'approved', 'rejected'
  admin_notes     text
  reviewed_by     uuid
  reviewed_at     timestamptz
  created_at      timestamptz
```

RLS: Users can insert and view own. Admins can view/update all.

**How it works:**
1. Any logged-in user visits a "Submit Results" page
2. They fill in event details (series, event name, year) and paste raw results text (or upload a PDF)
3. On submission, the `import-race-results` edge function parses the data but instead of inserting into `race_events`, it stores the parsed result in `community_submissions` as `parsed_entries` JSON
4. Admin sees a "Community" tab showing pending submissions
5. Admin can preview the parsed data, edit if needed, then approve (which triggers the actual import) or reject with notes

**New edge function:** `supabase/functions/parse-submission/index.ts`
- Same AI parsing logic as `import-race-results` but returns the parsed data instead of inserting it
- Stores result in `community_submissions`

**New page:** `src/pages/Submit.tsx`
- Public-facing form for submitting results
- Fields: series name, event name, year, category, raw results text (textarea), optional PDF upload
- Shows submission status history for the logged-in user

**Admin UI:**
- New "Community" tab in Admin dashboard
- Lists pending submissions with event details and submitter info
- Preview shows the AI-parsed entries
- Approve button imports the data; Reject button with notes field

---

### Technical Details

**Files to create:**
- `supabase/functions/discover-series/index.ts` -- Series auto-discovery
- `supabase/functions/scheduled-import/index.ts` -- Cron-triggered import runner
- `supabase/functions/parse-submission/index.ts` -- Parse community submission without inserting
- `src/pages/Submit.tsx` -- Public submission form

**Files to modify:**
- `src/pages/Admin.tsx` -- Add series discovery UI, import sources management, community review tab
- `src/App.tsx` -- Add /submit route
- `supabase/config.toml` -- Register new edge functions

**Database migrations:**
- Create `import_sources` table with admin-only RLS
- Create `community_submissions` table with user insert + own select, admin full access
- Enable pg_cron and pg_net extensions
- Create daily cron job for scheduled imports

**Implementation order:**
1. Database migrations (both tables + cron)
2. Series auto-discovery (highest impact -- one click imports an entire season)
3. Community submissions (lets others help you)
4. Scheduled imports (ongoing automation)

