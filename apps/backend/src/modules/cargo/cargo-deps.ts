import { HttpException, HttpStatus } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { computeCapacity } from '@backend/modules/aircraft-management/seat-map'
import type { SeatLayout } from '@backend/modules/aircraft-management/dto/layout.dto'
import { simNow } from '@backend/modules/pricing/fare-quote/sim-clock'

type PrismaLike = Pick<DbService, 'aircraft' | 'flight_setting' | 'refund' | 'seat_inventory'>

export interface AircraftCapacity {
  holdLimitKg: number
  sellableSeats: number
}

/** Used only for an aircraft type whose stored layout is not in Feature 9's cabin format, so it has no countable seats. */
const FALLBACK_SELLABLE_SEATS = 180
const FALLBACK_HOLD_LIMIT_KG = 4000

/**
 * The aircraft's hold weight limit and sellable seats, from Feature 9's aircraft type: the limit is a column, and the sellable
 * seats are counted from the cabin layout with Feature 9's own seat-map calculation (blocked seats are not sellable).
 */
export async function getAircraftCapacity(db: PrismaLike, aircraftId: string): Promise<AircraftCapacity> {
  const aircraft = await db.aircraft.findUnique({
    where: { id: aircraftId },
    select: { aircraft_type: { select: { hold_weight_limit_kg: true, layout: true } } },
  })

  if (!aircraft) {
    return { holdLimitKg: FALLBACK_HOLD_LIMIT_KG, sellableSeats: FALLBACK_SELLABLE_SEATS }
  }

  const sellable = computeCapacity(aircraft.aircraft_type.layout as SeatLayout).total_sellable
  return {
    holdLimitKg: aircraft.aircraft_type.hold_weight_limit_kg,
    sellableSeats: sellable > 0 ? sellable : FALLBACK_SELLABLE_SEATS,
  }
}

/** Feature 3b's seats held or sold on the flight, over every cabin. A lap infant takes no seat, so it is not counted there. */
export async function seatsTakenOnFlight(db: PrismaLike, flightId: string): Promise<number> {
  const totals = await db.seat_inventory.aggregate({
    where: { flight_id: flightId },
    _sum: { held_count: true, sold_count: true },
  })
  return (totals._sum.held_count ?? 0) + (totals._sum.sold_count ?? 0)
}

/**
 * Feature 5b did not complete the refund, so nothing was recorded and the call can be retried. 502 (spec: REFUND_FAILED), since the
 * failure is in the service we called, not in ours.
 */
export function refundFailed(what: 'cancellation' | 'rejection', cause: unknown): HttpException {
  return new HttpException(
    {
      error: {
        code: 'REFUND_FAILED',
        message: `Refund could not be processed — ${what} was not recorded: ${cause instanceof Error ? cause.message : String(cause)}`,
      },
    },
    HttpStatus.BAD_GATEWAY,
  )
}

// MOCK: replace when Feature 5a payment/refund service is merged
const REFUND_REASON_MAP: Record<string, string> = {
  cancel: 'cargo_cancel',
  rejected: 'cargo_rejected',
  flight: 'flight_cancelled',
}

export async function refundFull(
  db: PrismaLike,
  bookingRef: string,
  paymentId: string,
  amount: number,
  reason: 'cancel' | 'rejected' | 'flight',
): Promise<{ refundId: string }> {
  const dbReason = REFUND_REASON_MAP[reason]
  const sourceKey = `cargo:${bookingRef}:${reason}`

  const existing = await db.refund.findFirst({ where: { source_key: sourceKey } })
  if (existing) return { refundId: existing.id }

  const now = simNow()
  try {
    const refund = await db.refund.create({
      data: {
        payment_id: paymentId,
        source_key: sourceKey,
        reason: dbReason,
        method: 'original',
        status: 'succeeded',
        amount,
        voucher_amount: 0,
        fee_withheld: 0,
        requested_at: now,
        completed_at: now,
      },
    })
    return { refundId: refund.id }
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
      const dup = await db.refund.findFirst({ where: { source_key: sourceKey } })
      if (dup) return { refundId: dup.id }
    }
    throw err
  }
}

// Requirements say to fall back to the reserve when baggage weight is unknown
export function loadedBaggageKg(flightId: string): number | null {
  void flightId
  return null
}

// MOCK: replace when the airline's 3-digit AWB prefix is stored (flight_setting.airline_code)
export function awbPrefix(db: PrismaLike): string {
  void db
  return '999'
}
