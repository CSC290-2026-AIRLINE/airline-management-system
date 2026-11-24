import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { AuditService, type AuditActor } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { BaggageCaseNotices } from './baggage-case-notices'
import { AUDIT_SOURCE_FEATURE } from './common/baggage.constants'
import { shareLockBaggageSetting } from './common/case-locks'

const DAY_MS = 24 * 60 * 60 * 1000

export interface LostReportTimeoutResult {
  lostAfterDays: number
  cutoff: Date
  evaluatedAt: Date
  marked: number
}

@Injectable()
export class LostReportLifecycleService {
  constructor(
    private readonly db: DbService,
    @Inject(SimulationClock) private readonly clock: Pick<SimulationClock, 'now'>,
    private readonly audit: AuditService,
    private readonly notices: BaggageCaseNotices = new BaggageCaseNotices(),
  ) {}

  /**
   * Marks open cases with no confirmed bag as lost once lost_after_days have passed since they were reported. Like the
   * unclaimed sweep, one audit row names the cases it really changed; each one then gets a `lost` notice (F13 opens the
   * compensation case).
   */
  async markTimedOutReports(actor: AuditActor = AuditService.systemActor()): Promise<LostReportTimeoutResult> {
    const updatedAt = new Date()

    const { result, markedIds } = await this.db.$transaction(async (tx) => {
      // The threshold is read under a FOR SHARE lock in this transaction (see shareLockBaggageSetting), so a concurrent
      // settings change cannot commit while this sweep still applies the old value.
      const lostAfterDays = Number(await shareLockBaggageSetting(tx, 'lost_after_days'))

      if (!Number.isSafeInteger(lostAfterDays) || lostAfterDays <= 0) {
        throw new InternalServerErrorException('The lost_after_days baggage setting is missing or invalid')
      }

      const evaluatedAt = this.clock.now()
      const cutoff = new Date(evaluatedAt.getTime() - lostAfterDays * DAY_MS)

      // Match confirmation and cancellation serialize on this report row. SKIP LOCKED lets another sweep retry it later.
      const lockedReports = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM lost_bag_report
        WHERE status = 'open'
          AND lost_at IS NULL
          AND reported_at <= ${cutoff}
        ORDER BY id
        FOR UPDATE SKIP LOCKED
      `

      if (lockedReports.length === 0) return { result: { lostAfterDays, cutoff, evaluatedAt, marked: 0 }, markedIds: [] }

      const marked = await tx.lost_bag_report.updateManyAndReturn({
        where: {
          id: { in: lockedReports.map(({ id }) => id) },
          status: 'open',
          lost_at: null,
          reported_at: { lte: cutoff },
          bag_match: { none: { status: 'confirmed' } },
        },
        data: {
          status: 'lost',
          lost_at: evaluatedAt,
          updated_at: updatedAt,
        },
        select: { id: true },
      })
      const ids = marked.map((r) => r.id)

      if (ids.length > 0) {
        await this.audit.write(
          {
            actor,
            sourceFeature: AUDIT_SOURCE_FEATURE,
            action: 'status_change',
            entityType: 'lost_bag_report',
            summary: `${ids.length} lost bag case(s) marked lost after ${lostAfterDays} days`,
            before: { status: 'open' },
            after: { status: 'lost', reportIds: ids, cutoff },
            occurredAt: evaluatedAt,
          },
          tx,
        )
      }

      return { result: { lostAfterDays, cutoff, evaluatedAt, marked: ids.length }, markedIds: ids }
    })

    this.notices.notify(markedIds.map((reportId) => ({ event: 'lost' as const, reportId })))

    return result
  }
}
