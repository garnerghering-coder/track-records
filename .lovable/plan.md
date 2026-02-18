

## Improve Discovery: Auto-Search for Missing Result URLs

### The Problem

The discovery flow does one broad search (e.g. "Formula 1 2025 full season race results"), gets 10 results back, and asks AI to extract event names + URLs from those pages. But 10 search results can't cover all 24 races -- so 17 events get "no results URL found" and are skipped entirely.

### The Fix

When an event has no `result_url` after the initial AI extraction, instead of skipping it, do a **targeted Firecrawl search** for that specific event. For example: `"Miami Grand Prix 2025 race results"`. Then extract the best URL from those targeted results and proceed with the scrape.

### How It Works (Step by Step)

1. Initial broad search + AI extraction (unchanged)
2. For each event in the loop:
   - If it already has a `result_url` -- import as before
   - If `result_url` is null -- run a focused Firecrawl search for that event
   - Ask AI to pick the best result URL from the targeted search
   - If a URL is found, proceed with the scrape import
   - If still no URL, log it as "no URL" (same as today)

### Technical Details

**File: `supabase/functions/discover-series/index.ts`**

Replace the current "no URL" skip block (lines 215-222) with a targeted search + URL extraction flow:

```text
if (!event.result_url) {
  // Targeted search for this specific event
  await updateJob({}, `🔍 [${i+1}/${events.length}] ${event.event_name} — searching for results...`);

  const targetSearch = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `${event.event_name} ${seasonYear} race results classification`,
      limit: 5,
    }),
  });

  if (targetSearch.ok) {
    const targetData = await targetSearch.json();
    const targetResults = targetData.data || [];

    if (targetResults.length > 0) {
      // Ask AI to pick the best URL
      const urlPickResponse = await callAI({ ... });
      // Extract chosen URL, set event.result_url
    }
  }

  // If still no URL after targeted search, skip as before
  if (!event.result_url) {
    noUrl++;
    await updateJob({ events_no_url: noUrl }, `⚠️ ...`);
    continue;
  }
}
```

The AI prompt for URL selection will receive the list of search result URLs + titles and pick the one most likely to contain actual race classification/results data (not news articles, previews, or betting sites).

### Impact

- For the F1 2025 example, this would have turned 17 skipped events into ~17 additional imports
- Each missing event costs one extra Firecrawl search (cheap) + one short AI call to pick the URL
- No changes to the database schema or frontend
- Only the `discover-series` edge function is modified
