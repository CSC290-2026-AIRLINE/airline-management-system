# Admin Console — Public contract (G11 → other feature teams)

This document describes the endpoints every feature team needs to call so the
admin console can manage their screens and show their activity in the audit log.

Everything below assumes you already use `AuthProvider.fetchWithAuth()` from
[`apps/staff-web/src/auth/AuthProvider.tsx`](../../../auth/AuthProvider.tsx) on
the frontend, or you have a Bearer token on the backend.

---

## 1. Auth header (every call)

```
Authorization: Bearer <accessToken>
```

The frontend wraps this for you via `useAppAuth().fetchWithAuth`.

- `/api/admin/*` endpoints are admin-only. Non-admin staff get `403 Admin role required`.
- `/api/me/*` endpoints accept **any signed-in user** — no admin role required.

---

## 2. `POST /api/admin/screens` — register your screens on boot

**Every feature should call this once on startup**, from inside its Nest module's
`OnModuleInit`. It is idempotent on `code` — you can call it every boot, repeated
calls are a no-op except that an existing row's `kind` is never mutated.

### Request body

```json
{
  "code": "f03.seat_hold",
  "name": "Seat hold",
  "kind": "assignable" // ← optional; default is "assignable"
}
```

| Field  | Type   | Required | Notes                                                                                                       |
| ------ | ------ | -------- | ----------------------------------------------------------------------------------------------------------- |
| `code` | string | yes      | Format `f<feature_no>.<snake_name>` per `schema.sql`. Lowercase letters, digits, `_`, `-` only. ≤ 64 chars. |
| `name` | string | yes      | Human-readable, ≤ 120 chars.                                                                                |
| `kind` | enum   | no       | One of `core`, `admin`, `assignable`. Defaults to `assignable`.                                             |

`kind` semantics:

- `core` — always visible (e.g. Home, My profile). **Cannot be granted** to a role.
- `admin` — only reachable from inside an admin workspace, like this console. **Cannot be granted** to a role.
- `assignable` — any role's grants can include this screen. **This is what you want for your real screens.**

### Response (200)

```json
{
  "ok": true,
  "screen": {
    "id": "5fd1…",
    "code": "f03.seat_hold",
    "name": "Seat hold",
    "kind": "assignable",
    "feature_no": "3"
  }
}
```

### Example (frontend, inside your React feature)

```ts
useEffect(() => {
  fetchWithAuth('/api/admin/screens', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'f03.seat_hold', name: 'Seat hold' }),
  }).catch(console.error)
}, [])
```

### Example (backend, inside your Nest module)

```ts
@Injectable()
export class SeatHoldModule implements OnModuleInit {
  constructor(private readonly http: HttpService) {}
  async onModuleInit() {
    await firstValueFrom(
      this.http.post(
        `${process.env.ADMIN_API_URL}/api/admin/screens`,
        { code: 'f03.seat_hold', name: 'Seat hold' },
        // Reuse the admin's Bearer token from the request context — never hardcode
      ),
    )
  }
}
```

We recommend you do this from the **frontend** instead — the `AuthProvider` is
already wired, and your screens will appear in the admin console as soon as the
admin reloads the Role access tab (no backend restart required).

---

## 3. `GET /api/me/screens` — which screens can the signed-in user open?

```
GET /api/me/screens
```

Returns the **codes** of every active screen the caller can open. Call this on
app boot to filter your own nav (hide menu items the user has no access to).
No admin role required — any signed-in staff or customer can call it.

```json
{ "screen_codes": ["core.home", "core.my_profile", "f06.gate_screen"], "provisioned": true }
```

### Policy

| Screen kind  | Who sees it                                                   |
| ------------ | ------------------------------------------------------------- |
| `core`       | Everyone (always-on, e.g. Home, My profile).                  |
| `admin`      | Only when the caller's role is `is_admin`.                    |
| `assignable` | Only when the caller's role has a `role_screen` grant for it. |

### `provisioned`

`false` means the caller signed in successfully but has **no `staff` row** — nobody created
their staff account yet. Show `StaffNotProvisionedScreen` ("ask an Admin to create your
account"), not a per-screen denial: the difference matters, because one is a missing
account and the other is missing permission.

**Do not infer this from an empty `screen_codes`.** A real staff member whose role holds no
screens returns `{ "screen_codes": [], "provisioned": true }`, and telling that person to go
ask for an account they already have is worse than showing them nothing. That is the only
reason the flag exists.

A caller with no `staff` row receives `{ "screen_codes": [], "provisioned": false }`.
An **anonymous** request never gets that far — the global `JwtAuthGuard` answers `401`
before the controller runs, so there is no body to read.

#### Staff-web React helper — wrap your page in `RequireStaff`

If you're working in `apps/staff-web`, one wrapper handles the whole "is this person staff
yet?" question. Put it around your page in the route file:

```tsx
// src/routes/_authenticated/refunds.tsx
import { createFileRoute } from '@tanstack/react-router'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'
import { RefundsPage } from '@staff-web/features/refunds/RefundsPage'

export const Route = createFileRoute('/_authenticated/refunds')({
  component: () => (
    <RequireStaff>
      <RefundsPage />
    </RequireStaff>
  ),
})
```

`RequireStaff` renders your page only for a signed-in user who has a `staff` row. Anyone
else gets `StaffNotProvisionedScreen` — the "ask an Admin to create your account" card.
It renders **nothing** of yours in that case, so you don't need an empty state for it.

Two things it deliberately does:

- **It lets a failed check through.** If `GET /api/me/screens` errors, `provisioned` is
  `null` (unknown), not `false`, and your page renders normally so its own fetch surfaces
  the error. A network blip must never tell a real staff member to go ask an admin for an
  account they already have.
- **It doesn't check individual screens** — only your feature knows its screen code. Do
  that check _inside_ your page, after this one:

  ```tsx
  import { NoAccessScreen } from '@staff-web/features/admin-console/components/NoAccessScreen'
  import { useScreenAccess } from '@staff-web/features/admin-console/hooks/useScreenAccess'

  function RefundsPage() {
    const { loading, canOpen } = useScreenAccess()
    // Never check while `loading` — `canOpen` is false until the codes arrive, so skipping
    // this would flash the denied card at somebody who does have access.
    if (loading) return <p className="muted">Checking your access…</p>
    if (!canOpen('f07.refunds')) return <NoAccessScreen screenName="Refunds" roleName="Gate agent" />
    return <RefundsTable />
  }
  ```

Both admin console pages (`RoleAccessPage`, `AuditLogPage`) use exactly this pair, so a
user hitting either state anywhere in staff-web gets the same two cards.

Inside the admin workspace the gate is mounted once in
`src/routes/_authenticated/admin/route.tsx`, **above** `AdminShell` — one
`/api/me/screens` for all three tabs, and a refused user never sees the sidebar at all.
`RequireStaff` reads `useScreenAccess()` itself, so do not call that hook in the route as
well; you would fetch twice. `MyAccessWidget` in the same folder is our sidebar's demo
of the raw hook — it is not a gate, don't import it.

`RequireStaff` takes an optional `loadingFallback` — pass your own skeleton there so the
swap does not flash a different layout:

```tsx
<RequireStaff loadingFallback={<RefundsSkeleton />}>
```

If your feature has no route file of ours to put the gate in, wrap it inside your own
page component instead — the fetch is then once per page, which is fine, it is one small
request. If it matters enough to be once for all of staff-web, ask the Dev Leads to move
`RequireStaff` up to `src/routes/_authenticated.tsx` around the `<Outlet/>`. That file is
shared, so G11 does not edit it.

#### Showing the "you don't have access" screen

Both cards are built on one shared `StatusCard`, so they render identically — a user
should get the same shape whichever way they were refused.

`NoAccessScreen` takes:

| Prop         | Required | Notes                                                                                      |
| ------------ | -------- | ------------------------------------------------------------------------------------------ |
| `screenName` | yes      | Human name — `"Refunds"`, not `f07.refunds`.                                               |
| `roleName`   | no       | e.g. `"Gate agent"`. Omitted → the copy drops the "isn't part of the … role" clause.       |
| `recorded`   | no       | Default `true`. Pass `false` **only** if your guard does not write an `access_denied` row. |
| `homeTo`     | no       | Where "Go to Home" goes. Default `/`.                                                      |

**Neither card writes anything.** Recording the attempt stays on your backend so the
actor is read from the token and cannot be forged from a request body. Use the audit
writer (section 5) — it also skips repeats of the same refusal within a minute, so one
page load that calls several endpoints leaves one row, not five:

```ts
const actor = await this.audit.resolveActor(req.user.id)
await this.audit.recordAccessDenied(actor, {
  sourceFeature: '7',
  entityType: 'screen',
  entityId: 'f07.refunds',
  summary: 'Denied access to f07.refunds',
})
```

The admin console does this itself: every 403 from `/api/admin/*` is recorded against
`f15.staff_roles`, `f15.role_access` or `f15.audit_log`.

If you do write that row, leave `recorded` on its default — the card then says
"This attempt was recorded." and shows a `FORBIDDEN · logged in the audit log`
badge, which is what your admin will actually see on the Audit log tab.

Both screens use a plain `<a href>` for their button, not TanStack's `<Link>`, so they
work from any route without needing that route in the generated route tree.

Both cards show up on their own in the running app — there is no review flag to
remember:

| Card              | When it appears                                                           |
| ----------------- | ------------------------------------------------------------------------- |
| No staff account  | Signed in, but `GET /api/me/screens` answers `provisioned: false`.        |
| Lacks this screen | Your endpoint answers 403 — the admin console renders the card from that. |

The no-account card replaces the whole workspace, so it is shown by the shared
`RequireStaff` gate above the admin shell rather than by any one page. The
lacks-this-screen card is rendered by the page that was refused, so each feature
shows it in its own place.

---

## 4. Reading screens (admin-only)

```
GET /api/admin/screens
```

Returns the registry grouped by feature so the admin console can render the
matrix. **You don't need to call this from your feature** — the admin console
reads it directly.

```json
{
  "groups": [
    {
      "feature_no": "15",
      "screens": [{ "id": "5fd1…", "code": "f15.audit_log", "name": "Audit log", "kind": "admin" }]
    }
  ]
}
```

`GET /api/admin/roles` returns `{ roles: [{ id, code, name, is_admin, staff_count }] }` for the
admin Role-access tab.

`GET /api/admin/roles/:id/screens` returns `{ screen_ids: string[] }` — only `assignable` screens
that role has been granted. `core` and `admin` screens are **not** included (they are always-on
or admin-only respectively).

### `PUT /api/admin/roles/:id/screens` — grant or revoke screens

This is what the Role access tab's **Save access** button calls. You do not need to call it
yourself — it is admin-facing, not a feature-facing endpoint — but it is listed here because it
is the only path that writes `role_screen` rows, and it decides what a grant means.

```
PUT /api/admin/roles/:id/screens
```

| Field        | Type     | Required | Notes                                                                        |
| ------------ | -------- | -------- | ---------------------------------------------------------------------------- |
| `screen_ids` | string[] | yes      | The **complete** new set, not a delta. `[]` revokes everything. Max 400 ids. |
| `reason`     | string   | yes      | ≥ 10 chars, ≤ 500. Stored on the audit entry.                                |

- Only `kind: 'assignable'` screens that are `is_active` may appear in `screen_ids`. Granting a
  `core` or `admin` screen returns **400** naming the rejected ids.
- Grants and the `audit_log` row commit in **one transaction** — a partial write cannot happen.
- Sending the set a role already has is a no-op: `changed: false`, and **no** audit row is
  written. Duplicates in `screen_ids` are collapsed first, so resending the same list twice does
  not fill the log with noise.
- `404` if the role does not exist.

```json
{
  "role_id": "9c1f…",
  "screen_ids": ["4a2e…", "7b90…"],
  "changed": true,
  "audit_seq": "118"
}
```

`audit_seq` is the `audit_log.seq` of the row this write produced, so the UI can point the admin
straight at the entry. It is absent when `changed` is false.

---

## 5. Audit log

### `GET /api/admin/audit-log` — admin reads the log

```
GET /api/admin/audit-log?source_feature=3&action=update&from=2026-10-01&limit=50
```

Cursor-paginated newest-first (cursor is the last row's `seq`, a decimal string).

Filters: `source_feature`, `actor_type` ∈ {`staff`,`customer`,`system`}, `actor_id`, `action`,
`from`, `to` (ISO-8601). `before` / `after` are returned as `null` for sensitive rows.

### `GET /api/admin/audit-log/:id` — single entry

Returns the same row by id, 404 if not found. Same sensitive-masking rules.

### How to write — `AuditService`

Write every row through `AuditService` (`apps/backend/src/modules/admin-console/audit/`)
rather than inserting into `audit_log` yourself. It checks `action` and the actor against
the values the table accepts, masks sensitive fields before they are stored, takes
`occurred_at` from the simulation clock, and leaves `recorded_at` to the database.

```ts
// your.module.ts
import { AuditModule } from '@backend/modules/admin-console/audit/audit.module'
@Module({ imports: [AuditModule], providers: [YourService] })

// your.service.ts — inside the transaction that makes the change, so both commit or neither does
await this.db.$transaction(async (tx) => {
  const payment = await tx.payment.update({ ... })
  await this.audit.write(
    {
      actor: await this.audit.resolveActor(req.user.id), // never from the request body
      sourceFeature: '5',
      action: 'update',
      entityType: 'payment',
      entityId: payment.id,
      summary: 'Refunded booking ABC123',
      reason: 'Flight cancelled by the airline — full refund policy',
      before: { status: 'paid', card_number: '4111…' },
      after: { status: 'refunded', card_number: '4111…' },
      maskFields: ['card_number'], // stored as "[masked]"; the row is flagged is_sensitive
    },
    tx,
  )
})
```

| Method                                  | Use it for                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `write(input, tx?)`                     | Every audited change. Throws on a bad `action` / actor, so a typo fails in your tests.          |
| `tryWrite(input)`                       | Side records that must never change the request's outcome. Returns `false` instead of throwing. |
| `resolveActor(userId)`                  | Build the actor from the token's user id: user type plus current staff role code.               |
| `AuditService.staffActor(principal)`    | Build the actor from a principal you already resolved (`{ id, roleCode }`).                     |
| `AuditService.systemActor()`            | Rows the system writes on its own (scheduled jobs, simulations).                                |
| `recordSensitiveView(actor, view, tx?)` | `view_sensitive` — call it from the endpoint that returns sensitive data (passport, card).      |
| `recordAccessDenied(actor, denial)`     | `access_denied` — see section 3. De-duplicated for a minute; never throws.                      |

**Masking.** `maskFields` names fields (at any depth) whose values are replaced with
`"[masked]"` in `before` / `after`; the real value never reaches the table. A row with
`maskFields` is also flagged `is_sensitive`, so the audit endpoints return its `before` /
`after` as `null`. Pass `sensitive: true` to hide a row's payload without masking fields.

### What to write

Once you have a `source_feature` (your 2-digit feature number) and start
producing user actions, write to `audit_log` with these fields (the `AuditService.write`
input names them in camelCase):

| Field                                  | Type         | Notes                                                                                                                                    |
| -------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `source_feature`                       | text         | Your feature number (e.g. `'3'`).                                                                                                        |
| `action`                               | text         | Must be one of the 11 strings below.                                                                                                     |
| `entity_type`                          | text         | e.g. `seat_hold`, `booking`, `staff`.                                                                                                    |
| `entity_id`                            | text         | The row's ID (uuid / serial as text).                                                                                                    |
| `summary`                              | text?        | One-line human description.                                                                                                              |
| `reason`                               | text?        | **Required on every row** — say why the action happened, not what it was. 10–500 chars.                                                  |
| `before`                               | jsonb?       | Optional. Previous state. **Set `is_sensitive=true` to mask in the UI.**                                                                 |
| `after`                                | jsonb?       | Optional. New state.                                                                                                                     |
| `is_sensitive`                         | boolean      | When true, `before` and `after` come back as `null` in the audit endpoints.                                                              |
| `occurred_at`                          | timestamptz? | Defaults to the simulation clock's `now()`. Leave unset unless your business timestamp differs.                                          |
| `recorded_at`                          | timestamptz  | Defaults to real DB `now()`. **Do not set manually.**                                                                                    |
| `actor_id`, `actor_role`, `actor_type` | text / enum  | The authenticated user. Resolve it server-side from the request — never take an actor from a body, query, or header the caller supplied. |

**Every row needs a `reason`.** The column is nullable in the schema, so nothing stops
you writing one — but the Audit log tab exists to answer "why did this happen", and a
row without a reason answers nothing. Write the _why_ (ticket, request, policy), not a
restatement of `summary`: "Card payment received — card ending 4417", not "paid".

### Allowed `action` values — keep in sync with `AUDIT_ACTIONS`

```
sign_in
sign_out
sign_in_blocked
access_denied
create
update
delete
view_sensitive
role_change
status_change
screen_access_change
```

If you need a new action, **open a DB-Team ticket** — adding a value is a
schema change (the `audit_log_action_check` constraint) and not something you
should DDL directly. Update the matching array in
`apps/backend/src/modules/admin-console/dto/audit-query.dto.ts` in the same PR.

### Triggers

Two triggers are installed at the DB level:

- `audit_log_no_change` — once a row is written it cannot be `UPDATE`d. Writes are write-once.
- `audit_log_no_truncate` — the table cannot be `TRUNCATE`d.

So do not try to amend entries. If something went wrong, write a corrective
entry with a clear `summary` such as "correcting booking#1234 status (was X)".

---

## 6. Quick reference — what calls what

| Caller                           | Endpoint                           | Auth      | Purpose                                              |
| -------------------------------- | ---------------------------------- | --------- | ---------------------------------------------------- |
| Your feature (frontend, on boot) | `POST /api/admin/screens`          | admin     | Register the screens your feature exposes.           |
| Admin console (frontend)         | `GET /api/admin/screens`           | admin     | Render the matrix.                                   |
| Admin console (frontend)         | `GET /api/admin/roles`             | admin     | Render the role selector and staff count.            |
| Admin console (frontend)         | `GET /api/admin/roles/:id/screens` | admin     | Show which `assignable` screens a role has.          |
| Admin console (frontend)         | `PUT /api/admin/roles/:id/screens` | admin     | Save the matrix; writes the audit row with it.       |
| Your feature (frontend, on boot) | `GET /api/me/screens`              | signed-in | Filter your nav to what the signed-in user can open. |
| Your feature (backend service)   | `AuditService.write(...)`          | n/a       | Record a sensitive / important action.               |
| Admin console (frontend)         | `GET /api/admin/audit-log`         | admin     | Show the audit log, optionally filtered by feature.  |
| Admin console (frontend)         | `GET /api/admin/audit-log/:id`     | admin     | Show one entry's full payload.                       |

---

## 7. Things that break if you skip this

- Your screens won't appear in the Role access tab → admins can't grant your feature to any role.
- Your audit writes will still work (the `audit_log` table is open to features) but no one will be able to find them by feature number if you use a number that hasn't been documented here.

If you're starting a new feature, file an issue/PR to update this contract with your `source_feature` number and your intended `action` values.

---

_Maintained by G11 (Feature 15). Last updated: the `AuditService` writer and `access_denied` recording._
