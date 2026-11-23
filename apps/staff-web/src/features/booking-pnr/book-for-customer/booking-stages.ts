/** One stage of the staff booking flow. */
export interface StaffBookingStage {
  /** The short name under the marker. */
  label: string
  /** The one-line explanation under the name. */
  hint: string
}

/** The four stages a staff booking goes through, in order. */
export const STAFF_BOOKING_STAGES: readonly StaffBookingStage[] = [
  { label: 'Flights', hint: 'Flight and fare' },
  { label: 'Passengers', hint: 'Traveller details' },
  { label: 'Seats', hint: 'Seat choices' },
  { label: 'Booking held', hint: 'Reference and expiry' },
]
