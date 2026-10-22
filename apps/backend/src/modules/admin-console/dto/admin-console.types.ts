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
  source_feature: string
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string | null
  reason: string | null
  /**
   * Null when `is_sensitive` is true (the row exists but the writer asked us to hide it). The list endpoint never
   * returns the unmasked value.
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
}
