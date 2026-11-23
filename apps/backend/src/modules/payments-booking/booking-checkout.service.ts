import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { APP_ORIGINS } from '@backend/auth/auth.constants'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { ConfirmService } from '@backend/modules/booking-pnr/confirm/confirm.service'
import { BookingInsuranceService } from '@backend/modules/booking-pnr/insurance/insurance.service'
import { ReleaseService } from '@backend/modules/booking-pnr/confirm/release.service'
import { PaymentsCheckoutService, type CreatePaymentInput } from '@backend/modules/payments-checkout/payments-checkout.service'
import type { PaymentRecord } from '@backend/modules/payments-checkout/payment.types'
import { PaymentErrorCode, paymentFailure } from '@backend/modules/payments-crew-pay/payments.errors'
import { storedCode } from '@backend/modules/payments-refunds/prisma-refund.repository'
import type { CheckoutDto, CheckoutResultDto } from './dto/checkout.dto'

/** Feature 3's answers that mean "not this sale": the payment is voided, nobody is charged. */
const REFUSALS = new Set([404, 409, 422])

function statusOf(error: unknown): number | null {
  const candidate = error as { status?: unknown; getStatus?: () => number }
  if (typeof candidate?.status === 'number') return candidate.status
  return typeof candidate?.getStatus === 'function' ? candidate.getStatus() : null
}

/**
 * The checkout of a flight booking (source feature 3), between Feature 3 and Feature 5a.
 *
 * It reads the held booking (status, payment type, hold end, and the coupons with their `price_total`), writes the
 * payment with one line per coupon and never prices anything itself, and hands the customer to the provider's page. It
 * also registers Feature 3's `confirmBooking` as the seller's answer: 5a asks it once the card is authorised, captures on
 * a yes, and voids on a refusal (seats gone, hold lapsed, flight no longer for sale).
 */
@Injectable()
export class BookingCheckoutService {
  private readonly logger = new Logger(BookingCheckoutService.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
    private readonly payments: PaymentsCheckoutService,
    private readonly confirm: ConfirmService,
    private readonly release: ReleaseService,
    private readonly insurance: BookingInsuranceService,
  ) {
    this.payments.registerSellerConfirmation(3, (payment) => this.sellerConfirms(payment))
    this.payments.registerSellerRelease(3, (payment) => this.sellerReleases(payment))
    this.payments.registerSellerCaptured(3, (payment) => this.issueInsurance(payment))
  }

  /** The signed-in customer pays for their own held booking. */
  async checkout(userId: string, idempotencyKey: string | undefined, dto: CheckoutDto): Promise<CheckoutResultDto> {
    const customer = await this.db.customer.findFirst({ where: { user_id: userId, deleted_at: null }, select: { id: true } })
    if (!customer) throw new ForbiddenException(paymentFailure(PaymentErrorCode.CUSTOMER_NOT_FOUND, 'No customer account for this sign-in'))
    return this.checkoutFor(customer.id, userId, idempotencyKey, dto)
  }

  /**
   * A staff member starts the checkout of a booking they made for a customer. The payer is the booking's customer, so the
   * payment, the hosted page and the receipt are the customer's, exactly as if they had paid themselves.
   */
  async staffCheckout(idempotencyKey: string | undefined, dto: CheckoutDto): Promise<CheckoutResultDto> {
    if (dto.cargo_booking_id) {
      const cargo = await this.db.cargo_booking.findUnique({
        where: { id: dto.cargo_booking_id },
        select: { customer_id: true, customer: { select: { user_id: true } } },
      })
      if (!cargo) throw new NotFoundException(paymentFailure(PaymentErrorCode.CARGO_NOT_PAYABLE, 'Cargo booking not found'))
      return this.checkoutFor(cargo.customer_id, cargo.customer.user_id, idempotencyKey, dto)
    }
    const reference = dto.booking_reference ?? ''
    const booking = await this.db.booking.findUnique({
      where: { booking_reference: reference.toUpperCase() },
      select: { customer_id: true, customer: { select: { user_id: true } } },
    })
    if (!booking) throw new NotFoundException(paymentFailure(PaymentErrorCode.BOOKING_NOT_FOUND, `Booking ${reference} not found`))
    return this.checkoutFor(booking.customer_id, booking.customer.user_id, idempotencyKey, dto)
  }

  private async checkoutFor(
    customerId: string,
    userId: string,
    idempotencyKey: string | undefined,
    dto: CheckoutDto,
  ): Promise<CheckoutResultDto> {
    if (!idempotencyKey?.trim()) {
      throw new UnprocessableEntityException(
        paymentFailure(PaymentErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'An Idempotency-Key header is required'),
      )
    }
    const key = idempotencyKey.trim().slice(0, 120)
    const customer = { id: customerId }

    // The same key from the same customer is the same checkout, whatever happened to the booking since.
    const replay = await this.payments.findPaymentByKey(customer.id, key)
    if (replay) return this.proceed(userId, replay)

    if (dto.cargo_booking_id) return this.cargoCheckout(customer.id, userId, key, dto)
    if (dto.payment_id) return this.payExisting(customer.id, userId, dto.payment_id)
    const reference = dto.booking_reference ?? ''

    const booking = await this.db.booking.findUnique({
      where: { booking_reference: reference.toUpperCase() },
      select: {
        id: true,
        customer_id: true,
        status: true,
        payment_type: true,
        currency: true,
        hold_expires_at: true,
      },
    })
    // Someone else's booking answers the same as one that does not exist.
    if (!booking || booking.customer_id !== customer.id) {
      throw new NotFoundException(paymentFailure(PaymentErrorCode.BOOKING_NOT_FOUND, `Booking ${reference} not found`))
    }
    if (booking.status !== 'held') {
      throw new ConflictException(
        paymentFailure(PaymentErrorCode.PAYMENT_NOT_PAYABLE, `Booking ${reference} is ${booking.status}, not held`, {
          status: booking.status,
        }),
      )
    }

    const coupons = await this.db.booking_coupon.findMany({
      where: { booking_id: booking.id },
      select: { id: true, price_total: true },
      orderBy: { created_at: 'asc' },
    })
    const lineType: 'fare' | 'award_fee' = booking.payment_type === 'miles' ? 'award_fee' : 'fare'
    const lines: CreatePaymentInput['lines'] = coupons
      .filter((coupon) => Number(coupon.price_total) > 0)
      .map((coupon) => ({
        line_type: lineType,
        description: lineType === 'award_fee' ? 'Taxes and carrier charges' : 'Fare',
        amount: Number(coupon.price_total),
        booking_coupon_id: coupon.id,
      }))
    // Travel insurance at the member price is paid with the fare, as its own line (feature 11 reads `insurance:<booking id>`).
    if (dto.add_insurance) {
      const offer = await this.insurance.offerForUser(reference, userId)
      if (offer.kind !== 'member_price') {
        throw new UnprocessableEntityException(
          paymentFailure(PaymentErrorCode.PAYMENT_NOT_PAYABLE, 'Travel insurance cannot be added to this booking'),
        )
      }
      lines.push({
        line_type: 'insurance',
        description: `Travel insurance (${offer.tierName} member price)`,
        amount: offer.price,
        source_ref: `insurance:${booking.id}`,
      })
    }
    const total = Math.round(lines.reduce((sum, line) => sum + line.amount * 100, 0)) / 100
    // Only a miles booking with no taxes due may be paid with nothing: a cash booking worth nothing is a mistake.
    if (total === 0 && booking.payment_type !== 'miles') {
      throw new ConflictException(paymentFailure(PaymentErrorCode.PAYMENT_NOT_PAYABLE, 'There is nothing to pay on this booking'))
    }

    const voucher = dto.voucher_code ? await this.reserveVoucher(customer.id, dto.voucher_code, total) : null
    const payment = await this.payments.createPayment({
      source_feature: 3,
      purchase_ref: `booking:${booking.id}`,
      payer_customer_id: customer.id,
      booking_id: booking.id,
      idempotency_key: key,
      amount_total: total,
      voucher_amount: voucher?.amount ?? 0,
      voucher_id: voucher?.id ?? null,
      currency: booking.currency,
      lines,
      expires_at: booking.hold_expires_at,
    })
    return this.proceed(userId, payment)
  }

  /** A payment that needs the customer's card goes to the hosted page; any other is settled on the spot. */
  private async proceed(userId: string, payment: PaymentRecord): Promise<CheckoutResultDto> {
    if (payment.status !== 'created') return { payment_id: payment.id, status: payment.status, checkout_url: null }
    if (payment.card_amount > 0 && this.payments.usesHostedCheckout()) {
      const origin = Object.entries(APP_ORIGINS).find(([, config]) => config.userType === 'customer')?.[0] ?? ''
      const result = `${origin}/payments/result?payment=${encodeURIComponent(payment.id)}`
      const started = await this.payments.startCheckout(userId, payment.id, {
        success_url: `${result}&outcome=paid`,
        cancel_url: `${result}&outcome=cancelled`,
      })
      return { payment_id: payment.id, status: 'created', checkout_url: started.checkout_url }
    }
    const settled = await this.payments.settleWithSeller(payment.id)
    return { payment_id: settled.id, status: settled.status, checkout_url: null }
  }

  /**
   * A shipper pays for a held cargo booking. Feature 17 owns the rate, so the one `cargo_freight` line is the booking's
   * `quoted_charge` as it was written at the hold, and the payment expires when the 15-minute hold does. The card is
   * captured only after 17's booking moves from `held` to `booked` (see `CargoSellerService`).
   */
  private async cargoCheckout(customerId: string, userId: string, key: string, dto: CheckoutDto): Promise<CheckoutResultDto> {
    const cargo = await this.db.cargo_booking.findUnique({
      where: { id: dto.cargo_booking_id },
      select: { id: true, customer_id: true, quoted_charge: true, currency: true, hold_expires_at: true, booking_ref: true },
    })
    // Someone else's shipment answers the same as one that does not exist.
    if (!cargo || cargo.customer_id !== customerId) {
      throw new NotFoundException(paymentFailure(PaymentErrorCode.CARGO_NOT_PAYABLE, 'Cargo booking not found'))
    }
    const latest = await this.db.cargo_shipment_event.findFirst({
      where: { cargo_booking_id: cargo.id },
      orderBy: { seq: 'desc' },
      select: { status_after: true },
    })
    if (latest?.status_after !== 'held') {
      throw new ConflictException(
        paymentFailure(
          PaymentErrorCode.CARGO_NOT_PAYABLE,
          `Cargo booking ${cargo.booking_ref} is ${latest?.status_after ?? 'unknown'}, not held`,
          {
            status: latest?.status_after ?? null,
          },
        ),
      )
    }
    const total = Number(cargo.quoted_charge)
    const voucher = dto.voucher_code ? await this.reserveVoucher(customerId, dto.voucher_code, total) : null
    const payment = await this.payments.createPayment({
      source_feature: 17,
      purchase_ref: `cargo_booking:${cargo.id}`,
      payer_customer_id: customerId,
      cargo_booking_id: cargo.id,
      idempotency_key: key,
      amount_total: total,
      voucher_amount: voucher?.amount ?? 0,
      voucher_id: voucher?.id ?? null,
      currency: cargo.currency,
      lines: [{ line_type: 'cargo_freight', description: `Air freight ${cargo.booking_ref}`, amount: total }],
      expires_at: cargo.hold_expires_at,
    })
    return this.proceed(userId, payment)
  }

  /**
   * Pays a payment another feature already started for this customer (an onboard order). Only the payer reaches it, and only
   * while it is still `created`. Flight and cargo payments are made through their own booking, never by id.
   */
  private async payExisting(customerId: string, userId: string, paymentId: string): Promise<CheckoutResultDto> {
    const payment = await this.payments.findPaymentForPayer(paymentId, customerId)
    if (!payment) throw new NotFoundException(paymentFailure(PaymentErrorCode.PAYMENT_NOT_FOUND, `Payment ${paymentId} not found`))
    if (payment.source_feature === 3 || payment.source_feature === 17 || payment.status !== 'created') {
      throw new ConflictException(
        paymentFailure(PaymentErrorCode.PAYMENT_NOT_PAYABLE, `Payment ${paymentId} cannot be paid this way`, { status: payment.status }),
      )
    }
    return this.proceed(userId, payment)
  }

  /** Once a flight booking is paid, Feature 11 issues the travel insurance policy it is owed (included, or the add-on line). */
  private async issueInsurance(payment: PaymentRecord): Promise<void> {
    if (!payment.booking_id) return
    const policy = await this.insurance.settleAfterConfirm(payment.booking_id, false)
    if (policy) this.logger.log(`Travel insurance ${policy.policyNumber} issued for booking ${payment.booking_id}`)
  }

  /**
   * The customer's own, unused, unexpired voucher. It is reserved by naming it on the payment: the database allows a
   * voucher on one open payment at a time, and it is used up when that payment is captured. A voucher is used whole, so
   * the part above the total is forfeited.
   */
  private async reserveVoucher(customerId: string, code: string, total: number): Promise<{ id: string; amount: number }> {
    const invalid = () => new UnprocessableEntityException(paymentFailure(PaymentErrorCode.VOUCHER_INVALID, 'This voucher cannot be used'))
    const voucher = await this.db.compensation_voucher.findUnique({ where: { code: storedCode(code) } })
    if (!voucher || voucher.customer_id !== customerId || voucher.status !== 'active' || voucher.expires_at <= this.clock.now())
      throw invalid()
    return { id: voucher.id, amount: Math.min(Math.round(Number(voucher.amount) * 100), Math.round(total * 100)) / 100 }
  }

  /** 5a asks after the card is held: Feature 3 sells the seats, or says why not. */
  private async sellerConfirms(payment: PaymentRecord): Promise<boolean> {
    const reference = await this.referenceOf(payment)
    if (!reference) return false
    try {
      await this.confirm.confirmBooking(reference)
      return true
    } catch (error) {
      const status = statusOf(error)
      if (status !== null && REFUSALS.has(status)) {
        this.logger.warn(`Booking ${reference} was not confirmed (${status}); the authorisation is voided`)
        return false
      }
      throw error
    }
  }

  /** A payment that ended unpaid: end the hold early. Nothing to do when Feature 3 already moved on. */
  private async sellerReleases(payment: PaymentRecord): Promise<void> {
    const reference = await this.referenceOf(payment)
    if (!reference) return
    try {
      await this.release.releaseBooking(reference)
    } catch (error) {
      const status = statusOf(error)
      if (status === null || !REFUSALS.has(status)) throw error
    }
  }

  private async referenceOf(payment: PaymentRecord): Promise<string | null> {
    if (!payment.booking_id) return null
    const booking = await this.db.booking.findUnique({ where: { id: payment.booking_id }, select: { booking_reference: true } })
    return booking?.booking_reference ?? null
  }
}
