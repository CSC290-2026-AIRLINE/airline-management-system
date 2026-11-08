import type { BookingPassenger, CustomerRef } from './providers/providers'
import type { CheckInRecord } from './store/checkin-store'

/** Who is calling: a customer (staffId null) or a staff member. */
export interface Actor {
  userId: string
  staffId: string | null
}

/**
 * Who may read a check-in. The customer owns it through the booking (the customer of the booking) or through the
 * passenger row of their own customer account. Staff may read every check-in.
 */
export function canCustomerAccess(
  record: CheckInRecord,
  actor: Actor,
  booking: BookingPassenger | null,
  customer: CustomerRef | null,
): boolean {
  if (actor.staffId !== null) return true
  if (booking?.customerUserId && booking.customerUserId === actor.userId) return true
  if (customer?.passengerId && customer.passengerId === record.passenger_id) return true
  return false
}
