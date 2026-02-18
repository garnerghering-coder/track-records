

## Expand Abbreviated Driver Names Everywhere

### Problem
Race results often list drivers as "F. Nasr" instead of "Felipe Nasr". Currently the system stores that literally as `first_name: "F."`, and it stays that way forever. Additionally, "F. Nasr" fails to match an existing "Felipe Nasr" in the database, creating duplicates.

### Changes

#### 1. AI Import: Tell the AI to expand abbreviated names (import-race-results)

Update the system prompt in `import-race-results/index.ts` to add a rule:
- "ALWAYS expand abbreviated first names to their full form. For example, 'F. Nasr' should become 'Felipe Nasr', 'S. Bourdais' should become 'Sebastien Bourdais'. Use your motorsport knowledge to determine the correct full name."

This handles the problem at the source -- most abbreviated names in race results belong to well-known drivers the AI already knows.

#### 2. AI Import: Better matching for abbreviated names (import-race-results)

Even after the AI expands names, some may slip through. Add matching logic so "F. Nasr" matches an existing "Felipe Nasr":
- When exact and partial matches fail, check if the incoming name looks abbreviated (first part is 1-2 chars or ends with a dot)
- If so, check if any existing driver's last name matches AND their first name starts with the same letter
- If exactly one match is found, use it

#### 3. Enrichment: Resolve abbreviated first names (enrich-driver-profile)

Update the enrichment function to also ask the AI for the driver's full first name, and update `first_name` if the current one looks abbreviated (1-2 characters or ends with "."):
- Add `"full_first_name"` to the AI response schema
- After enrichment, if `profile.first_name` matches the pattern of an abbreviation (e.g. "F.", "F", "Ph.") AND the AI returned a `full_first_name`, update `first_name` in the database

### Technical Details

**import-race-results/index.ts -- System prompt addition (around line 99):**
```
- ALWAYS expand abbreviated first names to their full form using your motorsport knowledge.
  Examples: "F. Nasr" -> "Felipe Nasr", "S. Bourdais" -> "Sebastien Bourdais", 
  "K. Magnussen" -> "Kevin Magnussen". Never leave a name as just an initial.
```

**import-race-results/index.ts -- Abbreviated name matching (after line 286):**

After the existing partial match fails, add a new check:
```typescript
// Try abbreviated match: "F. Nasr" -> matches "Felipe Nasr"
const firstPart = parts[0].replace(".", "");
if (firstPart.length <= 2) {
  const lastPart = parts[parts.length - 1];
  const candidates: string[] = [];
  let candidateId = "";
  for (const [key, driverId] of driverMap.entries()) {
    const keyParts = key.split(" ");
    const keyLast = keyParts[keyParts.length - 1];
    const keyFirst = keyParts[0];
    if (keyLast === lastPart && keyFirst.startsWith(firstPart.toLowerCase())) {
      candidates.push(key);
      candidateId = driverId;
    }
  }
  if (candidates.length === 1) {
    matchedDriverIds.push(candidateId);
    matchedCount++;
    found = true;
  }
}
```

**enrich-driver-profile/index.ts -- Add full_first_name to schema (line 118 area):**

Add to the AI prompt fields:
```
- "full_first_name": string or null (the driver's full first name, especially important 
  if the stored name is abbreviated like "F." or "S.")
```

Add to the update logic (after line 182):
```typescript
// Fix abbreviated first names
const isAbbreviated = profile.first_name.length <= 2 || profile.first_name.endsWith(".");
if (isAbbreviated && enriched.full_first_name && enriched.full_first_name.length > 2) {
  updates.first_name = enriched.full_first_name;
}
```

### No database changes needed

