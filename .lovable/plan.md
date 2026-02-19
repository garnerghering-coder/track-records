

## Fix: Edge Function Boot Failure

### Problem

The `parse-session-pdf` edge function crashes on startup because `npm:pdf-parse/lib/pdf-parse.js` is not a valid exported subpath in the Supabase edge runtime.

### Solution

Change the import to use the default export path instead:

```typescript
import pdf from "npm:pdf-parse";
```

If the default import also fails in edge runtime (pdf-parse has Node.js dependencies like `fs`), we need a fallback plan: skip the pdf-parse library entirely and use the AI-only path, or use a simpler approach. However, the `npm:pdf-parse` default import is the most likely fix since many Deno users use it this way.

### Changes

**File: `supabase/functions/parse-session-pdf/index.ts`**

- Line 6: Change `import pdf from "npm:pdf-parse/lib/pdf-parse.js";` to `import pdf from "npm:pdf-parse";`

One line change, no other modifications needed.

