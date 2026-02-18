

## Background Job Queue for Series Discovery

### What Changes

Right now, series discovery requires you to stay on the page watching the progress stream. If you navigate away, the connection breaks and you lose track. This plan converts it to a **background job system** where:

- You can **queue multiple series** at once (e.g., "IMSA 2025" and "F4 US 2024" simultaneously)
- Jobs **run entirely server-side** -- you can close the browser and come back later
- A **jobs dashboard** shows all queued/running/completed jobs with their progress logs
- Multiple jobs can process at the same time

### How It Works

1. **New `discovery_jobs` table** stores each job with its status, progress log, and results
2. When you click "Discover and Import", it creates a row in the table and immediately calls the edge function in a fire-and-forget style
3. The edge function updates the job row as it progresses (writing log entries and status updates to the database)
4. The Admin UI polls the table every few seconds to show live progress, or you can refresh anytime to see current state
5. You can queue another series while the first is still running -- each gets its own job row and edge function invocation

### UI Changes

The "Import Entire Series" section gets redesigned:
- **Input area stays the same** (series name + year + button)
- Below it, a **jobs list** shows all discovery jobs (recent first) with:
  - Series name, year, status badge (queued / running / completed / failed)
  - Progress bar (e.g., "5/12 events imported")
  - Expandable log showing the detailed progress messages
  - A "Cancel" option for running jobs
- You can submit a new series even while others are running

### Technical Details

**New database table: `discovery_jobs`**
```text
- id (uuid, primary key)
- series_name (text)
- season_year (integer)  
- status (text: 'queued', 'running', 'completed', 'failed')
- progress_log (jsonb array of log entries)
- events_found (integer, nullable)
- events_imported (integer, default 0)
- events_skipped (integer, default 0)
- events_failed (integer, default 0)
- events_no_url (integer, default 0)
- created_by (uuid)
- created_at (timestamptz)
- updated_at (timestamptz)
```

RLS: admins can read/write their own jobs.

**File: `supabase/functions/discover-series/index.ts`**
- Accept an optional `jobId` parameter
- Instead of streaming progress to the HTTP response, write progress to the `discovery_jobs` row in the database
- Update `status`, `progress_log`, and counter fields as each event is processed
- Return immediately after starting the background work (fire-and-forget pattern using `EdgeRuntime.waitUntil` or a detached async block)

**File: `src/pages/Admin.tsx`**
- Replace the streaming fetch with a simple POST that creates the job and returns the job ID
- Add a `discoveryJobs` state array, fetched on load and polled every 5 seconds while any job is "running"
- Render the jobs list with status badges, progress counters, and expandable logs
- The "Discover and Import" button creates a new job without blocking -- you can immediately queue another

