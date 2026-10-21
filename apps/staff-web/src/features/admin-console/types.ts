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
