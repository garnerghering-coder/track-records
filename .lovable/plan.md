

## Remove AI Keys Tab + Add Job Management Actions

### What Changes

1. **Remove the "AI Keys" tab entirely** from the Admin UI -- all state, functions, and UI related to managing API keys in the browser will be deleted. The shared `callAI` backend helper and the `ai_api_keys` database table stay in place (they already work for key rotation behind the scenes), but there will be no UI tab for them.

2. **Add Delete and Cancel buttons to discovery jobs** in the existing jobs list:
   - **Completed/Failed jobs**: A trash icon button to delete the job row from the database, removing it from the list
   - **Running/Queued jobs**: A cancel button that sets the job status to `"cancelled"`, which the edge function will check between event imports and stop processing

3. **Edge function update**: The `discover-series` function will check the job status before importing each event. If status has been changed to `"cancelled"`, it stops processing and logs that it was cancelled.

### UI Changes

In the discovery jobs list, each job card gets action buttons in the top-right:
- Running/queued jobs: a "Cancel" button (X icon)
- Completed/failed/cancelled jobs: a "Remove" button (trash icon)

### Technical Details

**File: `src/pages/Admin.tsx`**
- Remove all `aiKeys` state variables (`aiKeys`, `newKeyLabel`, `newKeyProviderUrl`, `newKeyModel`, `newKeyApiKey`, `addingKey`)
- Remove `fetchAiKeys`, `handleAddAiKey`, `handleToggleAiKey`, `handleDeleteAiKey` functions
- Remove the "AI Keys" `TabsTrigger` and `TabsContent`
- Remove the `Key` icon import (if unused elsewhere)
- Add `handleCancelJob(jobId)` -- updates the job row status to `"cancelled"`
- Add `handleDeleteJob(jobId)` -- deletes the job row from the database
- Add cancel/delete buttons to each job card

**File: `supabase/functions/discover-series/index.ts`**
- Inside the event import loop, before processing each event, fetch the current job status from the database
- If status is `"cancelled"`, break the loop and update the job with a cancellation log message
