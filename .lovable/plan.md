

## Auto-Create Profiles for Unmatched Drivers

### Overview
When the AI import function encounters driver names that don't match any existing profile, it will automatically create new `driver_profiles` entries for them instead of just logging them as unmatched. The new profiles will be minimal (first name + last name only) and linked to the race entry immediately.

### Changes

**File modified: `supabase/functions/import-race-results/index.ts`**

In the driver matching loop, when a driver name is not found after both exact and partial matching:
1. Split the name into first name (first word) and last name (remaining words)
2. Insert a new row into `driver_profiles` with `first_name`, `last_name`, `is_claimed: false`
3. Use the returned ID to link the driver to the race entry via `race_entry_drivers`
4. Track newly created profiles in the response so the admin knows which ones were auto-generated

The response will change from reporting `unmatchedDrivers` / `unmatchedNames` to also include `createdDrivers` with their names and new profile IDs.

**No other files need to change** -- the Admin UI already displays the import summary, and will just show fewer (or zero) unmatched drivers since they get created automatically.

### Technical Details

Replace the "unmatched" block in the driver matching loop with:

```typescript
// Instead of adding to unmatchedForEntry, create a new profile
const nameParts = name.trim().split(/\s+/);
const firstName = nameParts[0];
const lastName = nameParts.slice(1).join(" ") || nameParts[0];

const { data: newDriver } = await adminClient
  .from("driver_profiles")
  .insert({ first_name: firstName, last_name: lastName, is_claimed: false })
  .select("id")
  .single();

if (newDriver) {
  matchedDriverIds.push(newDriver.id);
  driverMap.set(name.trim().toLowerCase(), newDriver.id);
  createdCount++;
  createdNames.push(name);
} else {
  // Fallback: still track as unmatched if insert fails
  unmatchedForEntry.push(name);
  unmatchedCount++;
  unmatchedNames.push(name);
}
```

The response JSON will add `createdDrivers` (count) and `createdNames` (array) fields alongside the existing matched/unmatched fields.

