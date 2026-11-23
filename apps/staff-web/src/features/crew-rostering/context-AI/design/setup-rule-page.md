# UI & Workflow Specification: Setup Rule

## 1. Instruction for AI Agent (Component Usage Requirements)

- **Shared Components:**
  If a component was previously created in the `crew-rostering/shared` directory, **DO NOT recreate it**. Re-use existing components (e.g., `Header`, `Sidebar`, `TabsNav`, `Button`, `DropdownSelect`, `InputText`, `Modal`, `SimulationClockWidget`, and `BottomUnsavedBar`).
- **Page-Specific Components:**
  Components exclusive to this page must be created inside the `setup-rule` directory. Grouped by tab:
  - **Legality Limits Tab:** `DefaultLimitsCards`, `CompanyRulesCard`, `StricterLimitsTable`, `AddCountryRuleModal`, `EditCountryRuleModal`, `RemoveCountryRuleModal`
  - **Country Languages Tab:** `CountryLanguagesTable`, `InlineLanguageEditor`, `AddCountryLanguageModal`, `EditCountryLanguageModal`, `RemoveCountryLanguageModal`
  - **Global Overlays:** `ChangesSavedModal`

---

## 2. Main Architecture & Tabs Breakdown

The `RULES` setup page is divided into 2 main tabs under the core logic tagline: _"Limits every assignment is checked against. The strictest rule wins."_

---

### Tab 1: Legality Limits

Displays and manages minimum rest and maximum duty thresholds for crew auto-assignment.

1. **Default limits — apply to every country:**
   - Summarizes the 5 baseline legality values in stat cards:
     - `10 h` — Min rest
     - `13 h` — Max duty
     - `4` — Max flights per duty
     - `3 days` — Max pairing length
     - `100 h` — 28-day flight hours cap
2. **Company rules:**
   - Highlights company policy rule badges (overridable with written justification):
     - `1+ local crew per destination`
     - `2 police · international flights`
     - `Police need a seat from Feature 3 (POLICE_NO_SEAT)`
3. **Stricter limits by destination country:**
   - `Add country rule` button at the top right to open the rule creation modal.
   - **Table Columns & Rows:**
     - `Default · all countries`: 10 h rest / 13 h duty (Non-editable baseline)
     - Custom destination entries, e.g., `Japan` (11 h rest / 13 h duty), `South Korea` (12 h rest / 12 h duty)
   - **Actions:** Edit icon button and a red `Remove` text button.

---

### Tab 2: Country Languages

Configures accepted local languages per destination country to evaluate **Local Crew Eligibility**.

1. **Local languages by country Card:**
   - `Add country` button to open the country mapping modal.
   - **Table Columns:**
     - `COUNTRY`: Destination name (e.g., Japan, South Korea, Thailand, Singapore)
     - `LOCAL LANGUAGES`: Accepted local languages (e.g., Japanese · English, Thai · English)
     - `CREW WHO SPEAK IT`: Total qualified crew members in the system (e.g., `4 crew`, `11 crew`)
     - `RULE`: Status pill `Local crew required`
     - `ACTIONS`: Edit icon button and red `Remove` button.
2. **Inline Language Editing:**
   - Clicking Edit on a table row toggles an **Inline Edit** container directly within the table (displays `Accepted languages` dropdown with `Cancel` and `Save` buttons).

---

## 3. Modals & Notifications Detail

### A. Bottom Unsaved Changes Bar

- Floating banner pinned at the bottom of the screen when changes are detected.
- **Text:** `1 unsaved change · Saving rechecks affected pairings and roster assignments.`
- **Actions:** `Discard` button and primary `Save rules` / `Save changes` button (Navy Blue).

### B. Add / Edit Country Rule Modal

- **Fields:**
  - `COUNTRY`: Select destination country (e.g., Japan)
  - `MINIMUM REST`: Input rest period (e.g., `11 h`)
  - `MAXIMUM DUTY`: Input duty period limit (e.g., `13 h`)
- **Validation:** Custom limits must be equal to or stricter than default limits (Min Rest >= 10h, Max Duty <= 13h).
- **Actions:** `Add rule` / `Save rule` primary button and `Cancel` button.

### C. Remove Country Rule Modal

- Confirmation modal for deleting destination-specific rules.
- **Message:** Warns that the country reverts to default limits and affected pairings will be re-checked (e.g., _"Japan goes back to the default limits and its 4 pairings are rechecked."_).
- **Actions:** Red `— Remove` button and `Cancel` button.

### D. Add / Edit Country Language Modal

- **Fields:**
  - `COUNTRY`: Select destination country
  - `ACCEPTED LANGUAGES`: Multi-select dropdown for languages
- **Actions:** `Add country` / `Save` primary button and `Cancel` button.

### E. Remove Country Language Modal

- Confirmation modal for deleting destination language mappings.
- **Message:** Warns that local-crew checks will be re-checked on affected legs.
- **Actions:** Red `— Remove` button and `Cancel` button.

### F. Changes Saved Success Modal

- Confirmation popup upon saving all rule modifications.
- **Message:** `Changes saved · Affected pairings are re-checked on the next roster run. The change is written to the audit log.`
- **Actions:** `Done` primary button.

---

## 4. Business Logic & Rules

1. **Rules Hierarchy (Strictest Rule Wins):**
   - If a destination country specifies stricter limits than the baseline defaults, the auto-assignment engine enforces the destination country rule.
2. **Roster Re-validation:**
   - Saving rule updates automatically re-checks affected pairings and roster assignments on subsequent roster runs.
3. **Audit Trail:**
   - Every modification to legal limits and country language mappings is logged into the system audit trail.
