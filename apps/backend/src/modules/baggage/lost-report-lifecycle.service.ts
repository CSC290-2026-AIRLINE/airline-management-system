import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
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
  ) {}

  async markTimedOutReports(): Promise<LostReportTimeoutResult> {
    const updatedAt = new Date()

    return this.db.$transaction(async (tx) => {
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

      if (lockedReports.length === 0) return { lostAfterDays, cutoff, evaluatedAt, marked: 0 }

      const result = await tx.lost_bag_report.updateMany({
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
      })

      return { lostAfterDays, cutoff, evaluatedAt, marked: result.count }
    })
  }
}
