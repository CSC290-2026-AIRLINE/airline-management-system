# flight-scheduling (G02, staff-web)

```text
pages/       one component per screen; routes in src/routes/ only wire a URL to these
components/  UI used by two or more pages (see CLAUDE.md for the list)
hooks/       usePagedList and useResource (API reads), useNotice (self-clearing message for <Toast />)
mocks/       demo data for the parts that belong to other features; the only place mocks live
format.ts    small text, date and clock helpers (WEEKDAYS, minutesOf, clockOf, formatDateTime)
plan-dates.ts  the dates a pattern would fly, for the "would preview" line
types.ts     shapes returned by /api/flight-scheduling
*.css        flight-scheduling.css holds the tokens and styles, class names prefixed fs-
```

Put a component in `components/` as soon as a second page needs it; keep page-only markup inside the page.
