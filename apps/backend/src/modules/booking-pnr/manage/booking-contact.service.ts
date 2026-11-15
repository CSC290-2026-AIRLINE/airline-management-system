import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BookingError } from '../common/booking-error'
import { BOOKING_CLOCK, BOOKING_READ_PORT, type BookingClock, type BookingReadPort, type BookingViewer } from '../contracts'
import type { UpdateBookingContactDto } from './dto/update-booking-contact.dto'

export interface BookingContact {
  contactEmail: string
  contactPhone: string | null
}

/**
 * Changes the contact details of a booking that is still on hold.
 *
 * The contact details are written when the hold is created, so a customer who typed the wrong email has no other way to
 * correct it before paying. They are not part of the fare quote, so changing them never moves the price, and the hold
 * keeps the time it had.
 */
@Injectable()
export class BookingContactService {
  constructor(
    private readonly db: DbService,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
    @Inject(BOOKING_READ_PORT) private readonly bookings: BookingReadPort,
  ) {}

  /** Route helper: a staff token changes any booking; a customer token changes only its own. */
  async updateContactForUser(reference: string, input: UpdateBookingContactDto, userId: string): Promise<BookingContact> {
    const viewer = await this.viewerFor(userId)
    if (!viewer) throw new BookingError('INVALID_BOOKING_STATE', 'Booking not found', 404)
    const booking = await this.bookings.getBookingDetail(reference, viewer)
    if (!booking) throw new BookingError('INVALID_BOOKING_STATE', 'Booking not found', 404)
    return this.updateContact(reference, input)
  }

  async updateContact(reference: string, input: UpdateBookingContactDto): Promise<BookingContact> {
    const now = this.clock.now()
    const contact: BookingContact = { contactEmail: input.contactEmail, contactPhone: input.contactPhone ?? null }
    // The booking row is locked first, the same order the confirmation and cancellation paths use.
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; hold_expires_at: Date }>>`
        SELECT id, status, hold_expires_at FROM booking WHERE booking_reference = ${reference} FOR UPDATE
      `
      const booking = rows[0]
      if (!booking) throw new BookingError('INVALID_BOOKING_STATE', 'Booking not found', 404)
      if (booking.status !== 'held')
        throw new BookingError('BOOKING_CLOSED', 'This booking is no longer on hold, so its contact details can no longer be changed.', 409)
      if (booking.hold_expires_at <= now)
        throw new BookingError('BOOKING_CLOSED', 'The hold has expired, so the contact details can no longer be changed.', 409)

      await tx.booking.update({
        where: { id: booking.id },
        data: { contact_email: contact.contactEmail, contact_phone: contact.contactPhone, updated_at: now },
      })
      return contact
    })
  }

  /** Who the caller is: a customer with a profile, or an active staff member. Never taken from the request body. */
  private async viewerFor(userId: string): Promise<BookingViewer | null> {
    const [customer, staff] = await Promise.all([
      this.db.customer.findFirst({
        where: { user_id: userId, deleted_at: null, user: { type: 'customer', deleted_at: null, disabled_at: null } },
        select: { id: true },
      }),
      this.db.staff.findFirst({
        where: { user_id: userId, deleted_at: null, user: { type: 'staff', deleted_at: null, disabled_at: null } },
        select: { id: true },
      }),
    ])
    if (staff) return { staff: true }
    if (customer) return { customerId: customer.id }
    return null
  }
}
