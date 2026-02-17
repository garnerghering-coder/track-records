

# TrackRecord — Phase One Implementation Plan

## Overview
A motorsport driver profile and discovery platform where drivers get verified, data-driven career profiles and teams/sponsors can search and filter talent. Phase One establishes the core platform with authentication, profiles, results management, admin tools, and public discovery.

---

## 1. Design System & Landing Page
**Visual style:** Dark, bold hero sections with clean white content areas — motorsport energy where it matters, professional readability for data.

- **Landing page** with a compelling hero section explaining TrackRecord's value proposition
- Navigation header with login/signup and search access
- Sections highlighting benefits for drivers, teams, and sponsors
- Call-to-action for drivers to claim or create their profile
- Footer with relevant links

---

## 2. Authentication & User Roles
Three account types with Supabase Auth:

- **Driver** — can claim a profile, edit their own data, add results
- **Team/Sponsor** — can browse and filter driver profiles
- **Admin** — can create unclaimed profiles, verify results, manage the platform

Sign-up flow asks users to select their account type. Roles stored in a dedicated roles table for security. Admin role assigned manually (not self-selectable).

---

## 3. Driver Profiles

### Public Profile Page
Each driver gets a public-facing profile page displaying:
- **Header:** Name, photo, nationality flag, racing category, license grade
- **Bio section:** About text, social media links
- **Racing license info:** License type, grade, issuing body
- **Results history table:** Series, season, championship position, race finishes — each row showing a verified/unverified badge
- **Profile claim status:** Unclaimed profiles show a "Claim this profile" prompt

### Profile Editing (for claimed profiles)
Logged-in drivers can edit:
- Personal details, photo, bio, social links
- Racing license information
- Add new race results (marked as unverified until admin review)

### Unclaimed Profiles
- Admins can create driver profiles without an associated account
- These profiles are publicly visible but marked as "unclaimed"
- A driver can request to claim their profile through a verification process (similar to Google Business claiming)

---

## 4. Results Management

### Driver-Side
- Form for adding race results: series name, season/year, event name, finishing position, championship position, category
- Results appear immediately but are marked as **unverified**

### Admin-Side
- Admin dashboard showing pending results awaiting verification
- Ability to verify, edit, or reject submitted results
- Ability to add results directly to any driver profile (auto-marked as verified)
- Verified results display a checkmark badge on the public profile

---

## 5. Admin Dashboard
A protected admin area with:
- **Driver management:** Create new unclaimed profiles, view all profiles, manage claim requests
- **Results verification queue:** List of unverified results with approve/reject actions
- **User management:** View registered accounts and their roles
- **Profile claim requests:** Review and approve driver claim requests

---

## 6. Public Search & Discovery
A public-facing search page where teams and sponsors (and anyone) can find drivers:

- **Search bar** with text search across driver names
- **Filters:** Category (karting, single-seater, GT, etc.), nationality, license grade, experience level, age range
- **Results display:** Card grid showing driver photo, name, nationality, primary category, and verified results count
- **Sort options:** Alphabetical, most results, recently updated
- Clicking a card opens the full public driver profile

---

## 7. Team & Sponsor Accounts
- Dedicated sign-up flow for teams/sponsors with organization name and type
- Access to the full search and filter interface
- Can view complete driver profiles including all results
- No messaging or shortlisting in Phase One (reserved for Phase Three)

---

## 8. Database Structure (Supabase)
Core tables to support all Phase One features:
- **Profiles** — driver personal info, bio, social links, claim status
- **User roles** — separate table for admin/driver/team roles
- **Race results** — linked to driver profiles, with verification status
- **Categories** — racing categories for filtering
- **Team/sponsor organizations** — organization details for team accounts
- **Profile claim requests** — tracking claim workflow

Row-level security policies ensuring drivers can only edit their own data, admins have elevated access, and public profiles are readable by everyone.

---

## Summary
Phase One delivers a fully functional platform where admins can seed the database with driver profiles, drivers can claim and enhance their profiles with results, and teams/sponsors can discover talent through search and filtering. The verified/unverified results system establishes trust from day one, and the claim model enables the platform to grow its supply side proactively.

