

## Fix "Import error: failed to fetch"

### Root Cause

The `import-race-results` edge function crashes on boot because `npm:pdf-parse/lib/pdf-parse.js` is not a valid export path in the `pdf-parse` package when running in Deno's edge runtime. The function never starts, so every request returns a network-level "failed to fetch" error.

### Fix

Replace the `pdf-parse` import with `npm:pdf-parse` (default entry point). If that also fails in the edge runtime, fall back to a simpler approach: use the `pdf-lib` library (`npm:pdf-lib`) to check the PDF is valid, but rely on a different text extraction method.

The most reliable approach for Deno edge functions is to use `npm:pdfjs-dist` or simply change the import to `npm:pdf-parse` (without the subpath).

**File: `supabase/functions/import-race-results/index.ts`**

1. Change the import from:
   ```typescript
   import pdf from "npm:pdf-parse/lib/pdf-parse.js";
   ```
   to:
   ```typescript
   import pdf from "npm:pdf-parse";
   ```

2. If that still fails in the edge runtime, switch to an alternative: extract PDF text using the Lovable AI gateway's multimodal capabilities by sending the PDF as base64 directly to the AI model (Gemini supports PDF input), eliminating the need for a separate PDF parsing library entirely.

### Recommended Approach: Drop pdf-parse, use AI directly

Since Gemini 2.5 Flash natively accepts PDF content, the cleanest fix is:
- Remove the `pdf-parse` dependency entirely
- When a PDF is uploaded, send the base64 PDF directly to the AI model as part of the prompt
- This eliminates the brittle npm dependency and lets the AI read the PDF natively

**Changes to `supabase/functions/import-race-results/index.ts`:**
- Remove `import pdf from "npm:pdf-parse/lib/pdf-parse.js"`
- Remove the PDF text extraction block
- When `pdfBase64` is provided, include it in the AI request as a file attachment (Gemini supports `inline_data` with `application/pdf` mime type)
- Keep the `rawText` path unchanged for plain text input

### No database changes needed

