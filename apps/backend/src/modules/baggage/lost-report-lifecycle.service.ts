import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'

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
    const setting = await this.db.baggage_setting.findUnique({
      where: { key: 'lost_after_days' },
      select: { value: true },
    })
    const lostAfterDays = Number(setting?.value)

    if (!Number.isSafeInteger(lostAfterDays) || lostAfterDays <= 0) {
      throw new InternalServerErrorException('The lost_after_days baggage setting is missing or invalid')
    }

    const evaluatedAt = this.clock.now()
    const cutoff = new Date(evaluatedAt.getTime() - lostAfterDays * DAY_MS)
    const updatedAt = new Date()

    const marked = await this.db.$transaction(async (tx) => {
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

      if (lockedReports.length === 0) return 0

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

      return result.count
    })

    return { lostAfterDays, cutoff, evaluatedAt, marked }
  }
}
