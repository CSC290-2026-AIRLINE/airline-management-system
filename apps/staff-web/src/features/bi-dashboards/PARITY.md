# Feature 14 design and interaction audit

Reference: `CS26 UIUX Integrated Project.fig`, exported 12 November 2026, and Figma file `k0RcfWTHCPfKPfYjRaAH2R`.

The saved desktop Operations and Finance design contexts supplied the visual reference. The original export was also decoded to inspect direct prototype actions after the Figma connector reached its plan limit. The navigation inventory is in [reference/prototype-navigation.json](reference/prototype-navigation.json). It records reference actions, not a claim that every state is implemented.

## Confirmed corrections

- Operations and Finance sidebar navigation, mobile navigation, filters, chart hover values, CSV download and print layout work.
- Navigation to Operations resets the filters and drill-down; changing views or filters resets the page scroll, as the exported actions specify.
- Chart and cause drill-downs preserve page scroll. Period lists include cancellations; cabin lists remain scoped to departed flights.
- Cause details appear inside the delay-causes card. The flight table combines seats sold and available in one column.
- Finance uses the reference's year header and twelve-month grid. Months without a computed report are disabled; outside click and Escape dismiss the picker.
- Failed filter/month requests clear the previous figures. Previous data is used only for stable filter options and refresh status.
- Late responses cannot overwrite a newer selection. Read retries do not start an ETL refresh. Drill-down CSV failures are handled in the page.

## Remaining parity decisions and dependencies

- The prototype's From field directly navigates to the invalid-date example; To directly navigates to the empty example. Production fields accept real dates. Literal reproduction requires an explicit demo flow, not changing live forms to manufacture these outcomes.
- The Finance route action opens a BKK–NRT example. `finance_monthly_summary` has no route column; the existing finance service exposes fleet-wide figures. No route cost allocation has been invented.
- The reference's `Open monthly report` targets Figma node `2186:7323`, named `FINAL DEV / F4 / Staff / Desktop / Monthly Report`. This checkout has no corresponding Pricing & Finance route. The production button is labelled `View report lines` and scrolls to the existing report lines; external report navigation remains unavailable.
- The reference's load-factor preview navigates to a full example dashboard. The current disclosure explains the case but does not reproduce that full example state.
- The Finance not-computed demo link and all alternate access/refresh/export example frames have not received a complete visual comparison. The Figma connector currently blocks further reads under its plan limit.

## Validation

Staff build/type-check, lint and formatting checks pass. Browser checks use controlled fixture responses and cover normal desktop/mobile layouts, chart hover and keyboard drill-down, sidebar/menu navigation, date/group/route/refund controls, month/year selection, CSV/print, invalid dates, empty/error states, retries, out-of-order requests and export failures. They do not establish pixel identity for every Figma frame or live cross-feature integration.
