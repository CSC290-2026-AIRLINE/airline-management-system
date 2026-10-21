# Admin Console — Public contract (G15 → other feature teams)

This document describes the two endpoints every feature team needs to call so the
admin console can manage their screens and show their activity in the audit log.

Everything below assumes you already use `AuthProvider.fetchWithAuth()` from
[`apps/staff-web/src/auth/AuthProvider.tsx`](../../../auth/AuthProvider.tsx) on
the frontend, or you have a Bearer token on the backend.

---

## 1. Auth header (every call)

```
Authorization: Bearer <accessToken>
```

The frontend wraps this for you via `useAppAuth().fetchWithAuth`. There is no
separate admin token — the same logged-in user is used, with the additional check
that their `staff.role.is_admin` is true. **Only admins** can register screens or
read the role/audit endpoints; non-admins get `403 Admin role required` from the
backend guard.

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
  "id": "5fd1…",
  "code": "f03.seat_hold",
  "name": "Seat hold",
  "kind": "assignable",
  "feature_no": 3
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

## 3. Reading screens (admin-only)

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
      "feature_no": 15,
      "feature_name": "Admin Console",
      "screens": [{ "id": "5fd1…", "code": "f15.audit_log", "name": "Audit log", "kind": "admin", "feature_no": 15 }]
    }
  ]
}
```

---

## 4. Audit log — your writes appear automatically

Once you have a `source_feature` (your 2-digit feature number) and start
producing user actions, write to `audit_log` with these fields:

| Field                                  | Type         | Notes                                                                                           |
| -------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `source_feature`                       | smallint     | Your feature number (e.g. `3`).                                                                 |
| `action`                               | text         | Must be one of the 11 strings below.                                                            |
| `entity_type`                          | text         | e.g. `seat_hold`, `booking`, `staff`.                                                           |
| `entity_id`                            | text         | The row's ID (uuid / serial as text).                                                           |
| `summary`                              | text         | One-line human description.                                                                     |
| `reason`                               | text?        | Optional. Required for access changes.                                                          |
| `before`                               | jsonb?       | Optional. Previous state. **Set `is_sensitive=true` to mask in the UI.**                        |
| `after`                                | jsonb?       | Optional. New state.                                                                            |
| `is_sensitive`                         | boolean      | When true, `before` and `after` come back as `null` in `GET /admin/audit`.                      |
| `occurred_at`                          | timestamptz? | Defaults to the simulation clock's `now()`. Leave unset unless your business timestamp differs. |
| `recorded_at`                          | timestamptz  | Defaults to real DB `now()`. **Do not set manually.**                                           |
| `actor_id`, `actor_role`, `actor_type` | text / enum  | The authenticated user. The audit write helper (PR 2 of F15) sets these for you.                |

### Allowed `action` values (DB CHECK — keep this list in sync)

```
create
update
delete
login
logout
role_change
screen_access_change
staff_status_change
payment_capture
payment_refund
booking_lifecycle
```

If you need a new action, **open a DB-Team ticket** — adding a value is a
schema change (the `audit_log_action_check` constraint) and not something you
should DDL directly.

### Triggers

Two triggers are installed at the DB level:

- `audit_log_no_change` — once a row is written it cannot be `UPDATE`d. Writes are write-once.
- `audit_log_no_truncate` — the table cannot be `TRUNCATE`d.

So do not try to amend entries. If something went wrong, write a corrective
entry with a clear `summary` such as "correcting booking#1234 status (was X)".

### What the admin console reads

`GET /api/admin/audit?source_feature=<your no>` returns your rows automatically,
no extra wiring. `actor_email` is joined for you so admins don't need a separate
staff lookup. `before` / `after` are returned as `null` for sensitive rows — the
console renders them as "sensitive — hidden".

---

## 5. Quick reference — what calls what

| Caller                           | Endpoint                                           | Purpose                                               |
| -------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| Your feature (frontend, on boot) | `POST /api/admin/screens`                          | Register the screens your feature exposes.            |
| Admin console (frontend)         | `GET /api/admin/screens`                           | Render the matrix.                                    |
| Your feature (backend service)   | `insert into audit_log (...)` (via helper in PR 2) | Record a sensitive / important action.                |
| Admin console (frontend)         | `GET /api/admin/audit`                             | Show the audit log filtered by your `source_feature`. |

---

## 6. Things that break if you skip this

- Your screens won't appear in the Role access tab → admins can't grant your feature to any role.
- Your audit writes will still work (the `audit_log` table is open to features) but no one will be able to find them by feature number if you use a number that hasn't been documented here.

If you're starting a new feature, file an issue/PR to update this contract with your `source_feature` number and your intended `action` values.

---

_Maintained by G15. Last updated: PR 1 of Feature 15 (read-only console)._
