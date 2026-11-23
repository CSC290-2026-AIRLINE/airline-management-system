import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { simNow } from '@backend/modules/pricing/fare-quote/sim-clock'

export interface AppendEventInput {
  bookingId: string
  eventType: string
  actorType: string
  staffId?: string
  note?: string
  measuredWeightKg?: number
  measuredVolumeM3?: number
  measuredChargeableKg?: number
  refundId?: string
  airportCode?: string
  /** The Feature 2 flight_event this entry reacts to; a unique index makes a repeat of it a no-op. */
  flightEventId?: string
  /** Picks the row when the transition table has two for the same move (flight_changed: booked or accepted). */
  statusAfter?: string
}

interface NoticeContext {
  ref: string
  /** Full refund text, e.g. "USD 348.40", set when the event carries a refund. */
  refund?: string
  airport?: string
}

const NOTICE_TEMPLATES: Record<string, { title: string; message: (ctx: NoticeContext) => string }> = {
  confirmed: { title: 'Booking confirmed', message: (c) => `Your cargo booking ${c.ref} has been confirmed and an AWB issued.` },
  expired: {
    title: 'Hold expired',
    message: (c) => `The hold on cargo booking ${c.ref} has expired. The weight was released and nothing was charged.`,
  },
  accepted: { title: 'Shipment accepted', message: (c) => `Cargo shipment ${c.ref} has been accepted at the terminal.` },
  rejected: {
    title: 'Shipment rejected',
    message: (c) =>
      `Cargo shipment ${c.ref} has been rejected at the terminal.${c.refund ? ` A full refund of ${c.refund} was issued.` : ''}`,
  },
  loaded: { title: 'Shipment loaded', message: (c) => `Cargo shipment ${c.ref} has been loaded onto the aircraft.` },
  departed: { title: 'Shipment departed', message: (c) => `Cargo shipment ${c.ref} has been sent and is in transit to the destination.` },
  arrived: { title: 'Shipment arrived', message: (c) => `Cargo shipment ${c.ref} has arrived at the destination.` },
  delivered: { title: 'Shipment delivered', message: (c) => `Cargo shipment ${c.ref} has been delivered.` },
  cancelled: {
    title: 'Booking cancelled',
    message: (c) => `Cargo booking ${c.ref} has been cancelled.${c.refund ? ` A full refund of ${c.refund} was issued.` : ''}`,
  },
  offloaded: { title: 'Shipment missed its flight', message: (c) => `Cargo shipment ${c.ref} missed its flight and will be rebooked.` },
  flight_cancelled: {
    title: 'Flight cancelled',
    message: (c) => `The flight for cargo shipment ${c.ref} was cancelled. Staff will move the cargo or refund it.`,
  },
  diverted: {
    title: 'Flight diverted',
    message: (c) => `The flight for cargo shipment ${c.ref} was diverted${c.airport ? ` to ${c.airport}` : ''}.`,
  },
  flight_changed: { title: 'Shipment moved to another flight', message: (c) => `Cargo shipment ${c.ref} was moved to another flight.` },
}

@Injectable()
export class CargoEventsService {
  constructor(private readonly db: DbService) {}

  async currentStatus(bookingId: string): Promise<string | null> {
    const latest = await this.db.cargo_shipment_event.findFirst({
      where: { cargo_booking_id: bookingId },
      orderBy: { seq: 'desc' },
      select: { status_after: true },
    })
    return latest?.status_after ?? null
  }

  async appendEvent(tx: Prisma.TransactionClient, input: AppendEventInput) {
    const now = simNow()

    const rows = await tx.$queryRaw<{ id: string; booking_ref: string; flight_id: string; quoted_charge: string; currency: string }[]>`
      SELECT id, booking_ref, flight_id, quoted_charge::text AS quoted_charge, currency
      FROM cargo_booking
      WHERE id = ${input.bookingId}::uuid
      FOR UPDATE
    `
    if (rows.length === 0) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Booking not found' } })
    }
    const booking = rows[0]

    const latestEvent = await tx.cargo_shipment_event.findFirst({
      where: { cargo_booking_id: input.bookingId },
      orderBy: { seq: 'desc' },
      select: { id: true, status_after: true },
    })

    const statusBefore = latestEvent?.status_after ?? null

    let statusAfter: string

    if (statusBefore !== null) {
      const transition = await tx.cargo_status_transition.findFirst({
        where: {
          status_before: statusBefore,
          event_type: input.eventType,
          actor_type: input.actorType,
          ...(input.statusAfter ? { status_after: input.statusAfter } : {}),
        },
      })
      if (!transition) {
        throw new ConflictException({
          error: {
            code: 'INVALID_TRANSITION',
            message: `Cannot apply '${input.eventType}' (${input.actorType}) to a booking in '${statusBefore}' status`,
          },
        })
      }
      statusAfter = transition.status_after
    } else {
      statusAfter = input.eventType
    }

    try {
      const event = await tx.cargo_shipment_event.create({
        data: {
          cargo_booking_id: input.bookingId,
          previous_event_id: latestEvent?.id ?? null,
          status_before: statusBefore,
          event_type: input.eventType,
          status_after: statusAfter,
          flight_id: booking.flight_id,
          airport_code: input.airportCode ?? null,
          note: input.note ?? null,
          actor_type: input.actorType,
          recorded_by_staff_id: input.staffId ?? null,
          refund_id: input.refundId ?? null,
          flight_event_id: input.flightEventId ?? null,
          measured_weight_kg: input.measuredWeightKg ?? null,
          measured_volume_m3: input.measuredVolumeM3 ?? null,
          measured_chargeable_kg: input.measuredChargeableKg ?? null,
          occurred_at: now,
        },
      })

      const template = NOTICE_TEMPLATES[input.eventType]
      if (template) {
        await tx.cargo_notice.create({
          data: {
            cargo_booking_id: input.bookingId,
            cargo_shipment_event_id: event.id,
            title: template.title,
            message: template.message({
              ref: booking.booking_ref,
              refund: input.refundId ? `${booking.currency} ${Number(booking.quoted_charge).toFixed(2)}` : undefined,
              airport: input.airportCode,
            }),
            notified_at: now,
          },
        })
      }

      return event
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err) {
        const code = (err as { code: string }).code
        if (code === 'P2002' || code === 'P2003') {
          throw new ConflictException({
            error: { code: 'INVALID_TRANSITION', message: 'Transition rejected by database constraint' },
          })
        }
        if (code === '23514' || code === 'P2004') {
          throw new BadRequestException({
            error: { code: 'CONSTRAINT_VIOLATION', message: 'Event data violates a database check constraint' },
          })
        }
      }
      throw err
    }
  }
}
