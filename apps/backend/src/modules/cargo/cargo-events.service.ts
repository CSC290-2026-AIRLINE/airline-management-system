import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
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
}

const NOTICE_TEMPLATES: Record<string, { title: string; message: (ref: string) => string }> = {
  confirmed: { title: 'Booking confirmed', message: (ref) => `Your cargo booking ${ref} has been confirmed and an AWB issued.` },
  expired: { title: 'Hold expired', message: (ref) => `The hold on cargo booking ${ref} has expired.` },
  accepted: { title: 'Shipment accepted', message: (ref) => `Cargo shipment ${ref} has been accepted at the terminal.` },
  rejected: { title: 'Shipment rejected', message: (ref) => `Cargo shipment ${ref} has been rejected at the terminal.` },
  loaded: { title: 'Shipment loaded', message: (ref) => `Cargo shipment ${ref} has been loaded onto the aircraft.` },
  departed: { title: 'Shipment departed', message: (ref) => `Cargo shipment ${ref} has departed.` },
  arrived: { title: 'Shipment arrived', message: (ref) => `Cargo shipment ${ref} has arrived at the destination.` },
  delivered: { title: 'Shipment delivered', message: (ref) => `Cargo shipment ${ref} has been delivered.` },
  cancelled: { title: 'Booking cancelled', message: (ref) => `Cargo booking ${ref} has been cancelled.` },
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

    const rows = await tx.$queryRaw<{ id: string; booking_ref: string; flight_id: string }[]>`
      SELECT id, booking_ref, flight_id
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
            message: template.message(booking.booking_ref),
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
      }
      throw err
    }
  }
}
