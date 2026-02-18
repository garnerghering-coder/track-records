

## Add LLM API Key to Backend Rotation

### What Changes

Insert a new row into the `ai_api_keys` database table with:

| Field | Value |
|-------|-------|
| label | LLM API (llmapi.ai) |
| provider_url | https://internal.llmapi.ai/v1/chat/completions |
| model_name | gpt-4o |
| api_key | llmgtwy_dQ2X...UAULAw |
| priority | 1 (tried after existing Key 1 if that one exists, or first if Key 1 has no valid config) |
| is_active | true |

### How It Works

No code changes needed. The existing `callAI` shared helper already:
1. Fetches all active keys from `ai_api_keys` ordered by priority
2. Tries each in sequence, skipping on 429 or failure
3. Falls back to the GROQ env key, then Lovable AI gateway

This key will slot into that rotation automatically.

### Technical Details

**Single SQL insert via database migration:**

```text
INSERT INTO ai_api_keys (label, provider_url, model_name, api_key, priority, is_active)
VALUES (
  'LLM API (llmapi.ai)',
  'https://internal.llmapi.ai/v1/chat/completions',
  'gpt-4o',
  'llmgtwy_dQ2Xk7PXnHjINjC4DbN5oDc1j6tg7DXLdvKAULAw',
  1,
  true
);
```

Also clean up the existing "Key 1" row if its provider_url is empty (it won't work as-is).

