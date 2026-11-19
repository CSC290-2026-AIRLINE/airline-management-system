import type { DbService } from '@backend/db/db.service'
import { simNow } from '@backend/modules/pricing/fare-quote/sim-clock'

type PrismaLike = Pick<DbService, 'aircraft' | 'flight_setting' | 'refund'>

export interface AircraftCapacity {
  holdLimitKg: number
  sellableSeats: number
}

/**
 * Read the aircraft's hold weight limit from the real aircraft_type row.
 * Sellable seats are mocked — the layout JSON format is owned by Feature 9 and has no parser here.
 * Falls back entirely to mock values when the aircraft row is missing.
 */
export async function getAircraftCapacity(db: PrismaLike, aircraftId: string): Promise<AircraftCapacity> {
  // MOCK: replace sellableSeats with a real layout parser when Feature 9 provides one
  const MOCK_SELLABLE_SEATS = 180
  const MOCK_HOLD_LIMIT_KG = 4000

  const aircraft = await db.aircraft.findUnique({
    where: { id: aircraftId },
    select: { aircraft_type: { select: { hold_weight_limit_kg: true } } },
  })

  if (!aircraft) {
    return { holdLimitKg: MOCK_HOLD_LIMIT_KG, sellableSeats: MOCK_SELLABLE_SEATS }
  }

  return {
    holdLimitKg: aircraft.aircraft_type.hold_weight_limit_kg,
    sellableSeats: MOCK_SELLABLE_SEATS,
  }
}

// MOCK: replace when Feature 3 seat inventory service is merged
export function seatsTakenOnFlight(db: PrismaLike, flightId: string): number {
  void db
  void flightId
  return 0
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
