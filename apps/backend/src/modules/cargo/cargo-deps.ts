import type { DbService } from '@backend/db/db.service'

type PrismaLike = Pick<DbService, 'aircraft' | 'flight_setting'>

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
export async function seatsTakenOnFlight(_db: PrismaLike, _flightId: string): Promise<number> {
  return 0
}

// MOCK: replace when Feature 5a payment/refund service is merged
export async function refundFull(
  _db: PrismaLike,
  bookingRef: string,
  _paymentId: string,
  _amount: number,
  reason: 'cancel' | 'rejected' | 'flight',
): Promise<{ refundId: string }> {
  return { refundId: `mock-refund-${bookingRef}-${reason}` }
}

// Requirements say to fall back to the reserve when baggage weight is unknown
export function loadedBaggageKg(_flightId: string): null {
  return null
}

// MOCK: replace when the airline's 3-digit AWB prefix is stored (flight_setting.airline_code)
export async function awbPrefix(_db: PrismaLike): Promise<string> {
  return '999'
}
