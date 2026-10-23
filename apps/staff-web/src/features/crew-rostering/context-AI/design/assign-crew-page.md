# UI & Workflow Specification: Assign Crew (Step 2)

> **Important Instructions for AI Agent / Developers:**
>
> - **Shared Components:** Always check for existing components in the `crew-rostering/shared` directory first. **Do NOT recreate** any existing shared components. Import and reuse components such as the Sidebar, Step Navigator, Roster Run Header, Simulation Clock, and Status Badges.
>
> - **Specific Components:** Create components exclusive to this workflow inside the `assign-crew` directory. Do NOT put folder structure in the file, but keep logic cleanly encapsulated.
>
> - **Styling & Theme Adherence:** Refer to `ui-style.md` for proper UI styling and `context-AI/design/` for design specifications. Maintain consistency with system colors (Primary Navy `#0F172A`, Warning Orange `#F59E0B`, Danger Red `#EF4444`, Success Green `#10B981`).

## 1. Overview & Prerequisite Workflow

The **Assign Crew** page is Stage 2 of the Roster Run workflow, following **Build Pairings**:

1. **Prerequisite & Transition:**
   - In the previous **Build Pairings** stage, pairings must be constructed and any invalid pairings resolved.
   - Clicking the orange **Commit** button on the Build Pairings page finalizes the pairing dataset and transitions the roster run into the **Assign Crew** stage.

2. **Primary Goal:**
   - Select committed, valid pairings and trigger the **Auto-assign** engine to automatically allocate required crew members (Captain, First Officer, Cabin Crew, Local Crew, and Flight Police) in accordance with global international aviation standards (Flight Time Limitations / FTL and Home Base constraints).

3. **Outcome:**
   - Upon completion of auto-assignment, the system displays the **Crew per Leg** summary table along with a **Rule Breaks** section detailing any FTL or company rule violations.
   - Interactive Rule Break cards allow quick navigation to Stage 3 (**Fix & Publish**) for manual crew swapping and adjustments.

---

## 2. Global FTL Rules & Business Constraints

The auto-assign engine and rule validation system strictly enforce international aviation safety standards (ICAO / EASA / FAA FTL compliance) alongside airline company policies:

### A. Aviation Law Rules (Hard Violations — Mandatory Fix via Swap)

Violations in this category are legal infractions and **cannot** be published without resolution:

1. **Duty & Flight Limits (Rule 1):** Maximum 4 flight legs or 13 duty hours per duty period.
2. **Minimum Rest Period (Rule 2):** Minimum 10 consecutive hours of rest required between duty periods.
3. **Cumulative Flight Hours (Rule 3):** Maximum 100 flight hours per rolling 28 consecutive days.
4. **No Overlapping Flights (Rule 6):** A crew member cannot be assigned to overlapping or concurrent flight schedules.
5. **Base Return Guarantee:** All assigned pairings must originate and terminate at the crew member's designated home base (e.g., BKK) to ensure proper rest and duty cycles.
6. **Aircraft Type Rating & Composition:** Each Airbus A320 leg strictly requires 1 Captain, 1 First Officer, and 4 Cabin Crew, all holding valid licenses and active A320 type ratings.

### B. Company Rules (Soft Violations — Can be Overridden with Written Justification)

1. **Local Language Compliance (Rule 4):** At least 1 local crew member who speaks the destination country's language (e.g., Japanese for NRT, Korean for ICN).
2. **Security Compliance (Rule 5):** Minimum 2 flight police required on international flight sectors.

---

## 3. Component Categorization

### Shared Components (Reuse from `crew-rostering/shared`)

- **Sidebar Navigation:** Application layout sidebar with workspace links and simulation clock.
- **Step Navigator / Stepper:** Step indicator (`1. Build pairings` [Completed] → `2. Assign crew` [Active] → `3. Fix & publish` [Pending]).
- **Roster Run Header:** Top header displaying current roster run title, date range, and status dropdown (e.g., `BKK · 15–19 Sep 2026`, `Draft`).
- **Simulation Clock:** Floating widget displaying current simulated datetime.
- **Status Badge:** Reusable pill badges for `Valid`, `OK`, `REST_SHORT`, `POLICE_MIN`, `NO_LOCAL_CREW`, etc.

### Specific Components (Create in `assign-crew`)

- **Committed Pairings Selector Card:** Table listing committed valid pairings with checkboxes, filter controls, selection counters, and execution trigger.
- **Auto-Assign Confirmation Modal:** Modal dialog prompting confirmation prior to running auto-assignment (includes desktop and mobile overlay variants).
- **Rules Used Card:** Summary card listing the 6 core regulatory and company rules evaluated during auto-assignment.
- **Empty Assign State:** Placeholder component displayed before auto-assign has been executed.
- **Assign Summary Banner:** Top alert bar displayed post-assignment indicating overall fully-crewed status and rule break counts.
- **Flight Legs Stats Cards:** Overview metric cards for total flight legs, fully crewed legs, and open rule breaks.
- **Crew Per Leg Table:** Comprehensive flight assignment table highlighting rule violations with red background badges.
- **Rule Breaks Card Group:** List of clickable issue cards summarizing FTL and company rule violations.

---

## 4. Detailed UI Sections & Functional Logic

### 4.1 Committed Pairings Selector Card

- **Header Controls:**
  - Displays section title `COMMITTED PAIRINGS · VALID ONLY`.
  - Actions: `Select all` and `Clear selection` buttons.
  - Filter bar at top: `Date from`, `Date to`, and `Base` dropdowns.
- **Pairings Table:**
  - Columns: `Checkbox`, `Pairing` (e.g., P-101, P-102), `Date`, `Route`, `Flights`, `Status` (`Valid`).
  - **Rule:** Only committed pairings marked as `Valid` are listed for selection. Invalid pairings from the prior step are excluded automatically.
- **Selection Status & Auto-Assign Action:**
  - Bottom status indicator displays current selection metrics (e.g., `2 of 2 pairings selected · 4 flights`).
  - **Primary Action Button:** `Run auto-assign` (Dark Navy primary button).
  - **Validation State (`NO_PAIRINGS`):**
    - If all checkboxes are deselected, the `Run auto-assign` button is disabled.
    - An inline error banner appears: `NO_PAIRINGS · Select at least one pairing to run auto-assign.`

### 4.2 Rules Used Card

- Displays the 6 active rules applied during auto-assignment:
  1. `Max 4 flights or 13 h per duty`
  2. `Min 10 h rest between duties`
  3. `Max 100 flight hours per 28 days`
  4. `At least 1 local crew who speaks the destination language`
  5. `2 police on international flights`
  6. `No overlapping flights for one person`
- Includes a footer note clarifying legal constraints vs. company policy rules (Legal rules 1, 2, 3, 6 require mandatory resolution; company rules 4, 5 may be overridden with written justification).

### 4.3 Confirmation Modal: Run Auto-Assign

- Triggered upon clicking `Run auto-assign`.
- **Title:** `Run auto-assign?`
- **Description:** Explains that the algorithm will assign Captains, First Officers, Cabin Crew, Local Crew, and Flight Police while checking every rule including daily duty limits, rest periods, and base return guarantees.
- **Summary Box:** Lists selected date range, base, selected pairings (e.g., `P-101 · P-102`), total legs, and flight numbers (`FD210`, `FD211`, `FD511`, `FD512`).
- **Actions:**
  - `Cancel` (Secondary outline button)
  - `Run auto-assign` / `Run` (Primary navy button) -> Triggers algorithm execution and updates page state to Post-Run Results.

### 4.4 Post-Run State (Results & Rule Breaks)

Once auto-assignment completes, the lower viewport switches from the `No crew assigned yet` empty state to the assignment results breakdown:

#### A. Assign Summary Banner

- Displayed at top of results section with an amber/orange warning alert style:
  `! Auto-assign finished · 3 of 4 legs fully crewed · 3 rule breaks on 2 legs to fix in the next step.`
- Contains an orange primary CTA button on the right: `Fix breaks →` which redirects directly to Stage 3 (**Fix & Publish**).

#### B. Flight Summary Metric Cards

Three summary cards displaying key metrics:

1. **Flight legs:** Total count of legs assigned (e.g., `4`).
2. **Fully crewed:** Count of legs with complete crew rosters (e.g., `3`).
3. **Open breaks:** Total unresolved rule violations (e.g., `3`).

#### C. Crew Per Leg Table

- **Columns:** `FLIGHT`, `ROUTE`, `TIME`, `CAPTAIN`, `FIRST OFFICER`, `CABIN CREW`, `LOCAL CREW`, `POLICE`, `STATUS`.
- **Row Warning & Highlighting:**
  - Any crew position experiencing an FTL or duty violation (such as rest time shortage, max hours exceeded, or missing mandatory role) is highlighted with a soft red background tag (e.g., `None` for local crew, `C. Boonma Missing` for police).
  - Status badges reflect specific error flags: `POLICE_MIN`, `NO_LOCAL_CREW`, `REST_SHORT`.

#### D. Rule Breaks Card Group

- Displays individual violation cards explaining each rule break in detail.
- **Card Details:**
  - **Title:** Rule type (e.g., `Minimum rest · law rule`, `Police minimum`, `Local crew`).
  - **Contextual Description:** Detailed explanation (e.g., _"S. Kittipong lands FD211 at 23:30 and reports for FD511 at 06:30: 7 h rest, needs 10 h."_).
  - **Status Badge:** Red highlight tags (`REST_SHORT`, `POLICE_MIN`, `NO_LOCAL_CREW`).
- **Interactivity:**
  - Hovering over any Rule Break card displays a tooltip/action prompt: **"Open in Fix & publish to swap crew"**.
  - Clicking the card navigates directly to Stage 3 (**Fix & Publish**), pre-filtering or highlighting the affected flight leg for manual resolution.

```

The document is ready in the editor. Feel free to let me know whenever you'd like to move on to the next workflow (**Fix & Publish**)!
```
