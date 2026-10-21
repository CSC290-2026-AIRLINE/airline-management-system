# Admin Console — Public contract (G15 → other feature teams)

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
{ "screen_codes": ["core.home", "core.my_profile", "f06.gate_screen"] }
```

### Policy

| Screen kind  | Who sees it                                                   |
| ------------ | ------------------------------------------------------------- |
| `core`       | Everyone (always-on, e.g. Home, My profile).                  |
| `admin`      | Only when the caller's role is `is_admin`.                    |
| `assignable` | Only when the caller's role has a `role_screen` grant for it. |

Anonymous or no-staff-row callers receive `{ "screen_codes": [] }`.

#### Staff-web React helper

If you're working in `apps/staff-web`, use the bundled hook instead of writing your own fetch:

```ts
import { useMyScreens } from '@staff-web/features/admin-console/hooks/useMyScreens'

const { codes, loading, error, source } = useMyScreens()
// `source` is 'live' | 'preview' | 'pending' — `preview` is set when the URL
// has ?preview=1 so designers can see the widget render without DB rows.
```

The bundled hook is mounted in the `AdminShell` sidebar footer as a working
demonstration (`components/MyAccessWidget.tsx`). Don't import that widget for
your feature — copy-paste it into your own component if you want a similar
visible indicator.

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

### What to write

Once you have a `source_feature` (your 2-digit feature number) and start
producing user actions, write to `audit_log` with these fields:

| Field                                  | Type         | Notes                                                                                           |
| -------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `source_feature`                       | text         | Your feature number (e.g. `'3'`).                                                               |
| `action`                               | text         | Must be one of the 11 strings below.                                                            |
| `entity_type`                          | text         | e.g. `seat_hold`, `booking`, `staff`.                                                           |
| `entity_id`                            | text         | The row's ID (uuid / serial as text).                                                           |
| `summary`                              | text?        | One-line human description.                                                                     |
| `reason`                               | text?        | Optional. Required for access changes.                                                          |
| `before`                               | jsonb?       | Optional. Previous state. **Set `is_sensitive=true` to mask in the UI.**                        |
| `after`                                | jsonb?       | Optional. New state.                                                                            |
| `is_sensitive`                         | boolean      | When true, `before` and `after` come back as `null` in the audit endpoints.                     |
| `occurred_at`                          | timestamptz? | Defaults to the simulation clock's `now()`. Leave unset unless your business timestamp differs. |
| `recorded_at`                          | timestamptz  | Defaults to real DB `now()`. **Do not set manually.**                                           |
| `actor_id`, `actor_role`, `actor_type` | text / enum  | The authenticated user. The audit write helper (PR 2 of F15) sets these for you.                |

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
| Your feature (frontend, on boot) | `GET /api/me/screens`              | signed-in | Filter your nav to what the signed-in user can open. |
| Your feature (backend service)   | `insert into audit_log (...)`      | n/a       | Record a sensitive / important action.               |
| Admin console (frontend)         | `GET /api/admin/audit-log`         | admin     | Show the audit log, optionally filtered by feature.  |
| Admin console (frontend)         | `GET /api/admin/audit-log/:id`     | admin     | Show one entry's full payload.                       |

---

## 7. Things that break if you skip this

- Your screens won't appear in the Role access tab → admins can't grant your feature to any role.
- Your audit writes will still work (the `audit_log` table is open to features) but no one will be able to find them by feature number if you use a number that hasn't been documented here.

If you're starting a new feature, file an issue/PR to update this contract with your `source_feature` number and your intended `action` values.

---

_Maintained by G15. Last updated: PR 1 of Feature 15 (Iteration 02 — read-only console + `/me/screens`)._
