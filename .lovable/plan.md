

## Fix: PDF Parsing with AI Fallback + Non-AI Text Extraction

### Approach

Use a two-layer strategy:
1. **Primary: Text-based extraction (no AI needed)** -- Extract raw text from the PDF using a lightweight Deno-compatible PDF text extraction library (`pdf-parse`), then use regex/heuristic parsing to identify the tabular structure (position, car number, driver, team, times, etc.)
2. **Fallback: AI extraction** -- If text extraction fails or produces too few results (e.g. scanned/image-only PDFs), fall back to the `callAI` shared helper which rotates through database-stored API keys before hitting the Lovable gateway

### How text-based parsing works

FIA/motorsport classification PDFs follow consistent tabular formats. The text extractor pulls all text from the PDF, then a parser:
- Splits into lines
- Identifies header rows (looking for "POS", "NO", "DRIVER", "TEAM", "TIME", "GAP", "LAPS", etc.)
- Parses each subsequent line by matching columns based on patterns (numbers for position/car number, names for driver/team, time patterns like `1:23.456` for lap times)
- Returns structured JSON in the same format the AI would

This handles most official timing PDFs without any AI calls at all.

### Changes

**File: `supabase/functions/parse-session-pdf/index.ts`**

1. Add `pdf-parse` import for text extraction from PDF bytes
2. Add a `parseTextResults(text, sessionType)` function that:
   - Splits extracted text into lines
   - Detects column headers via keyword matching
   - Parses each data row using positional/regex logic
   - Returns `{ results: [...] }` or `null` if it can't make sense of the text
3. Restructure the main flow:
   - Store PDF (unchanged)
   - Extract text from PDF using pdf-parse
   - Attempt `parseTextResults()` on the extracted text
   - If it returns valid results (at least 3 rows), return those immediately -- no AI needed
   - If it fails or returns too few rows, fall back to `callAI()` (using the shared helper with key rotation) instead of direct Lovable gateway calls
4. Return a `method: "text"` or `method: "ai"` field so the frontend knows which path was used

### Text parsing heuristics

Common motorsport PDF patterns to handle:
- Position is always the first number (1, 2, 3...)
- Car number follows position (often 2-3 digits)
- Driver name is the first text field (may be "LASTNAME Firstname" or "Firstname LASTNAME")
- Team/entrant name follows driver
- Time fields match patterns like `\d+:\d+\.\d+` or `+\d+\.\d+s`
- Status indicators: "DNF", "DNS", "DSQ", "RET", "NOT CLASSIFIED"
- Laps are standalone integers near the end of a row

### Files modified

- `supabase/functions/parse-session-pdf/index.ts` -- complete rewrite with text-first approach + AI fallback using `callAI`

No frontend changes needed -- the response format stays the same.

