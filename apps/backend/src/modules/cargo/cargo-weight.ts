import type { Prisma } from '@backend/db/generated/prisma/client'
import type { DbService } from '@backend/db/db.service'

/** Statuses whose weight still takes up room in the hold. */
export const COMMITTED_STATUSES: ReadonlySet<string> = new Set(['held', 'booked', 'accepted', 'loaded', 'in_transit'])
/** Statuses whose goods are physically on the aircraft. */
export const LOADED_STATUSES: ReadonlySet<string> = new Set(['loaded', 'in_transit'])

/** Select a booking's weight inputs: the declared weight plus every event, newest first. Spread into a cargo_booking select. */
export const BOOKING_WEIGHT_SELECT = {
  declared_weight_kg: true,
  cargo_shipment_event: { orderBy: { seq: 'desc' }, select: { status_after: true, measured_weight_kg: true } },
} satisfies Prisma.cargo_bookingSelect

type Numeric = number | string | Prisma.Decimal

export interface BookingWeightRow {
  declared_weight_kg: Numeric
  /** Newest first, and not cut down with `take`: the measured weight may sit on an older event. */
  cargo_shipment_event: { status_after: string; measured_weight_kg: Numeric | null }[]
}

export function latestStatus(b: BookingWeightRow): string | null {
  return b.cargo_shipment_event[0]?.status_after ?? null
}

/** The weight a booking takes up: the latest measured weight once it has been weighed, else the declared weight. */
export function bookingWeightKg(b: BookingWeightRow): number {
  const measured = b.cargo_shipment_event.find((e) => e.measured_weight_kg != null)?.measured_weight_kg
  return Number(measured ?? b.declared_weight_kg)
}

/** Total weight of the bookings whose current status is in `statuses`. */
export function sumWeightKg(bookings: BookingWeightRow[], statuses: ReadonlySet<string> = COMMITTED_STATUSES): number {
  return bookings.reduce((sum, b) => {
    const status = latestStatus(b)
    return status != null && statuses.has(status) ? sum + bookingWeightKg(b) : sum
  }, 0)
}

/** Weight already committed to a flight's hold, optionally leaving one booking out (the one being checked). */
export async function committedKgOnFlight(
  db: DbService | Prisma.TransactionClient,
  flightId: string,
  excludeBookingId?: string,
): Promise<number> {
  const bookings = await db.cargo_booking.findMany({
    where: { flight_id: flightId, ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}) },
    select: BOOKING_WEIGHT_SELECT,
  })
  return sumWeightKg(bookings)
}
