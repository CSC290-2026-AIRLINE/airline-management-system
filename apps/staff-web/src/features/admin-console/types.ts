/**
 * Shared TypeScript shapes for the admin-console feature. Mirrors the response shapes from `apps/backend/src/modules/
 * admin-console/dto/admin-console.types.ts` and the wire format on the GET / POST routes.
 */

export type ScreenKind = 'core' | 'admin' | 'assignable'

export interface ScreenDto {
  id: string
  feature_no: string
  code: string
  name: string
  kind: ScreenKind
  is_active: boolean
}

export interface ScreenGroup {
  feature_no: string
  screens: ScreenDto[]
}

export interface RoleSummary {
  id: string
  code: string
  name: string
  is_admin: boolean
  staff_count: number
}

export interface RoleScreensResponse {
  screen_ids: string[]
}

export interface AuditEntry {
  seq: string
  id: string
  occurred_at: string
  recorded_at: string
  actor_type: 'staff' | 'customer' | 'system'
  actor_id: string | null
  actor_role: string | null
  /** The person's name (staff or customer), when the API resolves it. Older responses leave it out. */
  actor_name?: string | null
  /** The role's display name ("Finance Staff"), or "Customer"; when the API resolves it. */
  actor_role_name?: string | null
  source_feature: string
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string | null
  reason: string | null
  /** null when is_sensitive is true */
  before: unknown
  after: unknown
  is_sensitive: boolean
}

export interface AuditPage {
  items: AuditEntry[]
  next_cursor: string | null
  has_more: boolean
}

export interface AuditFilters {
  source_feature?: string
  actor_type?: 'staff' | 'customer' | 'system'
  action?: string
  from?: string
  to?: string
}

/* ----- Staff & roles ------------------------------------------------------- */
/* Mirrors `apps/backend/src/modules/admin-console/dto/staff.types.ts`. */

export interface StaffRoleRef {
  id: string
  code: string
  name: string
  is_admin: boolean
}

export interface StaffRow {
  /** `staff.id` — the id used in `/api/admin/staff/:id`. */
  id: string
  user_id: string
  /** System-generated, e.g. `ST-0042`. */
  staff_code: string
  first_name: string
  last_name: string
  email: string
  role: StaffRoleRef
  active: boolean
  /** `true` once the person signed in with Clerk; the email is locked from then on. */
  claimed: boolean
  last_sign_in_at: string | null
  created_at: string
}

export interface StaffListResponse {
  staff: StaffRow[]
  /** Best guess of the next staff code; the create response carries the real one. */
  next_staff_code: string
  /** The signed-in admin's own `staff.id` — drives the "You" badge and the self-change guards. */
  viewer_staff_id: string
}

export type StaffErrorCode =
  | 'VALIDATION_FAILED'
  | 'REASON_REQUIRED'
  | 'EMAIL_TAKEN'
  | 'EMAIL_LOCKED'
  | 'ROLE_NOT_FOUND'
  | 'STAFF_NOT_FOUND'
  | 'SELF_DISABLE'
  | 'SELF_ROLE_CHANGE'
  | 'LAST_ADMIN'
  | 'NO_CHANGE'
