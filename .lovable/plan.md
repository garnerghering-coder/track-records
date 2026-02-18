

## Visual Overhaul + Dismissable Flags

### 1. Dismissable Flags in the Flags Tab

Add a "Dismiss" button next to "View" on each flag. Dismissed flags are stored in localStorage (keyed by `entryId + type`) so they persist across sessions but don't need a database table. Dismissed flags are hidden from the list and the count updates accordingly. A "Show dismissed" toggle lets you review and un-dismiss if needed.

**File:** `src/components/FlagsTab.tsx`
- Add a `dismissed` state set, initialized from `localStorage`
- Filter out dismissed flags from display
- Add a "Dismiss" button on each flag row
- Add a "Show dismissed (N)" toggle at the top to reveal them with an "Restore" button

### 2. Color Scheme Overhaul: Red to Purple

The logos use a vibrant purple (#B44AFF / ~270 75% 65%) with black and white. The current theme uses red (`0 85% 50%`) as the primary color. We will swap all primary color references to purple.

**File:** `src/index.css`
- Light mode: `--primary: 270 75% 65%` (the logo purple)
- Dark mode: `--primary: 270 75% 65%` (same purple works on dark)
- Update `--ring` to match
- Update `--sidebar-ring` and `--sidebar-primary` to match
- Keep `--destructive` as red (it's for errors, separate from brand)

**File:** `src/pages/Index.tsx`
- Update the CTA section gradient from red tones to purple tones: `hsl(0 60% 20%)` becomes `hsl(270 40% 20%)`

### 3. Hero Section: Photo Background Instead of Gradient

Replace the CSS gradient hero background with a photo of GT cars racing. We will use AI image generation to create a dramatic GT racing photo, upload it to the public folder, and use it as a background image with a dark overlay for text readability.

**File:** `src/pages/Index.tsx`
- Remove the `style={{ background: "linear-gradient(...)" }}` from the hero section
- Replace with a background image + dark overlay approach
- Remove the bottom white gradient fade (`h-32` div at the bottom of the hero)
- Add a subtle dark overlay so white text remains readable

### 4. Embed Logo Images

Copy the uploaded logos into `src/assets/` and use them in the Header and Footer instead of the current "TR" text badge.

**Files:** `src/components/Header.tsx`, `src/components/Footer.tsx`
- Replace the `<div className="flex h-8 w-8 ..."><span>TR</span></div>` with an `<img>` using the TR icon logo
- Import from `@/assets/TR_1600_x_1080_px.png`

### Technical Details

**CSS variable changes in `src/index.css`:**
```
--primary: 270 75% 65%;
--ring: 270 75% 65%;
--sidebar-primary: 270 75% 65%;  (dark mode)
--sidebar-ring: 270 75% 65%;
```

**Hero section in `src/pages/Index.tsx`:**
- Use AI-generated GT racing image saved to `public/images/hero-racing.jpg`
- Structure: `<section className="relative ..."><div className="absolute inset-0"><img src="/images/hero-racing.jpg" className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/60" /></div>...content...</section>`
- Remove the bottom gradient fade div entirely

**FlagsTab dismiss logic:**
```typescript
const [dismissed, setDismissed] = useState<Set<string>>(() => {
  const stored = localStorage.getItem("dismissedFlags");
  return stored ? new Set(JSON.parse(stored)) : new Set();
});

const dismissFlag = (key: string) => {
  const next = new Set(dismissed).add(key);
  setDismissed(next);
  localStorage.setItem("dismissedFlags", JSON.stringify([...next]));
};
```

**Files to modify:**
- `src/index.css` -- Primary color swap to purple
- `src/pages/Index.tsx` -- Hero image, remove gradient fade, update CTA gradient
- `src/components/Header.tsx` -- Use logo image
- `src/components/Footer.tsx` -- Use logo image
- `src/components/FlagsTab.tsx` -- Add dismiss/restore functionality

**Files to create:**
- AI-generated hero image at `public/images/hero-racing.jpg`
- Copy logos to `src/assets/`

