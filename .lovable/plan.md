

## Plan: Allow Creating New Cars (and Drivers/Teams) Inline from Admin Panel

### Problem
When editing a race entry's car assignment, the search only matches existing `car_models` records. If the car doesn't exist yet (e.g., typing "McLaren 720S GT3"), it shows "No matching cars" with no way to create it.

### Solution
Add a "Create" button that appears when the search term has no matches. Clicking it will insert a new `car_models` record with the typed name, then automatically assign it to the entry. Apply the same pattern to driver and team selectors if they have the same limitation.

### Changes to `src/pages/Admin.tsx`

**`renderCarCell`** (lines 1747-1749):
- Replace the "No matching cars" message with a "Create [search term]" button
- On click:
  1. Insert a new row into `car_models` with `name` set to the search term
  2. Update the `race_entry` with the new `car_model_id`
  3. Refresh `allCars` list so the new car is available everywhere
  4. Close the popover

**Code change** (approximately):
```tsx
// Replace: <p className="text-xs ...">No matching cars</p>
// With:
<button
  className="w-full text-left px-2 py-1 text-xs rounded hover:bg-accent ..."
  onClick={async () => {
    const { data, error } = await supabase
      .from("car_models")
      .insert({ name: carSearchTerm.trim() })
      .select("id")
      .single();
    if (data) {
      await handleSelectCar(data.id);
      fetchCars(); // refresh allCars list
    }
  }}
>
  + Create "{carSearchTerm.trim()}"
</button>
```

This is a small, focused change -- just replacing the "No matching cars" text with a create action in the same popover.

### Files to Modify
| File | Change |
|------|--------|
| `src/pages/Admin.tsx` | Add inline create option to `renderCarCell` when no matches found |

