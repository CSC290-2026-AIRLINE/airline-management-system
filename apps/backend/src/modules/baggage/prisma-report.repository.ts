import { Injectable } from '@nestjs/common'
import type { lost_bag_report } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { BAGGAGE_ERROR_CODES, BaggageError } from './common/baggage.errors'
import type { DeliveryChoiceSnapshot, ReportRepository } from './common/report.ports'
import type { LostBagReport } from './common/report.types'
import type { PassengerCaseSummary, PassengerCaseTimelineEvent } from './common/passenger-case-summary.types'
import type { BagType, BagColour, ReportStatus } from './common/baggage.constants'
import type { DeliveryStatus, DeliveryType } from './common/bag-delivery.types'

const LIVE_STATUSES = ['open', 'matched', 'delivering', 'lost']
const DELIVERY_TYPES: readonly DeliveryType[] = ['home', 'hotel', 'other_address', 'airport_pickup']

function isDeliveryType(value: unknown): value is DeliveryType {
  return typeof value === 'string' && DELIVERY_TYPES.includes(value as DeliveryType)
}

function auditConfirmsMatch(value: unknown, foundBagId: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const after = value as { status?: unknown; foundBagId?: unknown }
  return after.status === 'confirmed' && after.foundBagId === foundBagId
}

function toRecoveryLocationEvent(location: {
  action: string
  airport_code: string
  to_airport: string | null
  occurred_at: Date
}): PassengerCaseTimelineEvent | null {
  if (location.action === 'sent' && location.to_airport) {
    return { type: 'bag_sent', occurredAt: location.occurred_at, fromAirport: location.airport_code, toAirport: location.to_airport }
  }
  if (location.action === 'arrived') return { type: 'bag_arrived', occurredAt: location.occurred_at, airport: location.airport_code }
  if (location.action === 'out_for_delivery') {
    return { type: 'out_for_delivery', occurredAt: location.occurred_at, airport: location.airport_code }
  }
  if (location.action === 'delivered') return { type: 'bag_delivered', occurredAt: location.occurred_at }
  return null
}

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

  async findPassengerCaseSummaryByReportId(reportId: string): Promise<PassengerCaseSummary | null> {
    const row = await this.db.lost_bag_report.findUnique({
      where: { id: reportId },
      select: {
        case_number: true,
        status: true,
        bag_type: true,
        colour: true,
        brand: true,
        tag_number: true,
        description: true,
        reported_at: true,
        lost_at: true,
        closed_at: true,
        created_at: true,
        passenger: { select: { first_name: true, last_name: true } },
        flight: {
          select: {
            flight_number: true,
            service_date: true,
            route: { select: { origin: true, destination: true } },
          },
        },
        bag_match: {
          where: { status: 'confirmed' },
          select: { id: true, found_bag_id: true, reviewed_at: true, updated_at: true },
          take: 1,
        },
        bag_delivery: {
          select: {
            id: true,
            delivery_type: true,
            address: true,
            pickup_airport: true,
            status: true,
            delivered_at: true,
            updated_at: true,
          },
        },
      },
    })

    if (!row) return null

    const confirmedMatch = row.bag_match[0]
    const delivery = row.bag_delivery
    const matchAudit = confirmedMatch
      ? await this.db.audit_log.findFirst({
          where: {
            source_feature: '10',
            entity_type: 'bag_match',
            entity_id: confirmedMatch.id,
            action: 'status_change',
            is_sensitive: false,
          },
          orderBy: { seq: 'desc' },
          select: { recorded_at: true, seq: true, after: true },
        })
      : null
    const orderedEvents: { event: PassengerCaseTimelineEvent; recordedAt: Date; sequence: bigint }[] = [
      {
        event: { type: 'report_received', occurredAt: row.reported_at },
        recordedAt: row.created_at,
        sequence: 0n,
      },
    ]

    if (row.lost_at) {
      orderedEvents.push({
        event: { type: 'case_marked_lost', occurredAt: row.lost_at },
        recordedAt: row.lost_at,
        sequence: 0n,
      })
    }

    if (confirmedMatch?.reviewed_at) {
      orderedEvents.push({
        event: { type: 'match_confirmed', occurredAt: confirmedMatch.reviewed_at },
        recordedAt: matchAudit?.recorded_at ?? confirmedMatch.updated_at,
        sequence: matchAudit?.seq ?? 0n,
      })
    }

    if (delivery && confirmedMatch) {
      const choiceAudits = await this.db.audit_log.findMany({
        where: {
          source_feature: '10',
          entity_type: 'bag_delivery',
          entity_id: delivery.id,
          action: 'update',
          is_sensitive: false,
        },
        orderBy: { seq: 'asc' },
        select: { occurred_at: true, recorded_at: true, seq: true, after: true },
      })

      for (const audit of choiceAudits) {
        const after = audit.after
        if (!after || typeof after !== 'object' || Array.isArray(after)) continue
        const details = after as { deliveryType?: unknown; chosenBy?: unknown }
        if (!isDeliveryType(details.deliveryType) || (details.chosenBy !== 'passenger' && details.chosenBy !== 'staff')) continue

        orderedEvents.push({
          event: {
            type: 'choice_saved',
            occurredAt: audit.occurred_at,
            deliveryType: details.deliveryType,
            chosenBy: details.chosenBy,
          },
          recordedAt: audit.recorded_at,
          sequence: audit.seq,
        })
      }
    }

    let locationEvents: {
      action: string
      airport_code: string
      to_airport: string | null
      occurred_at: Date
      created_at: Date
    }[] = []

    if (confirmedMatch && matchAudit && auditConfirmsMatch(matchAudit.after, confirmedMatch.found_bag_id)) {
      locationEvents = await this.db.bag_location_event.findMany({
        where: {
          found_bag_id: confirmedMatch.found_bag_id,
          created_at: { gt: matchAudit.recorded_at },
          action: { in: ['sent', 'arrived', 'out_for_delivery', 'delivered'] },
        },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        select: { action: true, airport_code: true, to_airport: true, occurred_at: true, created_at: true },
      })

      let recoverySendPending = false
      for (const location of locationEvents) {
        if (location.action === 'sent') {
          const sent = toRecoveryLocationEvent(location)
          recoverySendPending = sent?.type === 'bag_sent'
          if (recoverySendPending && sent) orderedEvents.push({ event: sent, recordedAt: location.created_at, sequence: 0n })
        } else if (location.action === 'arrived') {
          const arrived = recoverySendPending ? toRecoveryLocationEvent(location) : null
          if (arrived?.type === 'bag_arrived') orderedEvents.push({ event: arrived, recordedAt: location.created_at, sequence: 0n })
          recoverySendPending = false
        } else if (location.action === 'out_for_delivery') {
          const outForDelivery = toRecoveryLocationEvent(location)
          if (outForDelivery?.type === 'out_for_delivery') {
            orderedEvents.push({ event: outForDelivery, recordedAt: location.created_at, sequence: 0n })
          }
          recoverySendPending = false
        }
      }
    }

    if (confirmedMatch && delivery?.status === 'delivered' && delivery.delivered_at) {
      const deliveredLocation = locationEvents.find((event) => event.action === 'delivered')
      orderedEvents.push({
        event: { type: 'bag_delivered', occurredAt: delivery.delivered_at },
        recordedAt: deliveredLocation?.created_at ?? delivery.updated_at,
        sequence: 0n,
      })
    }

    if (row.closed_at) {
      orderedEvents.push({
        event: { type: 'case_closed', occurredAt: row.closed_at },
        recordedAt: row.closed_at,
        sequence: 0n,
      })
    }

    orderedEvents.sort((left, right) => {
      const byRecordTime = left.recordedAt.getTime() - right.recordedAt.getTime()
      if (byRecordTime !== 0) return byRecordTime
      if (left.sequence < right.sequence) return -1
      if (left.sequence > right.sequence) return 1
      return 0
    })

    return {
      caseNumber: row.case_number,
      status: row.status as ReportStatus,
      reportedAt: row.reported_at,
      lostAt: row.lost_at,
      closedAt: row.closed_at,
      passenger: { firstName: row.passenger.first_name, lastName: row.passenger.last_name },
      flight: {
        flightNumber: row.flight.flight_number,
        serviceDate: row.flight.service_date,
        origin: row.flight.route.origin,
        destination: row.flight.route.destination,
      },
      bag: {
        type: row.bag_type,
        colour: row.colour,
        brand: row.brand,
        tagNumber: row.tag_number,
        description: row.description,
      },
      delivery: delivery
        ? {
            deliveryType: delivery.delivery_type && isDeliveryType(delivery.delivery_type) ? delivery.delivery_type : null,
            address: delivery.delivery_type && isDeliveryType(delivery.delivery_type) ? delivery.address : null,
            pickupAirport: delivery.delivery_type === 'airport_pickup' ? delivery.pickup_airport : null,
            status: delivery.status as DeliveryStatus,
          }
        : null,
      timeline: orderedEvents.map(({ event }) => event),
    }
  }

  async findDeliveryIdByReportId(reportId: string): Promise<string | null> {
    const delivery = await this.db.bag_delivery.findUnique({
      where: { report_id: reportId },
      select: { id: true },
    })

    return delivery?.id ?? null
  }

  async findDeliveryChoiceByReportId(reportId: string): Promise<DeliveryChoiceSnapshot | null> {
    const delivery = await this.db.bag_delivery.findUnique({
      where: { report_id: reportId },
      select: { delivery_type: true, address: true, pickup_airport: true, status: true },
    })

    if (!delivery) return null

    return {
      deliveryType: delivery.delivery_type as DeliveryType | null,
      address: delivery.address,
      pickupAirport: delivery.pickup_airport,
      status: delivery.status as DeliveryStatus,
    }
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
