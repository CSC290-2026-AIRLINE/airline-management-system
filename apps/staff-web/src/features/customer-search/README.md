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

## Live search

Typing filters the list without touching the Search button. A debounced effect
(`SEARCH_DEBOUNCE_MS`, 250ms) pushes the trimmed draft into the `q` search param
once typing pauses, and the existing fetch effect re-runs against the server.

- **Filtering is server-side.** The page never filters the rows it happens to
  hold — that would only ever cover one page and would desync `total` from the
  pager. `GET /api/passengers?q=…` is the single source of matches.
- **The draft is trimmed before it is sent**, so the URL, the request and the
  Search button all carry the same value, and a stray space does not narrow the
  result set. The URL parser trims again on the way back in.
- **The Search button still works** and does the same thing without the wait, so
  the control is never decorative.
- **`withCustomerSearch` handles the rest**: changing `q` resets to page 1 and
  clears `person`, because the open profile is usually not in the new result set.
  `type` and `size` are carried through untouched, so the All / Account holders
  / Travellers filter and the page size survive a new term.
- Back/Forward still drives the input: the render-time sync in the page rewrites
  the draft from `q`, so the field follows the URL rather than the other way round.

## Nationality options

The "Correct identity" dropdown offers every assigned ISO 3166-1 alpha-2 country
(249 of them) from `lib/countries.ts`, plus `No change`. Each option's **value**
is the lower-case two-letter code, which is exactly what the API stores —
`nationality must be a two-letter country code in lower case` — so nothing is
translated on save and the stored format is unchanged.

Labels come from `format.nationalityWithCode` rather than being written out
again, so the dropdown and the dialog's `Now:` column can never disagree. That
formatter keeps the design's demonyms for the codes it already knew (`Thai`,
`Myanmar`) and falls back to `Intl.DisplayNames` for the rest, which is why the
list mixes `Thai (th)` with `Thailand`-style region names. Making the naming
uniform would change how existing nationalities render in the table and cards
too, so it is left as a deliberate inconsistency rather than a silent change.

There is still **no `Other…` option**, for the same reason as before: the API
only accepts a two-letter country code, and every code that could be stored is
now in the list.

`Select` shows a filter box once a list reaches 12 options, because scrolling
249 of them on a phone is not usable. The menu is still portalled to `<body>` and
measured against the viewport, so it is not clipped by the dialog or the screen.

`GET /api/passengers` splits `q` on whitespace and requires **every** term to
match, so a full name like `Anabel Effertz` works — one term hits the first name,
the other the surname. Each term is a case-insensitive substring of either name
spelling, the passport number, the account holder's email, or the date of birth
(`YYYY`, `YYYY-MM` or `YYYY-MM-DD`, matched as a date range because the column is
a `DATE`). The passenger id is compared when the term is a UUID.

A substring test includes every prefix match, so typing `A` surfaces `Anabel
Effertz` and typing `An` narrows further, while still finding `Effertz` from
`ertz`. This is what the placeholder promises, and it is all the server matches on
— see `apps/backend/src/modules/passenger-profiles/README.md` for the exact rules.

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
