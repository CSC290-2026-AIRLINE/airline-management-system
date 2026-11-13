# UI & Workflow Specification: Setup Crew

> **Important Instructions for AI Agent / Developers:**
>
> - **Shared Components:** Always check for existing components in the `crew-rostering/shared` directory first. **Do NOT recreate** any existing shared components. Import and reuse components such as the Sidebar, Top Header, Toast Notifications, Search Inputs, Form Modals, and Status Pills.
>
> - **Specific Components:** Create components exclusive to this workflow inside the `setup-crew` directory. Encapsulate page-specific views cleanly.
>
> - **Styling & Theme Adherence:** Refer to `ui-style.md` for proper UI styling and `context-AI/design/` for design specifications. Maintain consistency with system colors (Primary Navy `#0F172A`, Warning Orange `#F59E0B`, Danger Red `#EF4444`, Success Green `#10B981`).

---

## 1. Overview & Business Purpose

The **Setup Crew** module serves as the master database for managing all flight crew members (Captains, First Officers, Cabin Crew, and Flight Police).

### Key Objectives:

1. Maintain accurate crew profiles including personal info, home base, fleet type, and spoken languages.
2. Track critical operational constraints: **Licence Expiry**, **Type Ratings**, **Certifications (e.g., CRM)**, and **Cumulative 28-day Flight Hours**.
3. Feed updated crew capabilities directly into the **Auto-Assign** engine and legality verification system.

---

## 2. Component Categorization

### Shared Components (Reuse from `crew-rostering/shared`)

- **Sidebar Navigation:** Workspace links and live Simulation Clock widget.
- **Header / Page Title:** Section header and description text.
- **Stat Metric Cards:** Summary cards displaying total counts.
- **Toast Notification Banner:** Top floating alert banner (Green/Success style) for confirmation messages (e.g., `Crew profile created`, `Changes saved`).
- **Table Components:** Base table styling, hover indicators, and status pill badges.
- **Modal Dialog Base:** Reusable modal backdrop, header, close icon `X`, and action buttons.

### Specific Components (Create in `setup-crew`)

- **Crew Summary Metrics Group:** Specific counters for `Total Crew`, `Pilots`, `Cabin Crew`, and `Flight Police`.
- **Crew Filter Bar:** Search input by name/EMP-ID, Base Airport dropdown, and Role dropdown.
- **Crew Table Row:** Custom row component displaying cumulative 28-day hours with warning highlights for expired licenses.
- **Crew Profile Card Sections:**
  - Profile Header Card (Avatar initial, Name, EMP-ID, Role, Base, Fleet, Edit action button).
  - Personal & Contact Card.
  - Base & Fleet Card.
  - Licence Card (with Expiry Status Badge).
  - Type Ratings & Certifications Group (with `+ Add` button and individual Edit actions).
  - Upcoming Duties List (showing draft roster assignments).
- **Create/Edit Crew Profile Modal:** Comprehensive form modal for editing base info, license expiry, and language proficiency.
- **Add/Edit Certification Overlay:** Compact dialog for adding or modifying aircraft type ratings and certifications with a `Remove` option.

---

## 3. Page Layouts & Workflow States

### 3.1 Crew Directory Page (`/crew`)

#### A. Metric Overview Cards

Four metric cards displayed at the top:

1. **TOTAL CREW:** Total active rostered crew count.
2. **PILOTS:** Total Captains and First Officers.
3. **CABIN CREW:** Total Cabin Crew members.
4. **FLIGHT POLICE:** Total security officers assigned for international flights.

#### B. Search & Filtering Controls

- **Search Input:** Placeholder `Name or employee number` (Real-time filtering).
- **Base Airport Dropdown:** Filter by home base (e.g., `All bases`, `BKK`, `CNX`).
- **Role Dropdown:** Filter by duty role (e.g., `All roles`, `Captain`, `First Officer`, `Cabin Crew`, `Flight Police`).
- **Primary CTA:** `Create crew profile` button (triggers Create Crew Modal).

#### C. Crew Directory Table

- **Columns:**
  1. `NAME`: Full name of the crew member.
  2. `EMPLOYEE NO.`: Unique employee ID (e.g., `EMP-0018`).
  3. `ROLE`: Badge pill (`Captain`, `First Officer`, `Cabin Crew`, `Flight Police`).
  4. `BASE`: Home airport (e.g., `BKK`, `CNX`).
  5. `FLEET`: Assigned aircraft type (e.g., `A320`, `B737`).
  6. `LANGUAGES`: Spoken language codes (e.g., `th, en`, `ja, en`).
  7. `HOURS (28 DAYS)`: Cumulative flight hours against the 100-hour legal cap (e.g., `64 / 100 h`).
- **Warning & Alert States:**
  - If a crew member's license is expired, the hours column text turns red: e.g., `54 / 100 h · Licence expired`.
- **Interactivity:**
  - Hovering over a row highlights it and displays a tooltip: **"View profile · licence, ratings and duties"**.
  - Clicking a row navigates to that crew member's **Crew Profile Details** page.

#### D. Empty Search State

- When no results match the filter criteria (e.g., search term "Hiroshi"):
  - Shows sad face icon with message: `No crew match “Hiroshi”`.
  - Subtext: `Check the spelling, or clear the search and filters.`
  - Action link: `Clear search`.

---

### 3.2 Crew Profile Details Page (`/crew/:id`)

Navigation link at top: `← Back` (returns to Crew Directory).

#### Section Breakdown:

1. **Profile Summary Card:**
   - Circle avatar initials (e.g., `MJ`).
   - Full Name (`Mia Johnson`), `EMP-0018 · Captain · Base CNX · Fleet A320`.
   - Action: `Edit profile` button (opens Edit Crew Profile Modal).

2. **Personal & Contact Card:**
   - Details: Employee Number, Date of Birth, Email, Phone, Languages (`Thai · English`), Local-Crew Eligibility (`Thailand`).

3. **Base & Fleet Card:**
   - Home Base (`CNX`), Fleet (`A320`).
   - Operational note: _"Assigned only to A320 duties; reassessed if the fleet changes."_

4. **Licence Card:**
   - Details: Licence Number (`TH-ATPL-0018`), Expiry Date (`15 Jan 2027`), Status Badge (`VALID` in green).
   - Note: _"An expired licence prevents assignment to a flight."_

5. **Type Ratings & Certifications Card:**
   - Header includes `+ Add` button (opens Add Certification Overlay).
   - Items listed (e.g., `A320 type rating`, `CRM certification`).
   - Badges for warnings (e.g., `EXPIRING SOON` in orange with text _Expires 28 Sep 2026 · in 14 days_).
   - Edit icon buttons next to each certification (opens Edit Certification Overlay).

6. **Upcoming Duties Card:**
   - Displays future flight schedule assigned in draft roster runs (e.g., `18 Sep 2026 · FD315 · CNX → BKK` with badge `DRAFT`).

---

## 4. Modals & Overlay Specifications

### 4.1 Create Crew Profile Modal

- **Title:** `Create crew profile`
- **Subtitle:** _Create the roster-ready profile used by automatic assignment and legality checks._
- **Fields:**
  1. `FIRST NAME` (Text Input)
  2. `LAST NAME` (Text Input)
  3. `EMPLOYEE NUMBER` (Text Input)
  4. `ROLE` (Dropdown: Captain, First Officer, Cabin Crew, Flight Police)
  5. `BASE AIRPORT` (Dropdown: BKK, CNX, etc.)
  6. `FLEET (AIRCRAFT TYPE)` (Dropdown: A320, B737, etc.)
  7. `LANGUAGES` (Multi-select Dropdown: th, en, ja, zh, etc.)
  8. `LICENCE NUMBER` (Text Input)
  9. `LICENCE EXPIRY` (Date Input: `dd/mm/yyyy`)
  10. `DATE OF BIRTH (OPTIONAL)` (Date Input: `dd/mm/yyyy`)
  11. `EMAIL (OPTIONAL)` (Text Input)
  12. `PHONE (OPTIONAL)` (Text Input)
- **Actions:** `Create profile` (Primary Navy Button).
- **On Submit:** Closes modal, adds crew to list, highlights newly created row in light green, and displays success toast:
  `✓ Crew profile created · Arisa Wong (EMP-0092) can now be auto-assigned`

### 4.2 Edit Crew Profile Modal

- **Title:** `Edit crew profile`
- **Subtitle:** _Update the fields used by automatic assignment and local-crew checks._
- Pre-populated with the crew member's existing details.
- **Actions:** `Save changes` (Primary Navy Button).
- **On Submit:** Closes modal and displays success toast:
  `✓ Changes saved · licence, ratings and upcoming duties re-checked`

### 4.3 Add / Edit Certification Overlays

- **Title:** `Add certification` / `Edit certification`
- **Subtitle:** _Type ratings and mandatory certifications are checked before each assignment._
- **Fields:**
  1. `CERTIFICATION NAME` (Text Input, e.g., A320 type rating)
  2. `AIRCRAFT TYPE` (Dropdown, e.g., A320) — _Type ratings only; leave empty for other certifications._
  3. `EXPIRY DATE` (Date Input: `dd/mm/yyyy`)
- **Actions (Add):** `Cancel` (Secondary Button) | `Add certification` (Primary Button).
- **Actions (Edit):** `Remove` (Danger Red Link on left) | `Cancel` (Secondary Button) | `Save changes` (Primary Button).
