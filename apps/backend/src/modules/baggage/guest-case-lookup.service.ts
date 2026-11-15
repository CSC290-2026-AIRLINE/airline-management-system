import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { DeliveryStatus } from './common/bag-delivery.types'
import type { ReportStatus } from './common/baggage.constants'
import type { PassengerCaseSummary } from './common/passenger-case-summary.types'
import { normalizeGuestBookingAccess, verificationFailed } from './guest-booking-lookup.service'
import { PrismaReportRepository } from './prisma-report.repository'

const CASE_NUMBER_PATTERN = /^LB-\d{4}-\d{6}$/

/** Timeline steps a guest sees: what happened and when, without airports, delivery types or who chose what. */
export const GUEST_TIMELINE_TYPES = [
  'report_received',
  'case_marked_lost',
  'match_confirmed',
  'bag_sent',
  'out_for_delivery',
  'bag_delivered',
  'case_closed',
  'case_cancelled',
] as const

export type GuestTimelineType = (typeof GUEST_TIMELINE_TYPES)[number]

/**
 * The read-only guest case view. Built field by field from the passenger summary, so nothing new reaches a guest unless
 * it is added here: no names, contact details, delivery address or pickup airport, photo, brand, tag, description,
 * staff notes or internal ids.
 */
export interface GuestCaseSummary {
  caseNumber: string
  status: ReportStatus
  reportedAt: Date
  lostAt: Date | null
  closedAt: Date | null
  flight: { flightNumber: string; serviceDate: Date; origin: string; destination: string }
  bag: { type: string; colour: string }
  delivery: { status: DeliveryStatus } | null
  timeline: Array<{ type: GuestTimelineType; occurredAt: Date }>
}

function isGuestTimelineType(type: string): type is GuestTimelineType {
  return (GUEST_TIMELINE_TYPES as readonly string[]).includes(type)
}

export function toGuestCaseSummary(summary: PassengerCaseSummary): GuestCaseSummary {
  return {
    caseNumber: summary.caseNumber,
    status: summary.status,
    reportedAt: summary.reportedAt,
    lostAt: summary.lostAt,
    closedAt: summary.closedAt,
    flight: {
      flightNumber: summary.flight.flightNumber,
      serviceDate: summary.flight.serviceDate,
      origin: summary.flight.origin,
      destination: summary.flight.destination,
    },
    bag: { type: summary.bag.type, colour: summary.bag.colour },
    delivery: summary.delivery ? { status: summary.delivery.status } : null,
    timeline: summary.timeline.flatMap((event) =>
      isGuestTimelineType(event.type) ? [{ type: event.type, occurredAt: event.occurredAt }] : [],
    ),
  }
}

/**
 * Guest (no-account) case tracking, read only. A case opens only when the case number, the booking reference and the
 * surname all belong to that case's own bag owner: the reference of the booking the report is on, and the surname of
 * the passenger whose bag it is. Another traveller on the same booking with a different surname cannot open it, and a
 * case number alone opens nothing. Every failure is the same uniform "Booking verification failed".
 */
@Injectable()
export class GuestCaseLookupService {
  constructor(
    private readonly db: DbService,
    private readonly repository: PrismaReportRepository,
  ) {}

  async lookUp(input: unknown): Promise<GuestCaseSummary> {
    const access = normalizeGuestBookingAccess(input)
    const rawCaseNumber = input && typeof input === 'object' ? (input as Record<string, unknown>).caseNumber : undefined
    const caseNumber = typeof rawCaseNumber === 'string' ? rawCaseNumber.trim().toUpperCase() : ''
    if (!access || !CASE_NUMBER_PATTERN.test(caseNumber)) throw verificationFailed()

    const report = await this.db.lost_bag_report.findFirst({
      where: {
        case_number: caseNumber,
        // The bag owner on the report, not any traveller on the booking.
        passenger: { last_name: { equals: access.surname, mode: 'insensitive' }, deleted_at: null },
        booking_coupon: { booking_passenger: { booking: { booking_reference: access.bookingReference } } },
      },
      select: { id: true },
    })
    if (!report) throw verificationFailed()

    const summary = await this.repository.findPassengerCaseSummaryByReportId(report.id)
    if (!summary) throw verificationFailed()

    return toGuestCaseSummary(summary)
  }
}
