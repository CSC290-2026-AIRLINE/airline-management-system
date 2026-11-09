import { Injectable, Logger } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { AUDIT_ACTIONS, AUDIT_ACTOR_TYPES, type AuditAction, type AuditActorType } from '../dto/audit-query.dto'
import { SimulationClock } from '../simulation-clock'

export { stableAuditId } from './stable-audit-id'

/** Who did it. Always resolved on the server — never taken from a request body, query or header. */
export interface AuditActor {
  type: AuditActorType
  /** `user.id`; `null` only for `system`. */
  id: string | null
  /** Role code at the time of the event (`staff.role.code`), when the actor is staff. */
  role: string | null
}

export interface AuditWriteInput {
  actor: AuditActor
  /** The feature that emitted the row, e.g. `'15'`, `'8'`, `'3b'`. */
  sourceFeature: string
  action: AuditAction
  entityType?: string | null
  entityId?: string | null
  summary?: string | null
  /** Why it happened — the ticket, request or policy — not a restatement of `summary`. */
  reason?: string | null
  before?: unknown
  after?: unknown
  /**
   * Extra field names whose values are replaced with `MASKED` inside `before` / `after`, at any depth. The names in
   * `DEFAULT_SENSITIVE_KEYS` (passport numbers, card numbers, dates of birth, …) are always masked as well, so a caller
   * that forgets this list still never stores those values. Names match in any spelling: `passport_no`, `passportNo`
   * and `PassportNo` are the same key. The masked copy is what gets stored; the real value never reaches the table.
   */
  maskFields?: readonly string[]
  /**
   * Marks the row `audit_log.is_sensitive`: the list hides `before` / `after`, and opening the entry writes a
   * `view_sensitive` row. Defaults to `true` whenever `maskFields` is given or a value was actually masked.
   */
  sensitive?: boolean
  /**
   * Retry-safe id for the row (`audit_log.id`, a UUID). A second write with the same id is ignored and returns the
   * first row, so a caller that retries — or two requests that describe the same event — leaves exactly one row.
   * Build one from the event's natural key with `stableAuditId(...)`. Leave it out for an ordinary write.
   */
  id?: string
  /** Business time. Defaults to the simulation clock; `recorded_at` is always the database's real `now()`. */
  occurredAt?: Date
}

export interface AuditWriteResult {
  id: string
  /** `audit_log.seq` as a decimal string (BigInt does not survive JSON). */
  seq: string
  /** `false` when a row with the same `id` already existed and this write was skipped. */
  created: boolean
}

/** What a masked value is replaced with. */
export const MASKED = '[masked]'

/**
 * Keys that are masked in every audit row, whatever the caller passes. Compared after `normalizeKey`, so each entry
 * covers its snake_case, camelCase and PascalCase spellings.
 */
export const DEFAULT_SENSITIVE_KEYS: readonly string[] = [
  // Identity documents
  'passport',
  'passport_no',
  'passport_number',
  'national_id',
  'id_card_no',
  'id_number',
  'citizen_id',
  'tax_id',
  // Payment cards and bank accounts
  'card_number',
  'card_no',
  'pan',
  'cvv',
  'cvc',
  'security_code',
  'card_expiry',
  'iban',
  'account_number',
  'bank_account',
  // Personal details
  'date_of_birth',
  'dob',
  'birth_date',
  'birthdate',
  'phone',
  'phone_number',
  // Secrets
  'password',
  'password_hash',
  'secret',
  'api_key',
  'access_token',
  'refresh_token',
]

/** `passport_no`, `passportNo`, `Passport-No` → `passportno`. */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const DEFAULT_SENSITIVE_SET: ReadonlySet<string> = new Set(DEFAULT_SENSITIVE_KEYS.map(normalizeKey))

/** The default sensitive keys plus `extra`, normalised for `maskValue`. */
export function sensitiveKeySet(extra: readonly string[] = []): ReadonlySet<string> {
  if (extra.length === 0) return DEFAULT_SENSITIVE_SET
  return new Set([...DEFAULT_SENSITIVE_SET, ...extra.map(normalizeKey)])
}

/** Matches the `reason` limit the admin endpoints use. Longer text is cut, not rejected, so a write never fails on it. */
const MAX_TEXT = 500

/**
 * Copy of `value` with every property whose name is in `fields` (at any depth, in objects and arrays) replaced by
 * `MASKED`. Names are compared with `normalizeKey`, so `fields` may hold either spelling. A whole value is masked —
 * an object under a sensitive key is replaced, not walked. `onMask` is called once per replaced value.
 */
export function maskValue(value: unknown, fields: ReadonlySet<string>, onMask?: () => void): unknown {
  if (Array.isArray(value)) return value.map((v) => maskValue(v, fields, onMask))
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => {
        if (fields.has(k) || fields.has(normalizeKey(k))) {
          // Already masked (a row written by this writer, masked again on read) does not count as a new mask.
          if (v !== MASKED) onMask?.()
          return [k, MASKED]
        }
        return [k, maskValue(v, fields, onMask)]
      }),
    )
  }
  return value
}

function clip(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null
  const trimmed = text.trim()
  if (!trimmed) return null
  return trimmed.length > MAX_TEXT ? `${trimmed.slice(0, MAX_TEXT - 1)}…` : trimmed
}

/**
 * The one way to write to `audit_log`. Every feature should call this instead of inserting rows itself, so that the
 * rules below hold for every row in the log:
 *
 *   - `action` and `actor.type` are checked against the values the table accepts, so a typo fails in the caller's
 *     tests instead of as a database constraint error in production.
 *   - Sensitive fields are masked before the row is written (`DEFAULT_SENSITIVE_KEYS` plus `maskFields`), as the F15
 *     schema requires of "the audit writer". Such rows are flagged `is_sensitive`: the list returns `before` / `after`
 *     as `null`, and opening the entry shows the masked copy and writes a `view_sensitive` row.
 *   - A caller can pass a retry-safe `id`; a repeat with the same id is ignored, never a second row.
 *   - `occurred_at` follows the simulation clock; `recorded_at` is left to the database.
 *
 * Pass the caller's transaction client as `tx` when the audited change is written in a transaction, so the change and
 * its audit row commit together or not at all. The table is append-only (database triggers): a written row can never be
 * changed or removed.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
  ) {}

  /** A staff actor from an already-resolved principal, e.g. the admin console's `AdminPrincipal`. */
  static staffActor(principal: { id: string; roleCode: string | null }): AuditActor {
    return { type: 'staff', id: principal.id, role: principal.roleCode }
  }

  /** For rows the system writes on its own (scheduled jobs, simulations). */
  static systemActor(): AuditActor {
    return { type: 'system', id: null, role: null }
  }

  async write(input: AuditWriteInput, tx?: Prisma.TransactionClient): Promise<AuditWriteResult> {
    if (!(AUDIT_ACTIONS as readonly string[]).includes(input.action)) {
      throw new Error(`Unknown audit action "${input.action}". Allowed: ${AUDIT_ACTIONS.join(', ')}`)
    }
    if (!(AUDIT_ACTOR_TYPES as readonly string[]).includes(input.actor.type)) {
      throw new Error(`Unknown audit actor type "${input.actor.type}"`)
    }
    if (input.actor.type !== 'system' && !input.actor.id) {
      throw new Error(`A ${input.actor.type} audit actor needs a user id`)
    }
    const sourceFeature = input.sourceFeature.trim()
    if (!sourceFeature) throw new Error('sourceFeature is required')

    const fields = sensitiveKeySet(input.maskFields ?? [])
    let masked = 0
    const mask = (v: unknown) => maskValue(v, fields, () => masked++)
    const before = input.before === undefined ? undefined : mask(input.before)
    const after = input.after === undefined ? undefined : mask(input.after)
    const sensitive = input.sensitive ?? ((input.maskFields?.length ?? 0) > 0 || masked > 0)

    const data = {
      ...(input.id ? { id: input.id } : {}),
      occurred_at: input.occurredAt ?? this.clock.now(),
      actor_type: input.actor.type,
      actor_id: input.actor.id,
      actor_role: input.actor.role,
      source_feature: sourceFeature,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      summary: clip(input.summary),
      reason: clip(input.reason),
      ...(before === undefined ? {} : { before: before as Prisma.InputJsonValue }),
      ...(after === undefined ? {} : { after: after as Prisma.InputJsonValue }),
      is_sensitive: sensitive,
    }

    const client = tx ?? this.db
    if (!input.id) {
      const row = await client.audit_log.create({ data, select: { id: true, seq: true } })
      return { id: row.id, seq: row.seq.toString(), created: true }
    }

    // Retry-safe write: `ON CONFLICT DO NOTHING`, so a repeat neither fails nor aborts the caller's transaction (a
    // caught unique-violation inside a Postgres transaction would). The row that is there afterwards is returned.
    const { count } = await client.audit_log.createMany({ data: [data], skipDuplicates: true })
    const row = await client.audit_log.findUnique({ where: { id: input.id }, select: { id: true, seq: true } })
    if (!row) throw new Error(`Audit row ${input.id} was neither written nor found`)
    return { id: row.id, seq: row.seq.toString(), created: count > 0 }
  }

  /**
   * `write` for side records that must never change the outcome of the request they describe (a refused request
   * stays refused, a sign-in still signs in). A failed write is logged and reported as `false`.
   */
  async tryWrite(input: AuditWriteInput): Promise<boolean> {
    try {
      await this.write(input)
      return true
    } catch (error) {
      this.logger.warn(`Audit write failed (${input.action}): ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  /**
   * The actor for a signed-in user when all the caller has is the token's user id (`req.user.id`): reads the user's
   * type and, for staff, their current role code.
   */
  async resolveActor(userId: string | null | undefined): Promise<AuditActor> {
    if (!userId) return AuditService.systemActor()
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { type: true, staff: { where: { deleted_at: null }, select: { role: { select: { code: true } } }, take: 1 } },
    })
    const type: AuditActorType = user?.type === 'customer' ? 'customer' : 'staff'
    return { type, id: userId, role: user?.staff[0]?.role.code ?? null }
  }

  /**
   * `view_sensitive`: someone opened data the system treats as sensitive (a passport number, a full payment record).
   * Call it from the endpoint that returns that data. The row itself carries no before/after, so it is not sensitive.
   */
  recordSensitiveView(
    actor: AuditActor,
    view: { sourceFeature: string; entityType: string; entityId: string; summary?: string; reason?: string; id?: string },
    tx?: Prisma.TransactionClient,
  ): Promise<AuditWriteResult> {
    return this.write({ actor, action: 'view_sensitive', sensitive: false, ...view }, tx)
  }

  /**
   * `access_denied`: a signed-in user was refused a screen or endpoint. Repeats of the same refusal for the same actor
   * within `dedupeMs` are skipped — one page load asks several endpoints, and the log should show one attempt, not five.
   * Never throws.
   */
  async recordAccessDenied(
    actor: AuditActor,
    denial: { sourceFeature: string; entityType: string; entityId: string; summary?: string; reason?: string },
    dedupeMs = 60_000,
  ): Promise<boolean> {
    try {
      if (actor.id && dedupeMs > 0) {
        const recent = await this.db.audit_log.findFirst({
          where: {
            actor_id: actor.id,
            action: 'access_denied',
            entity_type: denial.entityType,
            entity_id: denial.entityId,
            recorded_at: { gte: new Date(Date.now() - dedupeMs) },
          },
          select: { id: true },
        })
        if (recent) return false
      }
    } catch (error) {
      // A failed look-up only risks a duplicate row; still try to record the refusal.
      this.logger.warn(`Audit de-duplication check failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    return this.tryWrite({ actor, action: 'access_denied', ...denial })
  }
}
