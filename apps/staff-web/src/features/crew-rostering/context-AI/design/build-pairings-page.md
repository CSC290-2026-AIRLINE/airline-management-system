# ✈️ UI/UX Design Specification: `build-pairings` Workflow

This document defines the structural layout, component specifications, styling rules, and modal interactions for the **Build Pairings** feature.

---

## 1. Feature Purpose & Workflow Overview

- **Purpose:** Convert scheduled flight data into legal flight pairings that start and end at the same specified operational base.
- **Core Interactions:**
  1. **Configure Parameters:** Define `Date from`, `Date to`, and `Base`.
  2. **Generate Pairings:** Click **"Generate pairings"** to automatically construct pairing routes.
  3. **Inspect Statuses:** Review generated pairing cards tagged with green `Valid` or red `Invalid` status badges.
  4. **Manage & Inspect Individual Pairings:**
     - Click a pairing card to expand the right-hand **Detail Inspector Panel**.
     - Review flight legs, layovers, and aviation legality check logs.
     - Perform manual actions (**Edit legs** / **Delete pairing**), which trigger real-time re-validation and status updates.
     - Use interactive **Modal Overlays** to manually reorder, add, or remove flight legs with instant legality re-checks.

---

## 2. Shared Components (Global UI Library)

These are reusable global components located in the shared directory (`src/features/crew-rostering/shared`). Do not redefine custom elements for these on individual pages:

- **Sidebar Navigation (`<SidebarNav>`):**
  - **Background:** Dark Navy Blue (`#0F203E`).
  - **Elements:** App branding logo, section links (_Roster runs_, _Crew_, _Rules_), and bottom **Simulation Clock** status widget.

- **Top Header Bar & Roster Run Badge (`<RosterRunBadge>`):**
  - **Badge:** Pill-shaped status indicator (e.g., `ROSTER RUN BKK · 15–19 Sep 2026` with `Draft` tag).

- **Primary Button (`<PrimaryButton>`):**
  - **Base Color:** Dark Navy `#14213D` (Hover: `#0A152B`).
  - **Usage:** `Generate pairings`, `Save & re-check` action buttons.

- **Secondary / Outline Button (`<OutlineButton>`):**
  - **Border & Text:** Border `#C4C6C5`, Primary text `#010101`.
  - **Usage:** `Clear`, `Cancel`, `Edit legs` buttons.

- **Highlight Action Button (`<HighlightButton>`):**
  - **Base Color:** Yellow `#FCA311` (Hover: `#C27D0C`), Text `#010101` (Bold).
  - **Usage:** Primary flow progression (e.g., `Commit X valid pairings ➔`).

- **Danger / Destructive Button (`<DangerButton>`):**
  - **Base Color:** Red `#B8171F` (Hover: `#8E1017`), Text `#FFFFFF` (Bold).
  - **Usage:** `Delete pairing`, `Remove`, `Remove leg` buttons.

- **Form Inputs & Select Dropdowns (`<InputField>`, `<SelectDropdown>`):**
  - **Border:** Standard gray (`#C4C6C5`).
  - **Error Border:** Red (`#B8171F`) when input conditions are invalid.

- **Modal Overlay Container (`<BaseModalOverlay>`):**
  - **Background:** Card / Modal BG `#FFFFFF` with dark backdrop shadow overlay.
  - **Layout:** Centered modal card, rounded corners (`16px` border-radius), Auto Layout padding.

---

## 3. Page-Specific Components (`build-pairings`)

### 3.1 Build Settings Card (`<BuildSettingsCard>`)

- **Layout:** White background (`#FFFFFF`), rounded borders, Auto Layout horizontal form row.
- **Typography:** Section Title **Build settings** (H4, Semi Bold, 22px).
- **Elements:**
  - Date picker input: `Date from`
  - Date picker input: `Date to`
  - Select dropdown: `Base`
  - Action Buttons: `Generate pairings` (Primary) and `Clear` / `Clear pairings` (Outline).
- **Validation Error State:**
  - When `Date to` is set prior to `Date from`, border changes to `#B8171F` with caption text: _Date to must be on or after Date from._

### 3.2 Summary Metrics Bar (`<SummaryMetricsBar>`)

- **Layout:** Full-width container with flex layout displaying key metrics in horizontal groups.
- **Elements:**
  - Total Pairings Count (e.g., `4 pairings`)
  - Total Flights Count (e.g., `8 flights`)
  - Valid Pairings Badge Count (e.g., `2 valid` in green `#059669`)
  - Invalid Pairings Badge Count (e.g., `2 invalid` in red `#B8171F`)
  - Deleted Count (e.g., `1 deleted` in brown/gray)
  - Action Callout: `<HighlightButton>` ➔ `Commit X valid pairings ➔`

### 3.3 Generated Pairings Card (`<PairingCard>`)

- **Layout:** Card box (`#FFFFFF`), 100% width in grid column, subtle border, Auto Layout padding 16px-24px.
- **Card Header:**
  - **Pairing ID:** Heading H3 (Bold, e.g., `P-101`).
  - **Route Sequence:** Arrow-separated route (e.g., `BKK ➔ NRT ➔ BKK`).
  - **Status Badge:**
    - **Valid:** Background `#059669` (30% opacity), Text `#059669` (Bold).
    - **Invalid:** Background `#B8171F` (30% opacity), Text `#B8171F` (Bold).
- **Card Body (Flight Leg Table):**
  - **Columns:** `FLIGHT`, `FROM`, `TO`, `DEP`, `ARR`
  - **Rows:** Lists flight legs (e.g., `FD210`, `BKK`, `NRT`, `12:30`, `18:30`).
  - **Highlight Banner (Optional):** Light blue container for overnight notes (e.g., `Night stop in ICN · 1 night · Day 2 is Thu 17 Sep`).
- **Card Footer:**
  - Summary metrics (e.g., `2 flights · 12h 30m duty`).

### 3.4 Pairing Detail & Inspector Panel (`<PairingDetailInspector>`)

- **Layout:** Mounted on the right side when a `<PairingCard>` is selected.
- **Sections:**
  1. **Header:** Title showing full pairing ID and complete route (e.g., `P-102 · BKK ➔ ICN ➔ BKK`) with status badge.
  2. **Flight Schedule List:** Detailed timeline grouped by date, showing times, flight numbers, and duration per leg.
  3. **Layover Details:** Displays layover locations and night stops.
  4. **Legality & Compliance Checks:**
     - Icon-labeled list of aviation rules:
       - Green Checkmark (`✓`) for passed rules (e.g., _Starts and ends at base_, _Flights per duty day (max 4)_).
       - Red Cross (`✕`) for violated rules (e.g., _Starts and ends at base_ failing with `BKK ➔ KUL`).
  5. **Error Alert Banner (When Invalid):**
     - Red filled alert box displaying error code and corrective instruction (e.g., `PAIRING_NOT_CLOSED · Ends in KUL, not at base. Add a flight back to BKK in Edit legs, or delete this pairing.`).
  6. **Action Footer:**
     - `<OutlineButton>`: `Edit legs` (Opens `<EditLegsModal>`).
     - `<DangerButton>`: `Delete pairing` (Opens delete confirmation or directly removes pairing and re-lists unallocated flights).

---

## 4. Modal Overlays (`build-pairings` Modals)

### 4.1 Edit Legs Modal (`<EditLegsModal>`)

- **Trigger:** Clicked `Edit legs` button on the `<PairingDetailInspector>` or `<PairingCard>`.
- **Purpose:** Allows Ops staff to view current flight legs in a sequence, reorder legs, remove legs, or add new legs manually.
- **Header:**
  - **Title:** `Edit legs` (H2 / H3 Bold)
  - **Badge Tag:** `Auto-built` (Light blue pill badge)
  - **Subtitle:** _Changes are immediately rechecked for return-to-base, duty, flight and day limits._
  - **Target Pairing Details:** e.g., `P-103 · BKK ➔ SIN ➔ KUL`
- **Leg Sequence List:**
  - Displays ordered flight legs (1, 2, 3...) with drag handles (`⋮⋮`).
  - **Flight Info:** Flight number, Origin ➔ Destination, Departure–Arrival times (e.g., `FD620 BKK ➔ SIN, 08:00–11:20`).
  - **Tag Badges:** Shows green `Added` badge for newly inserted legs.
  - **Reorder Controls:** Up (`↑`) / Down (`↓`) arrow buttons to swap sequence order.
  - **Remove Action:** Red `<DangerButton>` ➔ `Remove` (Triggers `<RemoveLegModal>`).
- **Secondary Actions:**
  - `<PrimaryButton>`: `+ Add leg` (Opens `<AddLegModal>`).
- **Info Box:**
  - Light blue alert container with text: _Add, remove, or reorder legs. Saving immediately re-checks all pairing rules._
- **Footer Controls:**
  - `<OutlineButton>`: `Cancel` (Closes modal without saving).
  - `<PrimaryButton>`: `Save & re-check` (Saves sequence, triggers full FTL re-validation, updates pairing status to Valid/Invalid).

### 4.2 Add Leg Modal (`<AddLegModal>`)

- **Trigger:** Clicked `+ Add leg` button inside `<EditLegsModal>`.
- **Purpose:** Search and select an available connecting flight leg from Feature 2 (Flight Scheduling) that leaves the last destination airport after the previous flight lands.
- **Header:**
  - **Title:** e.g., `Add leg to P-103`
  - **Subtitle:** Contextual hint showing arrival constraint, e.g., _Flights from Feature 2 that leave KUL after FD621 lands (13:30, Thu 17 Sep)._
- **Search Field:**
  - Input with search icon: `SEARCH SCHEDULED FLIGHTS` ➔ Placeholder: `Flight number or airport`
- **Matching Flights List (`<MatchingFlightsList>`):**
  - Displays radio-selectable card items for available flights.
  - **Selected Item State:** Dark blue border, active radio dot (`🔘`).
  - **Item Details:** Flight number, Origin ➔ Destination, Departure Date & Time range (e.g., `FD622 · KUL ➔ BKK, Thu 17 Sep · 15:00–17:10`).
  - **Legality Indicator Badges:**
    - **Green Tag:** `Returns to base` (Indicates adding this leg will close the pairing legally).
    - **Gray Tag:** `Ends at SIN`, `Ends at HKT`, `Ends at CNX` (Warns that adding this leg leaves the pairing unclosed).
- **Warning Context Note:**
  - e.g., _Adding one of these means P-102 no longer ends at BKK. Add a return flight too, or it will be marked Invalid (PAIRING_NOT_CLOSED)._
- **Footer Controls:**
  - `<OutlineButton>`: `Cancel` (Returns to `<EditLegsModal>`).
  - `<PrimaryButton>`: `Add leg` (Appends selected flight to the pairing sequence in `<EditLegsModal>`).

### 4.3 Remove Leg Confirmation Modal (`<RemoveLegModal>`)

- **Trigger:** Clicked `Remove` on any leg row in `<EditLegsModal>`.
- **Purpose:** Confirm removal of a flight leg and inform the user about the legal impact on the pairing status.
- **Header:**
  - **Title:** e.g., `Remove FD621 from P-103?`
  - **Explanatory Text:** Explains the consequence, e.g., _P-103 is re-checked when you save. Without FD621 it ends at SIN, so it stays Invalid until a flight back to BKK is added._
- **Leg Preview Box:**
  - Card box displaying details of the leg being removed:
    - **Date:** `Thu 17 Sep 2026`
    - **Route:** `SIN ➔ KUL`
    - **Flight Pill:** `FD621`
    - **Time & Index:** `12:30–13:30 · leg 2 of 2`
- **Footer Controls:**
  - `<OutlineButton>`: `Cancel` (Aborts removal).
  - `<DangerButton>`: `Remove leg` (Removes the leg from sequence and updates `<EditLegsModal>`).
