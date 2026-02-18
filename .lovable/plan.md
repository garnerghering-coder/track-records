

## Separate Photo Search from Driver Enrichment

### What Changes

1. **Remove photo search logic from the `enrich-driver-profile` edge function** -- enrichment will only handle text fields (nationality, bio, date of birth, category, social links).

2. **Create a new `find-driver-photo` edge function** that handles photo search independently using Firecrawl.

3. **Add a camera/photo button next to the Enrich button** on each driver row in the All Drivers tab. This button triggers the photo search separately.

### How It Works

- **Enrich button** (existing): Fills in nationality, bio, DOB, category, social links. No photo involvement.
- **Photo button** (new): Searches the web for a real photo of the driver, downloads it, uploads to storage, and updates `photo_url`. Works independently.
- Both buttons can be used on the same driver without interfering with each other.

### Technical Details

**File: `supabase/functions/enrich-driver-profile/index.ts`**
- Remove the entire photo search block (the Firecrawl search, image download, and storage upload code -- roughly lines 131-189)
- Remove the `photo_url` update from the updates object
- Keep everything else as-is

**New file: `supabase/functions/find-driver-photo/index.ts`**
- Same admin auth pattern as `enrich-driver-profile`
- Accepts `{ driverProfileId: string, force?: boolean }`
- Fetches the driver profile to get the name and current `photo_url`
- If `photo_url` exists and `force` is not set, return early with "Photo already exists"
- Uses Firecrawl API to search for `"{firstName} {lastName} racing driver portrait photo"`
- Parses results for image URLs (same logic currently in enrich function)
- Downloads and uploads to `driver-photos/{profileId}/photo.{ext}`
- Updates `driver_profiles.photo_url` with the public URL
- Returns success/failure with the URL

**File: `supabase/config.toml`**
- Add `[functions.find-driver-photo]` with `verify_jwt = false`

**File: `src/pages/Admin.tsx`**
- Add a `handleFindDriverPhoto` function that calls `supabase.functions.invoke("find-driver-photo", { body: { driverProfileId } })`
- Shows loading state, success/failure toast
- On the All Drivers tab, add a camera icon button next to the existing Enrich (sparkle) button on each driver row
- The camera button triggers `handleFindDriverPhoto` for that driver

### No database changes needed

Same storage bucket and `photo_url` column already exist.

