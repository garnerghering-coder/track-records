

## Add Duplicate Driver Detection and Merge Tab

### Overview
Add a new "Duplicates" tab to the Admin Dashboard that automatically detects potential duplicate driver profiles and lets you merge them or dismiss false positives.

### Duplicate Detection Logic
Drivers are flagged as potential duplicates when:
- Exact match on `last_name` (case-insensitive) AND first name starts with the same letter (catches "F. Nasr" vs "Felipe Nasr")
- Exact match on both `first_name` and `last_name` (case-insensitive)
- Groups are formed so you see clusters of 2+ drivers that look like the same person

### UI Design
- New tab: **Duplicates** with a badge count of detected groups
- Each group shows a card with all candidate profiles side-by-side, displaying: name, nationality, bio snippet, number of race entries, whether claimed
- Two actions per group:
  - **Merge**: Pick a "primary" profile (defaults to the one with more data or the claimed one). All race entry links from the secondary profiles get reassigned to the primary. Secondary profiles are deleted.
  - **Not Duplicates / Dismiss**: Mark the pair as "not duplicates" so they stop appearing. This uses a small `dismissed_duplicates` table to persist dismissals.

### Database Changes
One new table to track dismissed duplicate pairs so they don't keep reappearing:

```sql
CREATE TABLE public.dismissed_duplicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id_1 uuid NOT NULL,
  driver_id_2 uuid NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  dismissed_by uuid,
  UNIQUE (driver_id_1, driver_id_2)
);

ALTER TABLE public.dismissed_duplicates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dismissed duplicates"
  ON public.dismissed_duplicates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
```

### Merge Logic (client-side, admin-only)
When merging driver A (keep) and driver B (remove):
1. Update all `race_entry_drivers` rows where `driver_profile_id = B` to point to A
2. Update all `race_results` rows where `driver_profile_id = B` to point to A
3. Copy any non-null fields from B to A if A's field is null (nationality, bio, photo, socials, etc.)
4. Delete driver B

### Technical Details

**Files to modify:**
- `src/pages/Admin.tsx` -- Add state, fetch logic, duplicate detection algorithm, merge handler, dismiss handler, and new TabsContent with the duplicates UI

**New migration:**
- Create `dismissed_duplicates` table with RLS

**Duplicate detection algorithm (runs client-side on the already-fetched `drivers` array):**
```typescript
// Group drivers by normalized last name
// Within each group, find pairs where first names match or one is an abbreviation of the other
// Filter out dismissed pairs
// Return groups of 2+ potential duplicates
```

**Tab placement:** After "All Drivers" tab, before "Claims"

