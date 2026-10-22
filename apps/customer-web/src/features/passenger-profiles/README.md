# Passenger profiles

Customer account frontend based on Figma section `2559:10527`. This feature lives in the `passenger-profiles` folder specified by `docs/frontend-structure.md`.

## Structure

```text
passenger-profiles/
├── pages/
│   └── MyProfilePage.tsx
├── components/
│   ├── EditProfileForm.tsx
│   ├── CustomerNavigation.tsx
│   ├── ProfileAvatar.tsx
│   ├── SavedPassengers.tsx
│   ├── ProfileDialog.tsx
│   ├── PassengerDialog.tsx
│   ├── UploadPhotoDialog.tsx
│   ├── RemovePhotoDialog.tsx
│   ├── RemovePassengerDialog.tsx
│   └── ChangeEmailDialog.tsx
├── assets/
├── AccountProvider.tsx
├── profile-context.ts
├── profile-api.ts
├── profile.css
└── README.md
```

Imports use the `@customer-web/` alias across feature boundaries. Feature components, API mapping, state, styles and assets stay inside this feature; no shared component library or global authentication behavior is introduced.

## Routing and behavior

`/account/my-profile` renders `pages/MyProfilePage.tsx` through a thin TanStack Router file under `src/routes/_authenticated/`. The authenticated layout provides AccountProvider state and setup gating; the account layout retains its error boundary. Dashboard redirects to My Profile.

**Edit profile** toggles `components/EditProfileForm.tsx` inside My Profile. Save and Cancel return to the details card without changing the URL. Cancel discards draft name, phone and photo changes. SavedPassengers remains outside the editable card.

AccountProvider loads and saves real data through `useAppAuth().fetchWithAuth` and `/api/passenger-profiles`. The preview fixtures were removed. It loads all cursor pages, renders loading/error/retry and empty-list states, and waits for every mutation before closing its dialog. `profile-api.ts` only maps this feature's payloads and errors; token exchange and refresh remain in the existing AuthProvider. No global cache or additional dependency is introduced. Use the shared TanStack Query setup when the leads provide it.

Profile edits save passport names, optional local names, optional passport number and phone through PATCH `/me`. The overview masks the passport, while the owner can edit the full value in Edit Profile. Date of birth, gender and nationality are read-only in Edit Profile; first sign-in initializes them through PUT `/api/customers/me/identity`. Subsequent corrections require staff. Nationality values are ISO alpha-2 codes, genders are M/F/X, and relationship values are lowercase. Self is excluded from saved passengers because the account holder is stored separately. Relationship describes the passenger relative to the customer; for example Parent means this passenger is the customer's parent. Cancel discards draft identity/contact/photo edits; email changes have their own confirmation and persist independently of Save changes.

`/account/first-sign-in` renders `pages/FirstSignInPage.tsx`, matching Figma node `2557:15957` with the existing desktop/mobile backgrounds and navigation. Incomplete accounts are redirected here from authenticated pages; completed accounts return to My Profile. The server response determines completion, without a local completion flag. Saving submits all required identity fields together and waits for persistence. Existing partial identity values remain locked. Missing or unsuitable provider names reveal required Latin passport-name inputs instead of deriving names from email. Saved passengers load after setup completes. Errors retain the form for retry and saving disables repeated submissions.

The backend normalizes supported Latin accents and passport formatting. Thai names remain in local-name fields and Latin fields require actual passport spelling; automatic Thai romanization is not available. Sensitive profile/passenger API responses write view_sensitive audit entries without copying PII. Upcoming-flight re-screening after identity edits and the simulation-date provider still require modules 3b/screening/clock that do not exist in this checkout; this page does not claim those processes have run.

## Components and design

ProfileDialog provides a native modal shell with focus containment, focus restoration, Escape and backdrop dismissal. Each popup stays in its own component. PassengerDialog follows Figma frame `2557:16248`: relationship, passport names, optional local names, birth date, gender, nationality and optional passport number. Birth date, gender and nationality are locked when editing an existing passenger.

NationalitySelect is the searchable combobox on the first sign-in page. It is a text input with `role="combobox"` plus a `listbox`, driven entirely by `nationalityOptions` in `profile-api.ts`: 249 `[ISO code, nationality label, country name]` tuples sorted by label. `nationalitySearchText` matches a typed query against the label, the country name, the code and a small alias list, so the spellings people actually type work — "Thailand" finds Thai, "USA"/"uk"/"Turkey"/"Czech Republic"/"Ivory Coast" all resolve despite `Intl.DisplayNames` returning "Türkiye", "Czechia" and "Côte d'Ivoire". Arrow keys, Enter and Escape work, an unconfirmed query is cleared when the list closes, and typing past the list blocks submit until a choice is picked. No dependency was added.

BirthDateInput is shared by the first sign-in page and PassengerDialog so both date-of-birth fields behave identically: typed digits are regrouped into `DD / MM / YYYY` as you go (`01021990` → `01 / 02 / 1990`), with day, month, year range, days-in-month and future-date checks reported inline through `onError`. The field uses `inputMode="numeric"` and `autoComplete="bday"` rather than a native date input, because the value is passport formatting, not a locale-picker value. PassengerDialog previously validated only on submit; both forms still re-validate the complete date on submit.

UploadPhotoDialog validates JPG/PNG files up to 5 MB and keeps a local preview until Save changes. The actual File is sent to `user.setProfileImage({ file })`, or `file: null` to remove it, using the installed Clerk SDK. No data URL is written to PostgreSQL. The backend then reads the provider's image URL and persists it through POST `/me/sync-identity`. If saving details succeeds but photo synchronization fails, the form explicitly reports partial success and remains open for retry. Photo storage is Clerk, rather than the currently unintegrated SeaweedFS service.

ChangeEmailDialog follows Figma node `2557:16221`. Clerk creates the unverified address, sends a real `email_code`, verifies the six digits, and only then sets `primaryEmailAddressId`. Creation and primary-address updates use `useReverification` so Clerk's session checks remain enforced. The native dialog is temporarily suspended so the provider's reverification modal is reachable. Resend has a 30-second UI cooldown in addition to provider rate limits. Invalid/expired codes and provider errors are displayed without closing the form. Already verified secondary addresses can be promoted without a duplicate OTP. Existing addresses are retained as secondary addresses; they are not silently deleted.

After primary-email confirmation, POST `/me/sync-identity` reads the authenticated owner's verified primary address from the customer Clerk app and updates the local user row. The browser cannot supply an email, user ID or photo URL to this sync endpoint. A failed database sync leaves a Retry sync action; reloading the profile also retries the sync. The original project JWT remains valid because it identifies the same local user ID; the feature displays the server profile email rather than a stale token email claim.

For real OTP delivery, use the existing customer Clerk application's Email verification code setting, a signed-in account, and an inbox you control. Development instances may apply Clerk's testing-email or delivery restrictions. See the [Clerk email code flow](https://clerk.com/docs/guides/development/custom-flows/account-updates/add-email). No SMTP keys, custom OTP store, new login flow or schema change is required.

CustomerNavigation is feature-scoped as requested. Airlines and Book are non-interactive labels. My Trips, Membership and Help also remain labels. Profile keeps the current page, and the mobile navigation supports expansion and Escape.

Backgrounds use the supplied desktop and mobile aurora images; the mobile image applies at widths up to 700px. Figma icons retain their 16/18 px dimensions. Inter and Merriweather fonts and their licenses are bundled locally.

## Repository rules applied

- `frontend-structure.md`: isolate code in the documented feature folder and keep route files thin.
- `backend-structure.md`: consume the passenger-profiles feature module and its explicit API contract while preserving the existing authentication boundaries.
- `database-structure.md`: no edits to Prisma, generated clients, migrations or seeds; schema changes belong to the Database Team.
- `infra-guide.md`: use only the installed React/TypeScript/CSS stack; no dependency, environment, Docker or CI changes.
- `branch-naming-and-workflow.md`: when preparing a branch/PR, use `feat-<feature-number>-<feature-name>`, team-scoped commits and a PR targeting `dev`. This restructuring does not create a branch, commit, push or PR. The branch pattern in the root CLAUDE.md differs from the docs; resolve that with the leads before creating a branch.

## Validation

From the repository root:

```bash
npm run lint -w apps/customer-web
npm run format:check -w apps/customer-web
npm run build -w apps/customer-web
```

The frontend has no configured test runner. The app-wide formatting check may report pre-existing issues outside this feature; avoid reformatting other teams' files as part of feature work.
