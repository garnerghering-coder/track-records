

# Parse Flags Analysis PDF in IMSA Importer

## Overview
Add a PDF fallback to the IMSA importer so that when no `.JSON` flags file is found (as is the case for 2025 events), it fetches the corresponding `.PDF` file, extracts text via Gemini Flash Lite (OCR only, no interpretation), then parses the flag table deterministically using regex.

## How it works

The Flags Analysis PDF has a perfectly consistent table:

```text
| Flag               | Time         | Session Elapsed | Flag Time   | Acum. Flag Time | Lap |
| GREEN FLAG         | 13:40:28.229 | -               | 2:08:11.101 | 2:08:11.101     | 1   |
| FULL COURSE YELLOW | 15:48:39.330 | 2:08:11.101     | 22:55.339   | 22:55.339       | 76  |
```

The "Session Elapsed" column gives the exact elapsed time of each flag change. The existing `parseElapsedToSeconds()` function already handles this format (`H:MM:SS.mmm`). The flag names map directly to the existing `StrategyFlagState` type.

**No AI is used for data interpretation.** Gemini Flash Lite is used purely as a PDF-to-text extractor (OCR). All parsing is deterministic regex.

## Changes

### File: `supabase/functions/import-imsa-results/index.ts`

**1. Collect PDF links alongside JSON links (~line 945)**

Add a new regex to collect `25_FlagsAnalysis*.PDF` links from the HTML page listing:

```typescript
const flagsPdfRegex = /href="([^"]+25_FlagsAnalysis[^"]*\.PDF)"/gi;
const allFlagsPdfLinks: string[] = [];
while ((match = flagsPdfRegex.exec(html)) !== null) {
  allFlagsPdfLinks.push(match[1]);
}
```

**2. Build a PDF flags map (~line 1280)**

Mirror the existing `flagsByKey` mapping but for PDF URLs:

```typescript
const flagsPdfByKey = new Map<string, string>();
for (const fl of allFlagsPdfLinks) {
  if (matchesSeriesFolder(fl)) {
    const decoded = decodeURIComponent(fl);
    const tsMatch = decoded.match(/\/(\d{12})_[^/]+\//);
    if (tsMatch) {
      const hourMatch = decoded.match(/HOUR\s*(\d+)/i);
      const key = hourMatch ? `${tsMatch[1]}_HOUR ${hourMatch[1]}` : tsMatch[1];
      flagsPdfByKey.set(key, fl);
    }
  }
}
```

**3. Add deterministic PDF text parser function**

New function `parseFlagsAnalysisPdfText(text: string): StrategyFlagEvent[]`:

- Split text into lines
- Match each line against regex for known flag types + session elapsed time
- Map flag names: `GREEN FLAG` -> `GREEN`, `FULL COURSE YELLOW` -> `FCY`, `RED FLAG` -> `RED`
- Skip `CHEQUERED FLAG` (race over) and the first `GREEN FLAG` where Session Elapsed is `-` (race start, elapsed = 0)
- Convert elapsed times via existing `parseElapsedToSeconds()`
- Return sorted `StrategyFlagEvent[]` -- same type the JSON parser returns

```typescript
function parseFlagsAnalysisPdfText(text: string): StrategyFlagEvent[] {
  const events: StrategyFlagEvent[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    // Match: FLAG_NAME | time | session_elapsed | ...
    const m = line.match(
      /(GREEN FLAG|FULL COURSE YELLOW|FULL COURSE CAUTION|RED FLAG|CHEQUERED FLAG)\s*\|?\s*[\d:.]+ \s*\|?\s*([\d:]+\.\d+|-)/i
    );
    if (!m) continue;
    const flagName = m[1].toUpperCase();
    const elapsed = m[2].trim();
    if (flagName === "CHEQUERED FLAG") continue;
    if (elapsed === "-") {
      events.push({ elapsedSec: 0, state: "GREEN" });
      continue;
    }
    const state: StrategyFlagState =
      flagName.includes("RED") ? "RED" :
      flagName.includes("YELLOW") || flagName.includes("CAUTION") ? "FCY" : "GREEN";
    events.push({ elapsedSec: parseElapsedToSeconds(elapsed), state });
  }
  events.sort((a, b) => a.elapsedSec - b.elapsedSec);
  return events;
}
```

**4. Add PDF text extraction helper**

Fetches the PDF, converts to base64, sends to Gemini Flash Lite with a minimal "return raw text" prompt. No interpretation, just OCR.

```typescript
async function extractPdfText(pdfUrl: string): Promise<string | null> {
  const resp = await fetchWithRetry(pdfUrl);
  if (!resp.ok) return null;
  const buf = await resp.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));

  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_KEY) return null;

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Return the exact text content of this document. Preserve the table structure with | as column separator. No interpretation, just the raw text." },
          { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
        ],
      }],
    }),
  });
  if (!aiResp.ok) return null;
  const data = await aiResp.json();
  return data.choices?.[0]?.message?.content || null;
}
```

**5. Update `flagsUrlForSession` to fall back to PDF**

Modify the existing function (or add a companion) so that when no JSON URL is found, it checks `flagsPdfByKey` for a PDF URL instead.

**6. Update strategy flag fetching (~line 1784)**

Where the code currently fetches the flags JSON and calls `parseStrategyFlagEvents()`, add a fallback:

```text
if (flagsResp.ok) {
  strategyFlagEvents = parseStrategyFlagEvents(flagsData);
}
// NEW: if no JSON flags found, try PDF fallback
if (strategyFlagEvents.length === 0) {
  const pdfUrl = flagsPdfUrlForSession(...);
  if (pdfUrl) {
    const text = await extractPdfText(fullPdfUrl);
    if (text) strategyFlagEvents = parseFlagsAnalysisPdfText(text);
  }
}
```

**7. Also apply to Race Control / per-hour sessions**

Apply the same PDF fallback for the `processRaceControl` calls on hourly sessions so the flag segments are populated for each sub-session as well.

## What stays the same
- The downstream `deriveFlagSegments()` and `deriveStrategyRowsFromTimeCard()` functions are completely unchanged since both paths produce the same `StrategyFlagEvent[]` output
- The `v2_flag_segments` table schema is unchanged
- Existing JSON-based flag imports continue to work as before (PDF is only a fallback)

## Cost
- Gemini Flash Lite for a single-page PDF: fractions of a cent per import
- No AI interpretation -- all flag-to-state mapping and elapsed-time parsing is deterministic

## Risk
- Low: purely additive fallback. If PDF fetch or parse fails, import continues without flag data (same as today)
- The PDF table format is standardized by the IMSA timing provider (Alkamel) and is consistent across all events

