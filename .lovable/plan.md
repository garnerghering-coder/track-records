

## Driver Profile: Average Statistics Section

### What will be added
A new "Statistics" card section placed between the hero banner and the results table. It will display two key averages computed from the driver's existing result data:

- **Avg. Qualifying Position** -- mean of all `position` values from qualifying results
- **Avg. Race Finish** -- mean of all `position` values from race results (only counting finished results with a valid position)

A **season filter dropdown** will let users narrow these averages to a specific year (e.g. "2025", "2024") or view "All Seasons" (default). The available years are derived from the results data already fetched, so no extra database calls are needed.

### Visual design
- Two stat cards side by side (responsive grid, 2 columns on desktop, stacked on mobile)
- Each card shows the metric title, the computed average (to 1 decimal place), and a small subtitle like "across X results"
- A compact Select dropdown in the section header for season filtering
- Uses the existing Card component and theme colors to match the rest of the profile

### Technical approach (single file edit)

**File: `src/pages/DriverProfile.tsx`**

1. Add a `selectedSeason` state (string, default `"all"`)
2. Derive the list of unique season years from `raceHistory` and qualifying results (from `allSessionResults` where `_source === "qualifying"`)
3. Compute averages with a `useMemo`:
   - Filter race rows and qualifying rows by selected season (if not "all")
   - For each set, collect valid `position` values, compute mean
4. Render a new section between the hero `</section>` and the results `<div>`:
   - Section heading "Statistics" with the season Select dropdown aligned right
   - Two Card components displaying the averages
5. Import `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` from the existing UI components, and `Card`, `CardContent`

No database changes, no new files -- purely client-side math on data already fetched.

