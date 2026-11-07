import { Injectable } from '@nestjs/common'
import type { lost_bag_report } from '@backend/db/generated/prisma/client'
import type { DbService } from '@backend/db/db.service'
import { BAGGAGE_ERROR_CODES, BaggageError } from './common/baggage.errors'
import type { ReportRepository } from './common/report.ports'
import type { LostBagReport } from './common/report.types'
import type { BagType, BagColour, ReportStatus } from './common/baggage.constants'

const LIVE_STATUSES = ['open', 'matched', 'delivering', 'lost']

function toReport(row: lost_bag_report): LostBagReport {
  return {
    id: row.id,
    caseNumber: row.case_number,
    bookingPassengerId: row.booking_passenger_id,
    passengerId: row.passenger_id,
    flightId: row.flight_id,
    reportedByCustomerId: row.reported_by_customer_id,
    reportedByStaffId: row.reported_by_staff_id,
    tagNumber: row.tag_number,
    bagType: row.bag_type as BagType,
    colour: row.colour as BagColour,
    brand: row.brand,
    description: row.description,
    photoUrl: row.photo_url,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    status: row.status as ReportStatus,
    reportedAt: row.reported_at,
    lostAt: row.lost_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

@Injectable()
export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly db: DbService) {}

  async create(report: LostBagReport): Promise<LostBagReport> {
    if (report.tagNumber && (await this.findLiveByTag(report.tagNumber))) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.REPORT_EXISTS, 'A live report already exists for this baggage tag')
    }

    try {
      const row = await this.db.lost_bag_report.create({
        data: {
          id: report.id,
          case_number: report.caseNumber,
          booking_passenger_id: report.bookingPassengerId,
          passenger_id: report.passengerId,
          flight_id: report.flightId,
          reported_by_customer_id: report.reportedByCustomerId,
          reported_by_staff_id: report.reportedByStaffId,
          tag_number: report.tagNumber,
          bag_type: report.bagType,
          colour: report.colour,
          brand: report.brand,
          description: report.description,
          photo_url: report.photoUrl,
          contact_email: report.contactEmail,
          contact_phone: report.contactPhone,
          status: report.status,
          reported_at: report.reportedAt,
          lost_at: report.lostAt,
          closed_at: report.closedAt,
          created_at: report.createdAt,
          updated_at: report.updatedAt,
        },
      })

      return toReport(row)
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined

      // Handle concurrent attempts to report the same live baggage tag.
      if (code === 'P2002' && report.tagNumber) {
        if (await this.findLiveByTag(report.tagNumber)) {
          throw new BaggageError(BAGGAGE_ERROR_CODES.REPORT_EXISTS, 'A live report already exists for this baggage tag')
        }
      }

      if (code === 'P2003') {
        throw new BaggageError(BAGGAGE_ERROR_CODES.INVALID_REPORT, 'Related booking, passenger, or flight does not exist')
      }

      throw error
    }
  }

  async findByCaseNumber(caseNumber: string): Promise<LostBagReport | null> {
    const row = await this.db.lost_bag_report.findUnique({
      where: { case_number: caseNumber },
    })

    return row ? toReport(row) : null
  }

  async findLiveByTag(tagNumber: string): Promise<LostBagReport | null> {
    const row = await this.db.lost_bag_report.findFirst({
      where: {
        tag_number: tagNumber,
        status: { in: LIVE_STATUSES },
      },
    })

    return row ? toReport(row) : null
  }

  async listByBookingPassengerId(bookingPassengerId: string): Promise<LostBagReport[]> {
    const rows = await this.db.lost_bag_report.findMany({
      where: { booking_passenger_id: bookingPassengerId },
      orderBy: { reported_at: 'desc' },
    })

    return rows.map(toReport)
  }

  async cancelIfNotDispatched(reportId: string, bookingPassengerId: string, closedAt: Date): Promise<LostBagReport | null> {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM lost_bag_report
        WHERE id = ${reportId}::uuid
          AND booking_passenger_id = ${bookingPassengerId}::uuid
        FOR UPDATE
        `

      if (locked.length === 0) return null
      const report = await tx.lost_bag_report.findFirst({
        where: {
          id: reportId,
          booking_passenger_id: bookingPassengerId,
          status: { in: ['open', 'matched', 'lost'] },
        },
        include: {
          bag_delivery: true,
          bag_match: {
            where: { status: 'confirmed' },
            select: { found_bag_id: true, found_bag: { select: { status: true } } },
          },
        },
      })

      if (!report) return null

      // Once delivery has begun, the passenger cannot cancel.
      if (report.bag_delivery && !['waiting_choice', 'preparing'].includes(report.bag_delivery.status)) {
        return null
      }

      // The delivery flow records matched-bag dispatch in both delivery and found-bag state.
      // Do not order append-only movement history by occurred_at: it uses the rewindable simulation clock.
      if (report.bag_match.some((match) => ['sent', 'delivered'].includes(match.found_bag.status))) return null

      const updated = await tx.lost_bag_report.update({
        where: { id: report.id },
        data: {
          status: 'cancelled',
          closed_at: closedAt,
          updated_at: closedAt,
        },
      })

      return toReport(updated)
    })
  }
}
