

## Fix: "Maximum call stack size exceeded" on PDF Upload

### Root Cause

Line 123 in `ManageSessionResults.tsx`:
```
btoa(String.fromCharCode(...new Uint8Array(buffer)))
```

The spread operator passes every single byte of the PDF as a separate argument to `String.fromCharCode()`. A 1MB PDF means ~1,000,000 arguments in a single function call, which blows the call stack.

### Fix

Replace line 123 with a chunked approach that processes the bytes in batches:

```typescript
const bytes = new Uint8Array(buffer);
let binary = '';
const chunkSize = 8192;
for (let i = 0; i < bytes.length; i += chunkSize) {
  binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
}
const base64 = btoa(binary);
```

This processes 8KB chunks at a time, keeping the argument count well within limits.

### Files Modified

- `src/pages/manage/ManageSessionResults.tsx` -- replace the single-line base64 conversion (line 123) with the chunked version

No other changes needed. The edge function and the rest of the flow are fine.

