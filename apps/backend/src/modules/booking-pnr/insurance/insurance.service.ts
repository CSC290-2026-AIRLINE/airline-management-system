import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { BookingError } from '../common/booking-error'
import {
  CHECKOUT_PORT,
  INSURANCE_PORT,
  type CheckoutPort,
  type InsuranceOffer,
  type InsurancePolicySummary,
  type InsurancePort,
} from '../contracts'
import { DbService } from '@backend/db/db.service'
import { BookingReadService } from '../manage/booking-read.service'

/** Travel insurance on Review & Pay: the offer for a booking, and the paid add-on of the dev checkout stand-in. */
@Injectable()
export class BookingInsuranceService {
  private readonly logger = new Logger(BookingInsuranceService.name)

  constructor(
    private readonly db: DbService,
    private readonly read: BookingReadService,
    @Inject(INSURANCE_PORT) private readonly insurance: InsurancePort,
    @Inject(CHECKOUT_PORT) private readonly checkout: CheckoutPort,
  ) {}

  /** The offer for a booking the caller may read (a customer only their own; staff any). */
  async offerForUser(reference: string, userId: string): Promise<InsuranceOffer> {
    const booking = await this.read.getBookingForUser(reference, userId)
    if (!booking) throw new NotFoundException(`Booking ${reference} was not found.`)
    if (booking.status !== 'held' && booking.status !== 'confirmed') return { kind: 'none' }
    return this.insurance.offer(booking.bookingId)
  }

  /** Refuses an add-on the booker's tier does not sell, before anything is charged or confirmed. */
  async assertAddable(reference: string): Promise<void> {
    const booking = await this.db.booking.findUnique({ where: { booking_reference: reference }, select: { id: true } })
    if (!booking) throw new NotFoundException(`Booking ${reference} was not found.`)
    const offer = await this.insurance.offer(booking.id)
    if (offer.kind !== 'member_price') {
      throw new BookingError('INVALID_BOOKING_STATE', 'Travel insurance cannot be added to this booking.', 422)
    }
  }

  /**
   * After the dev checkout confirmed a booking: charge the add-on when the customer chose it and the tier offers it at
   * a member price, then ask feature 11 for the policy. Feature 5a will capture the add-on with the fare instead.
   */
  async settleAfterConfirm(bookingId: string, addInsurance: boolean): Promise<InsurancePolicySummary | null> {
    const offer = await this.insurance.offer(bookingId)
    if (addInsurance && offer.kind !== 'member_price') {
      throw new BookingError('INVALID_BOOKING_STATE', 'Travel insurance cannot be added to this booking.', 422)
    }
    if (addInsurance && offer.kind === 'member_price') {
      await this.checkout.charge({
        bookingId,
        amount: offer.price,
        currency: offer.currency,
        idempotencyKey: `insurance:${bookingId}`,
        purchaseRef: `insurance:${bookingId}`,
        line: {
          lineType: 'insurance',
          sourceRef: `insurance:${bookingId}`,
          description: `Travel insurance (${offer.tierName} member price)`,
        },
      })
    }
    try {
      return await this.insurance.issue(bookingId)
    } catch (error) {
      this.logger.error(`Could not issue travel insurance for booking ${bookingId}`, error as Error)
      return null
    }
  }
}
