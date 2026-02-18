

## Fix: Skip to Next AI Key on 402 (Insufficient Credits)

### The Problem

The `callAI` shared helper only retries on HTTP 429 (rate limited). The llmapi.ai key is returning **402** ("Organization has insufficient credits"), which the helper treats as a valid response and returns immediately -- never trying the Google AI Studio key at priority 2.

### The Fix

In `supabase/functions/_shared/call-ai.ts`, change the retry condition from checking only `429` to also checking `402`. This way, keys that are out of credits are skipped just like rate-limited ones.

### Technical Details

**File: `supabase/functions/_shared/call-ai.ts`**

Line 32-35: Change the single 429 check to also handle 402:

```text
// Before:
if (resp.status === 429) {
  console.log(`Key "${key.id}" rate limited, trying next...`);
  continue;
}

// After:
if (resp.status === 429 || resp.status === 402) {
  console.log(`Key "${key.id}" returned ${resp.status} (${resp.status === 429 ? 'rate limited' : 'insufficient credits'}), trying next...`);
  continue;
}
```

Same change for the Groq fallback on line 67:

```text
// Before:
if (resp.status !== 429) return resp;

// After:
if (resp.status !== 429 && resp.status !== 402) return resp;
```

One file changed, two lines modified. The `discover-series` function (and all other AI callers) will automatically benefit since they all use `callAI`.

