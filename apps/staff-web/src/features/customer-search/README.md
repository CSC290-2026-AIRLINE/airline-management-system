# Customer Search (staff-web)

Read-only staff tool for finding an account holder or a traveller and viewing
their profile. Implemented from the Customer Search section of the Figma file
`CS26-UIUX-Integrated-Project--Copy-`, and mounted at
`routes/_authenticated/customer-search.tsx`.

## Layout

```text
customer-search/
├── pages/CustomerSearchPage.tsx   # the whole screen; the route file stays thin
├── components/                     # presentational pieces it composes
├── lib/                            # API client, response mapping, URL state, formatting
├── types.ts, customer-search.css
```

## Screens

Every screen in the section is composed from four pieces of URL state, so a
filtered view can be linked, reloaded, and stepped through with browser Back:

| URL query      | Value                                      |
| -------------- | ------------------------------------------ |
| `q`            | search term                                |
| `type`         | `all` \| `account-holder` \| `traveller`   |
| `page`, `size` | pagination                                 |
| `person`       | id of the open profile                     |
| `correct`      | id whose "Correct identity" dialog is open |

The URL is kebab-case; the API's own `type` is camelCase. `lib/api.ts` maps the
filter on the way out and `lib/searchParams.ts` on the way in, so
`type=account-holder` is what appears in a shared link while the request still
carries `type=accountHolder`. A link carrying the pre-rename `type=accountHolder`
is still read, and treated as `account-holder`, rather than falling back to `all`.

**Only what the user chose is written.** A value equal to its default is held as
`undefined`, which TanStack Router's serializer drops, so the untouched screen sits
at a bare `/customer-search` instead of
`?q=&type=all&page=1&person=null&correct=null`. The route parses the sparse URL,
hands the page a fully resolved state, and normalises back on navigation, so the
page never sees an absent value. Anything actually chosen still appears — a search,
a tab, a page beyond the first, or an open profile.

| State                       | Where it renders                                                          |
| --------------------------- | ------------------------------------------------------------------------- |
| Full-width results table    | no `person`                                                               |
| Split list + profile        | `person` set, desktop                                                     |
| Card list                   | `person` set (desktop list column) or no `person` (mobile)                |
| Mobile profile, list hidden | `person` set, mobile — `← Back` clears it                                 |
| Correct identity dialog     | `correct` set — desktop uses a comparison table, mobile stacks the fields |
| Empty / no results          | no match for `q` — type filter and pager drop out, per the design         |
| Loading                     | skeleton rows while the list request is in flight                         |
| Error                       | message + `Try again`, driven by a rejected request                       |

## DATA SOURCE — the real backend

All data comes from `apps/backend/src/modules/passenger-profiles`. There is no
mock and no fallback: with the backend down the screens show the error state.

`lib/api.ts` holds the three calls. Each one goes through
`AuthProvider.fetchWithAuth`, so the Bearer token and its single automatic
refresh are the platform's, never this feature's:

| Call                                   | Used for                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `GET /api/passengers?q&type&page&size` | the results list, with server-side filter, surname ordering and pagination |
| `GET /api/passengers/:id`              | the open profile and its linked people                                     |
| `PATCH /api/passengers/:id/identity`   | "Save correction"                                                          |

`lib/person.ts` maps the wire responses onto this feature's `Person`. Nullability
is preserved rather than defaulted, so "not on record" renders as an em dash
instead of an invented value. `lib/search.ts` no longer filters or paginates —
it only reshapes the server's slice into the `Page` the pagination bar renders.

Two consequences worth knowing:

- **The `PATCH` body is a full restatement, not a partial patch.** The dialog
  reports only the fields the staff member edited; `CustomerSearchPage` merges
  those onto the record on screen before sending. An absent edit means "keep the
  current value", a `null` means "clear it".
- **A correction writes an audit-log row** (`source_feature:
'passenger-profiles'`, `is_sensitive: true`). The old and new values, the
  actor and the reason are recorded server-side, not in the browser.

## Concurrency

Each request carries its own `AbortController`, so typing a new term cancels the
in-flight search. Every result is tagged with the query that produced it and
compared during render, which means a late response is discarded without needing
a reset effect — and a token refresh re-rendering the page does not blank the
list.

## Conventions used here

- **No new dependencies.** Tailwind, shadcn/ui, Lucide and TanStack Query are
  not installed in this app; styling is hand-written CSS on custom properties
  (`customer-search.css`) and icons are inline SVG (`components/Icons.tsx`).
  The listbox in `components/Select.tsx` is hand-rolled for the same reason.
- **URL state, not component state,** for anything a user might want to share.
  Local `useState` is reserved for the in-progress search draft.
- **Auth comes from the platform.** `AppShell` reads the session through the
  existing `AuthProvider`; this feature creates no second login or token flow.
- `#root:has(.cs-app)` in `customer-search.css` cancels the shared 1126px
  marketing shell from `index.css` for this route only, so unrelated routes are
  untouched.
