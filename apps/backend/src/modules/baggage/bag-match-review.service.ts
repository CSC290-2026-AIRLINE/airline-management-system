import { Inject, Injectable } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { AuditService, type AuditActor } from '@backend/modules/admin-console/audit/audit.service'
import { AUDIT_SOURCE_FEATURE, MAX_LIST_ROWS, type BagColour, type BagType, type ReportStatus } from './common/baggage.constants'
import {
  MATCHABLE_REPORT_STATUSES,
  MATCH_LEVELS,
  OPEN_MATCH_STATUSES,
  type BagMatch,
  type MatchLevel,
  type MatchStatus,
  type StaffName,
} from './common/bag-match.types'
import { lockFoundBag, lockLostReport } from './common/case-locks'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { FOUND_BAG_CLOCK, type FoundBagClock } from './common/found-bag.ports'
import type { FoundBagStatus } from './common/found-bag.types'
import { scoreMatch } from './common/match-score'
import { UUID_PATTERN, prismaErrorCode } from './common/patterns'

/** Written on the other open matches of a report and a bag when one of their matches is confirmed. */
export const SUPERSEDED_NOTE = 'Another match was confirmed'

/** audit_log.entity_type of a reviewed match. */
export const BAG_MATCH_ENTITY = 'bag_match'

export interface MatchFilter {
  status?: MatchStatus
  reportId?: string
  foundBagId?: string
}

export interface LinkInput {
  staffId: string
  /** Who is signed in, for the audit row. */
  actor: AuditActor
  reportId: string
  foundBagId: string
}

export interface ReviewInput {
  staffId: string
  /** Who is signed in, for the audit row. */
  actor: AuditActor
  matchId: string
  note?: string | null
}

const STAFF_NAME = { select: { id: true, first_name: true, last_name: true } } satisfies Prisma.staffDefaultArgs

const MATCH_INCLUDE = {
  lost_bag_report: {
    include: {
      passenger: { select: { first_name: true, last_name: true } },
      flight: { select: { flight_number: true, service_date: true } },
      booking_coupon: { select: { booking_passenger: { select: { booking: { select: { booking_reference: true } } } } } },
    },
  },
  found_bag: {
    include: {
      flight: { select: { flight_number: true } },
      checked_bag: { select: { check_in: { select: { booking_passenger_id: true } } } },
      bag_location_event: { select: { airport_code: true }, orderBy: [{ occurred_at: 'desc' }, { created_at: 'desc' }], take: 1 },
    },
  },
  staff_bag_match_linked_byTostaff: STAFF_NAME,
  staff_bag_match_reviewed_byTostaff: STAFF_NAME,
} satisfies Prisma.bag_matchInclude

type MatchRow = Prisma.bag_matchGetPayload<{ include: typeof MATCH_INCLUDE }>

function toStaffName(row: { id: string; first_name: string; last_name: string } | null): StaffName | null {
  return row ? { id: row.id, firstName: row.first_name, lastName: row.last_name } : null
}

export function toBagMatch(row: MatchRow): BagMatch {
  const report = row.lost_bag_report
  const bag = row.found_bag
  const owner = bag.checked_bag?.check_in.booking_passenger_id ?? null
  const { score, reasons } = scoreMatch(
    {
      tagNumber: report.tag_number,
      flightId: report.flight_id,
      bagType: report.bag_type,
      colour: report.colour,
      brand: report.brand,
      description: report.description,
    },
    {
      tagNumber: bag.tag_number,
      flightId: bag.flight_id,
      bagType: bag.bag_type,
      colour: bag.colour,
      brand: bag.brand,
      description: bag.description,
    },
    owner !== null && owner === report.booking_passenger_id,
  )

  return {
    id: row.id,
    level: row.match_level as MatchLevel,
    status: row.status as MatchStatus,
    score,
    reasons,
    linkedBy: toStaffName(row.staff_bag_match_linked_byTostaff),
    reviewedBy: toStaffName(row.staff_bag_match_reviewed_byTostaff),
    reviewNote: row.review_note,
    suggestedAt: row.suggested_at,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    report: {
      id: report.id,
      caseNumber: report.case_number,
      status: report.status as ReportStatus,
      passengerFirstName: report.passenger.first_name,
      passengerLastName: report.passenger.last_name,
      bookingReference: report.booking_coupon.booking_passenger.booking.booking_reference,
      flightId: report.flight_id,
      flightNumber: report.flight.flight_number,
      flightDate: report.flight.service_date,
      tagNumber: report.tag_number,
      bagType: report.bag_type as BagType,
      colour: report.colour as BagColour,
      brand: report.brand,
      description: report.description,
      reportedAt: report.reported_at,
      reportedByStaff: report.reported_by_staff_id !== null,
    },
    foundBag: {
      id: bag.id,
      status: bag.status as FoundBagStatus,
      tagNumber: bag.tag_number,
      flightId: bag.flight_id,
      flightNumber: bag.flight?.flight_number ?? null,
      bagType: bag.bag_type as BagType | null,
      colour: bag.colour as BagColour | null,
      brand: bag.brand,
      description: bag.description,
      foundAirport: bag.found_airport,
      foundAt: bag.found_at,
      currentAirport: bag.bag_location_event[0]?.airport_code ?? bag.found_airport,
    },
  }
}

/** Open matches first, then confirmed, then rejected; strong before possible before manual; best score first. */
function reviewOrder(a: BagMatch, b: BagMatch): number {
  const group = (m: BagMatch) => (OPEN_MATCH_STATUSES.includes(m.status) ? 0 : m.status === 'confirmed' ? 1 : 2)
  return (
    group(a) - group(b) ||
    MATCH_LEVELS.indexOf(a.level) - MATCH_LEVELS.indexOf(b.level) ||
    b.score - a.score ||
    b.suggestedAt.getTime() - a.suggestedAt.getTime() ||
    a.id.localeCompare(b.id)
  )
}

function notFound(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.MATCH_NOT_FOUND, 'Match not found')
}

function closed(message: string): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.MATCH_CLOSED, message)
}

function requireStaff(staffId: string): void {
  if (!staffId || !UUID_PATTERN.test(staffId)) {
    throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_MATCH, 'Reviewing staff member is required')
  }
}

/**
 * Match review: staff look at suggested matches, link a found bag to a case by hand, and confirm the owner or reject
 * the match. Confirming is the only step that moves a case and a bag on (both become matched).
 */
@Injectable()
export class BagMatchReviewService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    @Inject(FOUND_BAG_CLOCK) private readonly clock: FoundBagClock,
  ) {}

  async list(filter: MatchFilter = {}): Promise<BagMatch[]> {
    const where: Prisma.bag_matchWhereInput = {}
    const reportId = filter.reportId?.trim()
    const foundBagId = filter.foundBagId?.trim()

    if (filter.status) where.status = filter.status
    if (reportId) {
      if (!UUID_PATTERN.test(reportId)) return []
      where.report_id = reportId
    }
    if (foundBagId) {
      if (!UUID_PATTERN.test(foundBagId)) return []
      where.found_bag_id = foundBagId
    }

    // A pending suggestion is only actionable while its case can still be matched and its bag is still held. Suggestions
    // left on a cancelled, closed or already-matched case, or on a bag that turned unclaimed or flew on with its diverted
    // flight, stay stored as history but are not offered for review; reviewed rows always show.
    where.OR = [
      { status: { notIn: OPEN_MATCH_STATUSES } },
      { lost_bag_report: { status: { in: MATCHABLE_REPORT_STATUSES } }, found_bag: { status: 'held' } },
    ]

    // The newest rows; reviewOrder then puts open and strong matches first.
    const rows = await this.db.bag_match.findMany({
      where,
      include: MATCH_INCLUDE,
      orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
      take: MAX_LIST_ROWS,
    })

    return rows.map(toBagMatch).sort(reviewOrder)
  }

  async getById(id: string): Promise<BagMatch> {
    const row = UUID_PATTERN.test(id) ? await this.db.bag_match.findUnique({ where: { id }, include: MATCH_INCLUDE }) : null

    if (!row) {
      throw notFound()
    }

    return toBagMatch(row)
  }

  /** Staff link a held found bag to an open or lost case by hand (match_level manual). */
  async link(input: LinkInput): Promise<BagMatch> {
    const staffId = input.staffId?.trim()
    const reportId = input.reportId?.trim()
    const foundBagId = input.foundBagId?.trim()

    requireStaff(staffId)

    const [report, bag] = await Promise.all([
      UUID_PATTERN.test(reportId) ? this.db.lost_bag_report.findUnique({ where: { id: reportId }, select: { status: true } }) : null,
      UUID_PATTERN.test(foundBagId) ? this.db.found_bag.findUnique({ where: { id: foundBagId }, select: { status: true } }) : null,
    ])

    if (!report) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.REPORT_NOT_FOUND, 'Lost bag report not found')
    }

    if (!bag) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.FOUND_BAG_NOT_FOUND, 'Found bag not found')
    }

    if (!MATCHABLE_REPORT_STATUSES.some((s) => s === report.status)) {
      throw closed('Only an open or lost case can be linked to a found bag')
    }

    if (bag.status !== 'held') {
      throw closed('Only a held bag can be linked to a case')
    }

    const now = new Date()

    const suggestedAt = this.clock.now()

    try {
      const row = await this.db.$transaction(async (tx) => {
        const created = await tx.bag_match.create({
          data: {
            report_id: reportId,
            found_bag_id: foundBagId,
            match_level: 'manual',
            status: 'suggested',
            linked_by: staffId,
            suggested_at: suggestedAt,
            created_at: now,
            updated_at: now,
          },
          include: MATCH_INCLUDE,
        })

        await this.audit.write(
          {
            actor: input.actor,
            sourceFeature: AUDIT_SOURCE_FEATURE,
            action: 'create',
            entityType: BAG_MATCH_ENTITY,
            entityId: created.id,
            summary: `Found bag linked by hand to lost bag case ${created.lost_bag_report.case_number}`,
            after: { status: 'suggested', level: 'manual', reportId, foundBagId, staffId },
            occurredAt: suggestedAt,
          },
          tx,
        )

        return created
      })

      return toBagMatch(row)
    } catch (e) {
      if (prismaErrorCode(e) === 'P2002') {
        throw new FoundBagError(FOUND_BAG_ERROR_CODES.MATCH_EXISTS, 'This bag is already matched with this case')
      }

      throw e
    }
  }

  /**
   * Staff confirm the owner. In one transaction: the match becomes confirmed with the reviewer's note, every other open
   * match of the case and of the bag is rejected, the case and the bag become matched, the case gets its delivery row
   * (waiting for the passenger's choice), and the review is written to audit_log. A match linked by hand needs a second
   * staff member: the one who linked it cannot confirm it.
   */
  async confirm(input: ReviewInput): Promise<BagMatch> {
    const staffId = input.staffId?.trim()
    const note = input.note?.trim()

    requireStaff(staffId)

    if (!note) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_MATCH, 'A note is required to confirm the owner')
    }

    const match = await this.findOpen(input.matchId)

    if (match.linked_by === staffId) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.SELF_CONFIRM, 'Another staff member must confirm a match you linked')
    }

    const reviewedAt = this.clock.now()
    const now = new Date()

    try {
      await this.db.$transaction(async (tx) => {
        // The case, then the bag: the lock order of every write to a case (see case-locks). A passenger cancelling the
        // case or a desk moving the bag waits for this confirmation, or this waits for them.
        const lockedReport = await lockLostReport(tx, match.report_id)

        if (!lockedReport) {
          throw notFound()
        }

        // A suggestion left on a case that was cancelled or closed meanwhile is not confirmed (nothing is written).
        if (!MATCHABLE_REPORT_STATUSES.some((s) => s === lockedReport.status)) {
          throw closed('This case is no longer open')
        }

        if (!(await lockFoundBag(tx, match.found_bag_id))) {
          throw notFound()
        }

        // Each step only changes a row still in the state it was read in, so a concurrent review loses cleanly.
        const confirmed = await tx.bag_match.updateMany({
          where: { id: match.id, status: { in: OPEN_MATCH_STATUSES } },
          data: { status: 'confirmed', reviewed_by: staffId, reviewed_at: reviewedAt, review_note: note, updated_at: now },
        })

        if (confirmed.count !== 1) {
          throw closed('This match has already been reviewed')
        }

        await tx.bag_match.updateMany({
          where: {
            id: { not: match.id },
            status: { in: OPEN_MATCH_STATUSES },
            OR: [{ report_id: match.report_id }, { found_bag_id: match.found_bag_id }],
          },
          data: { status: 'rejected', reviewed_by: staffId, reviewed_at: reviewedAt, review_note: SUPERSEDED_NOTE, updated_at: now },
        })

        const report = await tx.lost_bag_report.updateMany({
          where: { id: match.report_id, status: { in: MATCHABLE_REPORT_STATUSES } },
          data: { status: 'matched', updated_at: now },
        })

        if (report.count !== 1) {
          throw closed('This case is no longer open')
        }

        const bag = await tx.found_bag.updateMany({
          where: { id: match.found_bag_id, status: 'held' },
          data: { status: 'matched', updated_at: now },
        })

        if (bag.count !== 1) {
          throw closed('This bag is no longer held')
        }

        await tx.bag_delivery.upsert({
          where: { report_id: match.report_id },
          create: { report_id: match.report_id, status: 'waiting_choice', created_at: now, updated_at: now },
          update: {},
        })

        await this.writeReview(tx, input.actor, match, 'confirmed', note, staffId, reviewedAt)
      })
    } catch (e) {
      // bag_match_report_confirmed_uq or bag_match_bag_confirmed_uq: another match was confirmed at the same time.
      if (prismaErrorCode(e) === 'P2002') {
        throw closed('This case or bag already has a confirmed match')
      }

      throw e
    }

    return this.getById(match.id)
  }

  /**
   * Not the same bag. The case and the bag stay as they are and can be matched again with others. Only a suggestion on a
   * case that can still be matched is reviewed: one left on a cancelled or closed case is history, not a decision.
   */
  async reject(input: ReviewInput): Promise<BagMatch> {
    const staffId = input.staffId?.trim()

    requireStaff(staffId)

    const match = await this.findOpen(input.matchId)
    const note = input.note?.trim() || null
    const reviewedAt = this.clock.now()

    await this.db.$transaction(async (tx) => {
      // The case lock first (see case-locks), then its state: a passenger cancelling the case either finished before
      // this, and is seen here, or waits for this review.
      const report = await lockLostReport(tx, match.report_id)

      if (!report) {
        throw notFound()
      }

      if (!MATCHABLE_REPORT_STATUSES.some((s) => s === report.status)) {
        throw closed('This case is no longer open')
      }

      const { count } = await tx.bag_match.updateMany({
        where: { id: match.id, status: { in: OPEN_MATCH_STATUSES } },
        data: { status: 'rejected', reviewed_by: staffId, reviewed_at: reviewedAt, review_note: note, updated_at: new Date() },
      })

      if (count !== 1) {
        throw closed('This match has already been reviewed')
      }

      await this.writeReview(tx, input.actor, match, 'rejected', note, staffId, reviewedAt)
    })

    return this.getById(match.id)
  }

  /** One audit_log row per review, written in the review's transaction so they commit together. */
  private async writeReview(
    tx: Prisma.TransactionClient,
    actor: AuditActor,
    match: { id: string; status: string; report_id: string; found_bag_id: string },
    status: 'confirmed' | 'rejected',
    note: string | null,
    staffId: string,
    reviewedAt: Date,
  ): Promise<void> {
    await this.audit.write(
      {
        actor,
        sourceFeature: AUDIT_SOURCE_FEATURE,
        action: 'status_change',
        entityType: BAG_MATCH_ENTITY,
        entityId: match.id,
        summary: `Match ${status} for lost bag report ${match.report_id}`,
        reason: note,
        before: { status: match.status },
        after: { status, reportId: match.report_id, foundBagId: match.found_bag_id, staffId },
        occurredAt: reviewedAt,
      },
      tx,
    )
  }

  private async findOpen(matchId: string) {
    const match = UUID_PATTERN.test(matchId)
      ? await this.db.bag_match.findUnique({
          where: { id: matchId },
          select: { id: true, status: true, report_id: true, found_bag_id: true, linked_by: true },
        })
      : null

    if (!match) {
      throw notFound()
    }

    if (!OPEN_MATCH_STATUSES.some((s) => s === match.status)) {
      throw closed('This match has already been reviewed')
    }

    return match
  }
}
