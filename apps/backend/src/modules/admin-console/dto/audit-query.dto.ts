import { Transform } from 'class-transformer'
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'

// Mirrors the audit_log.action CHECK in src/db/schema.sql. If the DB team adds an action, this array must be updated
// in the same PR. The full list:
//   sign_in, sign_out, sign_in_blocked, access_denied, create, update, delete,
//   view_sensitive, role_change, status_change, screen_access_change
export const AUDIT_ACTIONS = [
  'sign_in',
  'sign_out',
  'sign_in_blocked',
  'access_denied',
  'create',
  'update',
  'delete',
  'view_sensitive',
  'role_change',
  'status_change',
  'screen_access_change',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

// Mirrors the audit_log.actor_type CHECK. NULL is not valid as a filter value (use a separate endpoint if you need
// system-actor rows).
export const AUDIT_ACTOR_TYPES = ['staff', 'customer', 'system'] as const
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number]

/** `seq` is BIGINT, so the cursor stays a decimal string end to end — never a number. */
const DIGITS = /^\d+$/

/**
 * Query string for `GET /api/admin/audit-log`. All fields are optional. Cursor is the `seq` of the last row of the
 * previous page; pass it back to fetch the next page (newest first).
 */
export class AuditQueryDto {
  /** Feature number as stored: '2', '3b', '15'. */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  source_feature?: string

  @IsOptional()
  @IsIn(AUDIT_ACTOR_TYPES)
  actor_type?: AuditActorType

  @IsOptional()
  @IsString()
  @MaxLength(64)
  actor_id?: string

  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: AuditAction

  /** Inclusive lower bound on occurred_at (the simulation clock), ISO-8601. */
  @IsOptional()
  @IsDateString()
  from?: string

  /** Inclusive upper bound on occurred_at (the simulation clock), ISO-8601. */
  @IsOptional()
  @IsDateString()
  to?: string

  /** Opaque: the `seq` of the last row of the previous page, as a decimal string. Newest first. */
  @IsOptional()
  @IsString()
  @Matches(DIGITS, { message: 'cursor must be an audit seq value' })
  @MaxLength(24)
  cursor?: string

  @IsOptional()
  // `@Type(() => Number)` would turn `''` into 0 and surface a confusing 'must not be less than 1' error; the
  // guard instead treats `''`/undefined as 'use the default'.
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number
}
