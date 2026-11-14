import type { ScreenKind } from './register-screen.dto'

/**
 * One row in the `GET /admin/screens` response. `kind` is preserved so the Role access UI can render Core/Admin locks
 * correctly without a second round-trip per screen.
 */
export interface ScreenDto {
  id: string
  feature_no: string
  code: string
  name: string
  kind: ScreenKind
  is_active: boolean
}

/** Groups returned by `GET /admin/screens`: feature buckets, each with its screens sorted by `code`. */
export interface ScreenGroup {
  feature_no: string
  screens: ScreenDto[]
}

/** One row in the `GET /admin/roles` response. `staff_count` is the live count (non-deleted, role-only). */
export interface RoleSummary {
  id: string
  code: string
  name: string
  is_admin: boolean
  staff_count: number
}

/** Response of `POST /admin/screens`. `changed: false` means the screen was already like this: nothing was written. */
export interface RegisterScreenResult {
  ok: true
  changed: boolean
  screen: ScreenDto
  /** `audit_log.seq` of the row this change wrote. Absent when `changed` is false. */
  audit_seq?: string
}

/** Response of `GET /admin/staff/:id/screens` — the menu one staff member gets. */
export interface StaffScreensDto {
  staff_id: string
  /** `false` when the account is switched off: they cannot sign in, so they see nothing at all. */
  active: boolean
  role: { id: string; code: string; name: string; is_admin: boolean }
  /** Active screens their role opens, sorted by feature then code. */
  screens: ScreenDto[]
}

/** Body of `GET /admin/roles/:id/screens`. */
export interface RoleScreensDto {
  role_id: string
  /** Sorted list of `assignable`-kind screen ids this role is granted. */
  screen_ids: string[]
}

/**
 * Response of `PUT /admin/roles/:id/screens`.
 *
 * `changed: false` means the request was a no-op — the role already held exactly these screens — and no audit row was
 * written. `audit_seq` is only present when `changed` is true.
 */
export interface ReplaceRoleScreensResult {
  role_id: string
  /** Sorted, de-duplicated. */
  screen_ids: string[]
  changed: boolean
  audit_seq?: string
}

/** One row in the `GET /admin/audit-log` response. `seq` is `BigInt.toString()`. */
export interface AuditEntryDto {
  seq: string
  id: string
  occurred_at: string
  recorded_at: string
  actor_type: 'staff' | 'customer' | 'system'
  actor_id: string | null
  actor_role: string | null
  /** The actor's name: staff first + last name, the customer's passenger name, or the email. `null` for system rows. */
  actor_name: string | null
  /** The staff member's current role name ("Finance Staff"), or "Customer". `null` when unknown. */
  actor_role_name: string | null
  source_feature: string
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string | null
  reason: string | null
  /**
   * In the list: `null` when `is_sensitive` is true. On the entry endpoint: the masked copy (sensitive values read
   * `[masked]`). Neither endpoint ever returns an unmasked sensitive value.
   */
  before: unknown
  after: unknown
  is_sensitive: boolean
}

export interface AuditPage {
  items: AuditEntryDto[]
  /** Opaque decimal-string seq for the next page. */
  next_cursor: string | null
  has_more: boolean
}

/**
 * One feature's self-registration entry (used by `OnModuleInit` and by the public `POST /admin/screens` endpoint).
 * Bare minimum needed to add a screen the Role access matrix can reference.
 */
export interface SelfRegisterScreen {
  code: string
  name: string
  kind: ScreenKind
  feature_no: string
}

/** Response of `GET /api/me/screens`. */
export interface MyScreensDto {
  screen_codes: string[]
  /**
   * `false` when the signed-in user has no `staff` row — they authenticated successfully but nobody created their staff
   * account yet.
   *
   * This exists because an empty `screen_codes` is ambiguous on its own: a provisioned user whose role holds no screens
   * looks identical. Only `provisioned: false` should send someone to the "ask an Admin" screen.
   */
  provisioned: boolean
  /**
   * The signed-in user's role — code and display name. `null` when they have no staff account.
   *
   * It is here so the console can label the signed-in person with the role they actually hold instead of a fixed
   * "Administrator". It is their own role only; other people's roles come from the admin endpoints.
   */
  role: { code: string; name: string } | null
}
