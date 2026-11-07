import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { MATCHABLE_REPORT_STATUSES, type MatchRunResult } from './common/bag-match.types'
import { FOUND_BAG_CLOCK, type FoundBagClock, type FoundBagRecordedListener } from './common/found-bag.ports'
import type { FoundBag } from './common/found-bag.types'
import { scoreMatch, type MatchSide } from './common/match-score'
import { UUID_PATTERN } from './common/patterns'

const REPORT_FIELDS = {
  id: true,
  booking_passenger_id: true,
  tag_number: true,
  flight_id: true,
  bag_type: true,
  colour: true,
  brand: true,
  description: true,
} satisfies Prisma.lost_bag_reportSelect

const BAG_FIELDS = {
  id: true,
  status: true,
  tag_number: true,
  flight_id: true,
  bag_type: true,
  colour: true,
  brand: true,
  description: true,
  checked_bag: { select: { check_in: { select: { booking_passenger_id: true } } } },
} satisfies Prisma.found_bagSelect

type ReportFields = Prisma.lost_bag_reportGetPayload<{ select: typeof REPORT_FIELDS }>
type BagFields = Prisma.found_bagGetPayload<{ select: typeof BAG_FIELDS }>

interface NewMatch {
  report_id: string
  found_bag_id: string
  match_level: 'strong' | 'possible'
}

function side(row: ReportFields | BagFields): MatchSide {
  return {
    tagNumber: row.tag_number,
    flightId: row.flight_id,
    bagType: row.bag_type,
    colour: row.colour,
    brand: row.brand,
    description: row.description,
  }
}

function ownerOf(bag: BagFields): string | null {
  return bag.checked_bag?.check_in.booking_passenger_id ?? null
}

function suggestion(report: ReportFields, bag: BagFields): NewMatch[] {
  const owner = ownerOf(bag)
  const { level } = scoreMatch(side(report), side(bag), owner !== null && owner === report.booking_passenger_id)
  return level ? [{ report_id: report.id, found_bag_id: bag.id, match_level: level }] : []
}

/**
 * Automatic matching between lost bag reports and held found bags. It only suggests: every new pair is a bag_match row
 * with status suggested, and staff confirm or reject it on Match review. A pair that already has a row (rejected ones
 * included) is never suggested again, so a rejection sticks.
 */
@Injectable()
export class BagMatchingService implements FoundBagRecordedListener {
  private readonly logger = new Logger(BagMatchingService.name)

  constructor(
    private readonly db: DbService,
    @Inject(FOUND_BAG_CLOCK) private readonly clock: FoundBagClock,
  ) {}

  /** Runs after FoundBagService saves a bag. A matching failure is logged and never undoes the saved bag. */
  async onFoundBagRecorded(bag: Pick<FoundBag, 'id'>): Promise<void> {
    try {
      await this.matchFoundBag(bag.id)
    } catch (e) {
      this.logger.error(`Matching failed for found bag ${bag.id}`, e instanceof Error ? e.stack : String(e))
    }
  }

  /**
   * For callers that must not fail when matching does: a new report (staff or passenger), a diverted flight's bags, or
   * a bag whose type and colour were just added. Errors are logged.
   */
  async suggestForReport(reportId: string): Promise<void> {
    try {
      await this.matchReport(reportId)
    } catch (e) {
      this.logger.error(`Matching failed for report ${reportId}`, e instanceof Error ? e.stack : String(e))
    }
  }

  async suggestForFoundBags(foundBagIds: string[]): Promise<void> {
    for (const id of foundBagIds) {
      await this.onFoundBagRecorded({ id })
    }
  }

  /** Suggest matches between one held found bag and every report that is still open or lost. */
  async matchFoundBag(foundBagId: string): Promise<MatchRunResult> {
    const bag = UUID_PATTERN.test(foundBagId) ? await this.db.found_bag.findUnique({ where: { id: foundBagId }, select: BAG_FIELDS }) : null

    if (!bag || bag.status !== 'held') {
      return { created: 0 }
    }

    const owner = ownerOf(bag)
    const anyOf: Prisma.lost_bag_reportWhereInput[] = []
    if (bag.tag_number) anyOf.push({ tag_number: bag.tag_number })
    if (owner) anyOf.push({ booking_passenger_id: owner })
    if (bag.flight_id && bag.bag_type && bag.colour) anyOf.push({ flight_id: bag.flight_id, bag_type: bag.bag_type, colour: bag.colour })

    if (anyOf.length === 0) {
      return { created: 0 }
    }

    const reports = await this.db.lost_bag_report.findMany({
      where: { status: { in: MATCHABLE_REPORT_STATUSES }, OR: anyOf, bag_match: { none: { found_bag_id: bag.id } } },
      select: REPORT_FIELDS,
    })

    return this.insert(reports.flatMap((report) => suggestion(report, bag)))
  }

  /** Suggest matches between one open or lost report and every held found bag. */
  async matchReport(reportId: string): Promise<MatchRunResult> {
    const report = UUID_PATTERN.test(reportId)
      ? await this.db.lost_bag_report.findUnique({ where: { id: reportId }, select: { ...REPORT_FIELDS, status: true } })
      : null

    if (!report || !MATCHABLE_REPORT_STATUSES.some((s) => s === report.status)) {
      return { created: 0 }
    }

    const anyOf: Prisma.found_bagWhereInput[] = [
      { checked_bag: { check_in: { booking_passenger_id: report.booking_passenger_id } } },
      { flight_id: report.flight_id, bag_type: report.bag_type, colour: report.colour },
    ]
    if (report.tag_number) anyOf.push({ tag_number: report.tag_number })

    const bags = await this.db.found_bag.findMany({
      where: { status: 'held', OR: anyOf, bag_match: { none: { report_id: report.id } } },
      select: BAG_FIELDS,
    })

    return this.insert(bags.flatMap((bag) => suggestion(report, bag)))
  }

  private async insert(rows: NewMatch[]): Promise<MatchRunResult> {
    if (rows.length === 0) {
      return { created: 0 }
    }

    // suggested_at is simulation time; created_at and updated_at are real time, set by the backend.
    const suggestedAt = this.clock.now()
    const now = new Date()

    // skipDuplicates: a concurrent run may have added the same pair (UNIQUE (report_id, found_bag_id)).
    const { count } = await this.db.bag_match.createMany({
      data: rows.map((row) => ({ ...row, status: 'suggested', suggested_at: suggestedAt, created_at: now, updated_at: now })),
      skipDuplicates: true,
    })

    return { created: count }
  }
}
