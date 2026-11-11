import { Injectable, InternalServerErrorException } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { AuditService, type AuditActor } from '@backend/modules/admin-console/audit/audit.service'
import { AUDIT_SOURCE_FEATURE } from './common/baggage.constants'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { UUID_PATTERN } from './common/patterns'
import { LOST_AFTER_DAYS_RANGE, UNCLAIMED_AFTER_DAYS_RANGE } from './dto/update-baggage-settings.dto'

export interface BaggageSettings {
  lostAfterDays: number
  unclaimedAfterDays: number
  /** The most recent change to either value. */
  updatedAt: Date
  /** Staff member behind that most recent change; null for the migration defaults. */
  updatedBy: string | null
}

export interface UpdateBaggageSettingsInput {
  lostAfterDays: number
  unclaimedAfterDays: number
  staffId: string
  actor: AuditActor
}

type SettingKey = 'lost_after_days' | 'unclaimed_after_days'

const FIELDS: ReadonlyArray<{ key: SettingKey; field: 'lostAfterDays' | 'unclaimedAfterDays'; range: { min: number; max: number } }> = [
  { key: 'lost_after_days', field: 'lostAfterDays', range: LOST_AFTER_DAYS_RANGE },
  { key: 'unclaimed_after_days', field: 'unclaimedAfterDays', range: UNCLAIMED_AFTER_DAYS_RANGE },
]

const SETTING_ENTITY = 'baggage_setting'

function invalid(message: string): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_BAGGAGE_SETTINGS, message)
}

/** A stored value the lifecycle jobs would accept (a positive integer). Anything else means the table is not usable. */
function parseStored(value: string | undefined, key: SettingKey): number {
  const parsed = Number(value)
  if (value === undefined || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new InternalServerErrorException(`The ${key} baggage setting is missing or invalid`)
  }
  return parsed
}

/**
 * Admin baggage settings (spec: GET, PUT /staff/baggage-settings, guard "B (admin)"): the days until a case is lost
 * (lost_after_days, default 21) and until a held bag is unclaimed (unclaimed_after_days, default 90). The lifecycle
 * runners read these on every sweep, so a change takes effect within about a minute.
 *
 * TEMPORARY SAFETY RULE: a value may stay the same or increase, but not decrease, until the impact of lowering a
 * threshold (cases and bags changing status at the next sweep, with no way back for unclaimed bags) has a policy.
 */
@Injectable()
export class BaggageSettingsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<BaggageSettings> {
    const rows = await this.db.baggage_setting.findMany({
      where: { key: { in: FIELDS.map(({ key }) => key) } },
      select: { key: true, value: true, updated_at: true, updated_by: true },
    })
    const byKey = new Map(rows.map((row) => [row.key as SettingKey, row]))
    const latest = rows.reduce<(typeof rows)[number] | undefined>(
      (acc, row) => (!acc || row.updated_at > acc.updated_at ? row : acc),
      undefined,
    )

    return {
      lostAfterDays: parseStored(byKey.get('lost_after_days')?.value, 'lost_after_days'),
      unclaimedAfterDays: parseStored(byKey.get('unclaimed_after_days')?.value, 'unclaimed_after_days'),
      updatedAt: latest!.updated_at,
      updatedBy: latest!.updated_by,
    }
  }

  /** Full replacement of both values. Changed keys are updated and audited (one row each) in one transaction. */
  async update(input: UpdateBaggageSettingsInput): Promise<BaggageSettings> {
    if (!input.staffId || !UUID_PATTERN.test(input.staffId)) {
      throw invalid('Recording staff member is required')
    }

    for (const { field, range } of FIELDS) {
      const value = input[field]
      if (!Number.isInteger(value) || value < range.min || value > range.max) {
        throw invalid(`${field} must be a whole number from ${range.min} to ${range.max}`)
      }
    }

    await this.db.$transaction(async (tx) => {
      // Lock both rows, then compare against what is stored NOW, so a concurrent change cannot slip a reduction past
      // this check (no stale read).
      const current = await this.lockCurrent(tx)
      const changes = FIELDS.map(({ key, field }) => ({ key, from: current.get(key)!, to: input[field] })).filter(
        ({ from, to }) => from !== to,
      )

      const reductions = changes.filter(({ from, to }) => to < from)
      if (reductions.length > 0) {
        const detail = reductions.map(({ key, from, to }) => `${key} ${from} -> ${to}`).join(', ')
        throw new FoundBagError(
          FOUND_BAG_ERROR_CODES.SETTING_REDUCTION_PENDING_APPROVAL,
          `Lowering a baggage threshold is pending policy approval (${detail}). Only unchanged or higher values are accepted for now.`,
        )
      }

      const now = new Date()
      for (const { key, from, to } of changes) {
        await tx.baggage_setting.update({
          where: { key },
          data: { value: String(to), updated_at: now, updated_by: input.staffId },
        })
        await this.audit.write(
          {
            actor: input.actor,
            sourceFeature: AUDIT_SOURCE_FEATURE,
            action: 'update',
            entityType: SETTING_ENTITY,
            entityId: key,
            summary: `Baggage setting ${key} changed from ${from} to ${to} days`,
            before: { value: from },
            after: { value: to, staffId: input.staffId },
          },
          tx,
        )
      }
    })

    return this.get()
  }

  private async lockCurrent(tx: Prisma.TransactionClient): Promise<Map<SettingKey, number>> {
    const rows = await tx.$queryRaw<{ key: string; value: string }[]>`
      SELECT key, value
      FROM baggage_setting
      WHERE key IN ('lost_after_days', 'unclaimed_after_days')
      ORDER BY key
      FOR UPDATE`
    const byKey = new Map(rows.map((row) => [row.key, row.value]))

    return new Map(FIELDS.map(({ key }) => [key, parseStored(byKey.get(key), key)]))
  }
}
