## Completed: Fix Unreliable Driver Enrichment + Photo Search

### Changes Made

1. **Switched enrichment from tool calling to JSON mode** — more reliable, consistent results
2. **Added `force` option** — admins can re-enrich drivers even if fields are populated
3. **Removed "Unclaimed" badges** from driver profile and search pages
4. **Added real photo search** — during enrichment, uses Firecrawl to search for actual driver photos online, downloads and uploads them to storage
