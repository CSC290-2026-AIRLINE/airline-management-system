import { Transform } from 'class-transformer'
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateBy } from 'class-validator'

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

/** `seq` is BIGINT, so the cursor stays a decimal string end to end — never a number. At most 19 digits. */
const DIGITS = /^\d{1,19}$/

/** Largest `BIGINT`. A longer or larger cursor is a 400, not a 500 from Postgres. */
const MAX_BIGINT = 9223372036854775807n

/** A plain date with no time, e.g. `2026-11-01`. Read as a whole day in `AUDIT_DAY_UTC_OFFSET_MINUTES`. */
export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** Rejects a cursor that is digits but does not fit in BIGINT. */
function FitsBigInt(): PropertyDecorator {
  return ValidateBy({
    name: 'fitsBigInt',
    validator: {
      validate: (value: unknown) => typeof value === 'string' && DIGITS.test(value) && BigInt(value) <= MAX_BIGINT,
      defaultMessage: () => 'cursor must be an audit seq value',
    },
  })
}

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

  /** `user.id` of the person who did it (`audit_log.actor_id`). A UUID; anything else is a 400. */
  @IsOptional()
  @IsUUID('all', { message: 'actor_id must be a user id (UUID)' })
  actor_id?: string

  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: AuditAction

  /**
   * Lower bound on occurred_at (the simulation clock), inclusive. Either an instant (ISO-8601 with a time, which the
   * staff web sends for the start of the viewer's local day) or a plain date `YYYY-MM-DD`, read as the start of that day
   * in Thailand time.
   */
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string

  /**
   * Upper bound on occurred_at, inclusive. An instant is used as given; a plain date `YYYY-MM-DD` covers the whole of
   * that day in Thailand time, so `to=2026-11-01` includes everything on 1 November.
   */
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string

  /** Opaque: the `seq` of the last row of the previous page, as a decimal string. Newest first. */
  @IsOptional()
  @IsString()
  @Matches(DIGITS, { message: 'cursor must be an audit seq value' })
  @FitsBigInt()
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
