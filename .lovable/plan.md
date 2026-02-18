

## Remove Verified Checks + Fix Enrichment + Auto-Enrich on Import

### 1. Remove Verified Checks from Search Page

Remove the "verified results" count logic from `src/pages/Search.tsx`:
- Delete the query to `race_results` that filters by `verification_status = "verified"`
- Remove the `verified_count` property from driver cards
- Remove the green checkmark badge showing "X verified results"

Also remove from `src/pages/DriverProfile.tsx` any verification badge filtering if present (the `VerificationBadge` component stays since it shows status, but we stop using it as a gate).

### 2. Fix Enrichment Quality Issues

The AI sometimes returns the literal string `"null"` instead of JSON `null`. For example: `"nationality":"null"`. The code treats this as a valid value and writes it to the database.

**Fix in `enrich-driver-profile/index.ts`:**
- After parsing the AI JSON, sanitize all fields: convert string `"null"`, `"unknown"`, `"N/A"`, empty strings to actual `null`
- Improve the system prompt to be more aggressive about finding data -- remove "Only return data you are confident about" and instead tell the AI to try harder, use context clues from the driver name, and provide best-effort answers
- Increase `max_tokens` to 4096 (currently 2048) to give the AI more room

### 3. Auto-Enrich New Drivers on Import

When `import-race-results` creates new driver profiles (lines 289-303), it currently just inserts a bare `first_name` + `last_name`. After the import completes, it should automatically trigger enrichment for all newly created profiles.

**Changes to `import-race-results/index.ts`:**
- After the import loop finishes, collect all newly created driver profile IDs
- Call the `enrich-driver-profile` edge function internally (or inline the enrichment logic) for each new driver
- This way every new driver gets enriched immediately without admin intervention

The simplest approach: after the import response is built, make an internal HTTP call to the enrich function with the list of new driver IDs. Since the import already runs as an admin, it can pass the same auth token.

### Technical Details

**Search.tsx changes:**
- Remove lines 59-75 (verified counts query)
- Remove `verified_count` from driver type and card rendering
- Remove the `CheckCircle` import if unused

**enrich-driver-profile/index.ts changes:**
- Add sanitization after JSON parse:
```typescript
// Sanitize string "null" values
for (const key of Object.keys(enriched)) {
  if (typeof enriched[key] === "string" && 
      ["null", "unknown", "n/a", ""].includes(enriched[key].toLowerCase().trim())) {
    enriched[key] = null;
  }
}
```
- Update system prompt to be more assertive about finding data

**import-race-results/index.ts changes:**
- After the import loop, if `createdCount > 0`, call the enrich function:
```typescript
if (createdDriverIds.length > 0) {
  // Fire-and-forget enrichment for new drivers
  fetch(`${SUPABASE_URL}/functions/v1/enrich-driver-profile`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ driverProfileIds: createdDriverIds }),
  }).catch(err => console.error("Auto-enrich failed:", err));
}
```

### No database changes needed

