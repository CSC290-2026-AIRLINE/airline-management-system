// Mirror of Feature 6's provider types (PR #28: modules/checkin-boarding/providers/providers.ts and api-types.ts).
// PR #28 is not merged into dev, so Feature 3 cannot import from Feature 6's folder yet. Copy, don't change: when PR #28
// merges, delete this file and import the same names from Feature 6's module instead.

export type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
export type SeatType = 'standard' | 'front' | 'exit' | 'business'
export type SeatStatus = 'free' | 'taken' | 'held' | 'blocked' | 'mine'

export interface SeatMapSeat {
  code: string
  row: number
  letter: string
  cabin: Cabin
  type: SeatType
  status: SeatStatus
  fee: number
}

export interface SeatMap {
  flightId: string
  rows: Array<{ row: number; exitRow: boolean; seats: SeatMapSeat[] }>
}

export interface SeatLock {
  id: string
  flightId: string
  seatCode: string
  expiresAt: string
  fee: number
}

/** Feature 3 owns bookings; F6 only needs the passenger behind a PNR. */
export interface BookingPassenger {
  bookingPassengerId: string
  pnr: string
  paid: boolean
  flightId: string
  passengerId: string
  firstName: string
  lastName: string
  cabin: Cabin
  fareClass: string
  specialAssistance: string[]
  isPolice: boolean
}

/** Implemented by Feature 3 in C12 (providers/booking-provider.adapter.ts). */
export interface BookingProvider {
  findByPnrAndLastName(pnr: string, lastName: string): Promise<BookingPassenger[]>
  byBookingPassengerId(id: string): Promise<BookingPassenger | null>
  listByFlight(flightId: string): Promise<BookingPassenger[]>
}

/** Implemented by Feature 3 in C4. Feature 3 owns the seat map and the five minute hold. */
export interface SeatProvider {
  seatMap(flightId: string, viewer: { bookingPassengerId: string | null; cabin: Cabin | null }): Promise<SeatMap>
  hold(flightId: string, seatCode: string, bookingPassengerId: string, ttlMs: number): Promise<SeatLock>
  release(lockId: string): Promise<void>
  confirm(lockId: string): Promise<{ seatCode: string; type: SeatType }>
  assigned(bookingPassengerId: string): Promise<{ seatCode: string; type: SeatType } | null>
  assignAnyStandard(
    flightId: string,
    bookingPassengerId: string,
    opts: { avoidExitRow: boolean },
  ): Promise<{ seatCode: string; type: SeatType }>
  releaseAssigned(bookingPassengerId: string): Promise<void>
}
