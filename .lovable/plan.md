

## Hero Image Swap + Privacy Policy Page

### 1. Replace Hero Background Image

Save the uploaded night-rain Porsche photo as the new hero image, replacing the current `src/assets/hero-racing.jpg`.

**File:** `src/assets/hero-racing.jpg` -- overwrite with the uploaded image (copy from `user-uploads://480777139_654041820636754_252195924334771356_n.jpg`)

No code changes needed in `src/pages/Index.tsx` since it already imports from `@/assets/hero-racing.jpg`.

### 2. Create a Privacy Policy Page

A new `/privacy` route with a comprehensive, plain-language privacy policy covering:

- **What data is collected**: Account info (email, name, nationality), race results, community submissions, usage analytics
- **How data is gathered**: User-submitted profiles, admin imports, AI-powered web scraping of publicly available race results, community submissions
- **How data is used**: Building driver profiles, enabling search/discovery, admin verification
- **How data is protected**: Authentication, row-level security policies, encrypted connections (HTTPS), no selling of personal data
- **Third-party services**: Authentication provider, AI processing for result parsing
- **User rights**: Users can request profile edits, data corrections, or account deletion by contacting the team
- **Cookies**: Minimal -- session authentication only, no tracking cookies

**New file:** `src/pages/Privacy.tsx`

### 3. Update Footer Links

Update the Footer to link the "Privacy Policy" item to `/privacy` instead of `#`. Also add "Terms of Service" placeholder and update "Contact" to a mailto or placeholder.

**File:** `src/components/Footer.tsx`
- Change `<a href="#">Privacy Policy</a>` to `<Link to="/privacy">Privacy Policy</Link>`
- Add a "Terms of Service" link (can point to `/privacy` for now or be a placeholder)

**File:** `src/App.tsx`
- Add route: `<Route path="/privacy" element={<Privacy />} />`

### Technical Details

**Files to create:**
- `src/pages/Privacy.tsx` -- Full privacy policy page with Header and Footer, styled consistently with the rest of the site

**Files to modify:**
- `src/assets/hero-racing.jpg` -- Overwrite with uploaded image
- `src/components/Footer.tsx` -- Update Privacy Policy link to use React Router `<Link to="/privacy">`
- `src/App.tsx` -- Add `/privacy` route

