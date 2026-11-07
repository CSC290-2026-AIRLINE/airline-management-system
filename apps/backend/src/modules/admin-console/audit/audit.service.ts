import { Injectable, Logger } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { AUDIT_ACTIONS, AUDIT_ACTOR_TYPES, type AuditAction, type AuditActorType } from '../dto/audit-query.dto'
import { SimulationClock } from '../simulation-clock'

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
   * Field names whose values are replaced with `MASKED` inside `before` / `after`, at any depth — card numbers,
   * passport numbers, dates of birth. The masked copy is what gets stored; the real value never reaches the table.
   */
  maskFields?: readonly string[]
  /**
   * Hide `before` / `after` from the audit endpoints altogether (`audit_log.is_sensitive`). Defaults to `true` whenever
   * `maskFields` is given, because a row that needed masking is a sensitive row.
   */
  sensitive?: boolean
  /** Business time. Defaults to the simulation clock; `recorded_at` is always the database's real `now()`. */
  occurredAt?: Date
}

export interface AuditWriteResult {
  id: string
  /** `audit_log.seq` as a decimal string (BigInt does not survive JSON). */
  seq: string
}

/** What a masked value is replaced with. */
export const MASKED = '[masked]'

/** Matches the `reason` limit the admin endpoints use. Longer text is cut, not rejected, so a write never fails on it. */
const MAX_TEXT = 500

/** Copy of `value` with every property named in `fields` (at any depth, in objects and arrays) replaced by `MASKED`. */
export function maskValue(value: unknown, fields: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => maskValue(v, fields))
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fields.has(k) ? MASKED : maskValue(v, fields)]))
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
 *   - Sensitive fields are masked before the row is written (`maskFields`), as the F15 schema requires of "the audit
 *     writer"; such rows are also flagged `is_sensitive`, so the admin endpoints return `before` / `after` as `null`.
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

    const fields = new Set(input.maskFields ?? [])
    const mask = (v: unknown) => (fields.size > 0 ? maskValue(v, fields) : v)
    const sensitive = input.sensitive ?? fields.size > 0

    const client = tx ?? this.db
    const row = await client.audit_log.create({
      data: {
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
        ...(input.before === undefined ? {} : { before: mask(input.before) as Prisma.InputJsonValue }),
        ...(input.after === undefined ? {} : { after: mask(input.after) as Prisma.InputJsonValue }),
        is_sensitive: sensitive,
      },
      select: { id: true, seq: true },
    })
    return { id: row.id, seq: row.seq.toString() }
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
    view: { sourceFeature: string; entityType: string; entityId: string; summary?: string; reason?: string },
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
