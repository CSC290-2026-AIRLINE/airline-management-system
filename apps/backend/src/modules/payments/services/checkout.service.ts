import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { fromCents, toCents } from '../money'
import { PaymentErrorCode, isUniqueViolation, paymentError } from '../payments.errors'
import { PAYMENT_PROVIDER, ProviderUnavailableError, type PaymentProvider } from '../providers/payment-provider'
import { BOOKING_SELLER, CARGO_SELLER, type BookingSeller, type CargoSeller, type Purchase } from '../sellers/seller'
import { PaymentEngineService } from './payment-engine.service'
import { VoucherService } from './voucher.service'
import { PaymentSettingsService, type Caller } from './support.services'

export interface CheckoutInput {
  bookingReference?: string
  cargoBookingId?: string
  voucherCode?: string
  idempotencyKey: string
}

const CUSTOMER_WEB = process.env.CUSTOMER_WEB_ORIGIN ?? 'http://localhost:5151'

/**
 * 5a's checkout: create the payment for a held purchase, open a hosted session, and present payments, receipts and
 * the customer's history. The money moves in PaymentEngineService; this service only creates and reads.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(BOOKING_SELLER) private readonly bookingSeller: BookingSeller,
    @Inject(CARGO_SELLER) private readonly cargoSeller: CargoSeller,
    private readonly engine: PaymentEngineService,
    private readonly vouchers: VoucherService,
    private readonly settings: PaymentSettingsService,
  ) {}

  /** What Review & Pay shows before the customer pays: the lines and total 5a would charge. Creates nothing. */
  async preview(caller: Caller, input: Omit<CheckoutInput, 'idempotencyKey'>) {
    const purchase = await this.readPurchase(input)
    this.assertOwner(caller, purchase)
    const totalCents = purchase.lines.reduce((sum, l) => sum + l.amountCents, 0)
    const voucher = input.voucherCode ? await this.vouchers.validate(purchase.customerId, input.voucherCode, totalCents) : null
    const voucherCents = voucher ? toCents(voucher.applied_amount) : 0
    const live = await this.db.payment.findFirst({
      where: {
        source_feature: purchase.sourceFeature,
        purchase_ref: purchase.purchaseRef,
        status: { in: ['created', 'authorised', 'captured', 'reversed'] },
      },
      select: { id: true, status: true },
    })
    return {
      label: purchase.label,
      source_feature: purchase.sourceFeature,
      payable: purchase.payable,
      miles_booking: purchase.milesBooking,
      expires_at: purchase.expiresAt,
      currency: purchase.currency,
      lines: purchase.lines.map((l) => ({ line_type: l.lineType, description: l.description, amount: fromCents(l.amountCents) })),
      amount_total: fromCents(totalCents),
      voucher,
      voucher_amount: fromCents(voucherCents),
      card_amount: fromCents(totalCents - voucherCents),
      live_payment: live,
    }
  }

  /** POST /checkout and POST /staff/checkout. */
  async create(caller: Caller, input: CheckoutInput) {
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException(paymentError(PaymentErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'The Idempotency-Key header is required'))
    }
    if (!input.bookingReference === !input.cargoBookingId) {
      throw new BadRequestException(
        paymentError(PaymentErrorCode.PAYMENT_NOT_PAYABLE, 'Send exactly one of booking_reference or cargo_booking_id'),
      )
    }

    const purchase = await this.readPurchase(input)
    this.assertOwner(caller, purchase)
    const payerId = purchase.customerId
    const key = input.idempotencyKey.trim().slice(0, 200)

    // The same key from the same customer returns the existing payment instead of creating a second one.
    const repeat = await this.db.payment.findFirst({ where: { payer_customer_id: payerId, idempotency_key: key } })
    if (repeat) return this.checkoutResult(repeat.id)

    this.assertPayable(purchase)
    const minHold = await this.settings.get('min_hold_minutes')
    if (purchase.expiresAt.getTime() - this.clock.now().getTime() < minHold * 60_000) {
      throw new ConflictException(
        paymentError(PaymentErrorCode.HOLD_TOO_SHORT, `Less than ${minHold} minutes of the hold are left. Start the booking again.`),
      )
    }

    const totalCents = purchase.lines.reduce((sum, l) => sum + l.amountCents, 0)
    if (totalCents === 0 && !(purchase.sourceFeature === 3 && purchase.milesBooking)) {
      throw new UnprocessableEntityException(paymentError(PaymentErrorCode.PAYMENT_NOT_PAYABLE, 'Nothing is due for this purchase'))
    }

    let paymentId: string
    try {
      paymentId = await this.db.$transaction(async (tx) => {
        const voucher = input.voucherCode && totalCents > 0 ? await this.vouchers.reserve(tx, payerId, input.voucherCode, totalCents) : null
        const voucherCents = voucher?.voucherCents ?? 0
        const cardCents = totalCents - voucherCents
        const now = this.clock.now()
        const payment = await tx.payment.create({
          data: {
            source_feature: purchase.sourceFeature,
            purchase_ref: purchase.purchaseRef,
            payer_customer_id: payerId,
            booking_id: purchase.bookingId,
            cargo_booking_id: purchase.cargoBookingId,
            voucher_id: voucher?.voucherId ?? null,
            idempotency_key: key,
            provider: cardCents === 0 ? 'none' : this.provider.name,
            currency: purchase.currency,
            amount_total: fromCents(totalCents),
            voucher_amount: fromCents(voucherCents),
            card_amount: fromCents(cardCents),
            started_at: now,
            expires_at: purchase.expiresAt,
          },
        })
        // Lines are copied from the seller and never recomputed.
        await tx.payment_line.createMany({
          data: purchase.lines.map((line) => ({
            payment_id: payment.id,
            booking_id: line.bookingId ?? null,
            booking_coupon_id: line.bookingCouponId ?? null,
            line_type: line.lineType,
            source_ref: line.sourceRef ?? null,
            description: line.description.slice(0, 300),
            amount: fromCents(line.amountCents),
          })),
        })
        return payment.id
      })
    } catch (error) {
      if (isUniqueViolation(error, 'idempotency_key')) {
        // Two simultaneous requests with the same key: the other one won, so answer with its payment.
        const winner = await this.db.payment.findFirst({ where: { payer_customer_id: payerId, idempotency_key: key } })
        if (winner) return this.checkoutResult(winner.id)
      }
      if (isUniqueViolation(error, 'payment_voucher_uq')) {
        throw new ConflictException(paymentError(PaymentErrorCode.VOUCHER_INVALID, 'This voucher is already being used by another payment'))
      }
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          paymentError(
            PaymentErrorCode.PAYMENT_NOT_PAYABLE,
            'This purchase already has a payment in progress. Finish it or wait for it to end.',
          ),
        )
      }
      throw error
    }

    const payment = await this.db.payment.findUniqueOrThrow({ where: { id: paymentId } })
    if (payment.provider === 'none') {
      await this.engine.completeWithoutProvider(paymentId)
    } else {
      await this.openSession(paymentId, purchase).catch((error: unknown) => {
        // The payment stays created; the customer can retry with POST /payments/:id/attempts while the hold lasts.
        this.logger.warn(`Could not open a hosted session for ${paymentId}: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
    return this.checkoutResult(paymentId)
  }

  /** POST /payments/:id/attempts: a session for a payment whose old session expired (or never opened). */
  async newAttempt(caller: Caller, paymentId: string) {
    const payment = await this.findVisible(caller, paymentId)
    if (payment.status !== 'created' || payment.provider === 'none') {
      throw new ConflictException(paymentError(PaymentErrorCode.PAYMENT_NOT_PAYABLE, `This payment is ${payment.status}`))
    }
    if (payment.expires_at <= this.clock.now()) {
      throw new ConflictException(paymentError(PaymentErrorCode.HOLD_TOO_SHORT, 'The hold for this purchase has ended'))
    }
    const open = await this.db.payment_attempt.findFirst({ where: { payment_id: paymentId, status: 'open' } })
    if (open) {
      const session = await this.callProvider(() => this.provider.lookupSession(open.provider_session_id))
      if (session.state === 'open' && session.url) return { ...(await this.checkoutResult(paymentId)), checkout_url: session.url }
      if (session.state === 'complete') return this.checkoutResult(paymentId)
      await this.db.payment_attempt.update({ where: { id: open.id }, data: { status: 'expired', updated_at: new Date() } })
    }
    const purchase = await this.readPurchaseForPayment(payment)
    const url = await this.openSession(paymentId, purchase)
    return { ...(await this.checkoutResult(paymentId)), checkout_url: url }
  }

  private async openSession(paymentId: string, purchase: Pick<Purchase, 'label' | 'cancelPath'>): Promise<string> {
    const payment = await this.db.payment.findUniqueOrThrow({ where: { id: paymentId } })
    const attemptNo = await this.db.payment_attempt.count({ where: { payment_id: paymentId } })
    const session = await this.callProvider(() =>
      this.provider.createSession({
        paymentId,
        attemptNo: attemptNo + 1,
        amountCents: toCents(payment.card_amount),
        currency: payment.currency,
        description: `Flython ${purchase.label}`,
        // The browser coming back proves nothing; the return page polls GET /payments/:id until a webhook moved it.
        successUrl: `${CUSTOMER_WEB}/payments/${paymentId}`,
        cancelUrl: `${CUSTOMER_WEB}${purchase.cancelPath}`,
      }),
    )
    try {
      await this.db.payment_attempt.create({
        data: { payment_id: paymentId, provider_session_id: session.sessionId, provider_intent_id: session.intentId },
      })
    } catch (error) {
      // payment_attempt_live_uq: another tab opened a session first. Close ours and use theirs.
      if (!isUniqueViolation(error)) throw error
      await this.provider.expireSession(session.sessionId).catch(() => undefined)
      const other = await this.db.payment_attempt.findFirst({ where: { payment_id: paymentId, status: 'open' } })
      const lookup = other ? await this.provider.lookupSession(other.provider_session_id) : null
      if (lookup?.url) return lookup.url
      throw error
    }
    return session.url
  }

  private async callProvider<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call()
    } catch (error) {
      if (error instanceof ProviderUnavailableError) {
        throw new ServiceUnavailableException(
          paymentError(PaymentErrorCode.PROVIDER_UNAVAILABLE, 'The payment provider is unavailable. Try again.'),
        )
      }
      throw error
    }
  }

  /** What POST /checkout answers: the payment and, while it is open, the hosted page URL. */
  private async checkoutResult(paymentId: string) {
    const view = await this.view(paymentId)
    let checkoutUrl: string | null = null
    if (view.status === 'created' && view.provider !== 'none') {
      const open = await this.db.payment_attempt.findFirst({ where: { payment_id: paymentId, status: 'open' } })
      if (open) checkoutUrl = (await this.provider.lookupSession(open.provider_session_id).catch(() => null))?.url ?? null
    }
    return { payment: view, checkout_url: checkoutUrl }
  }

  // ----- reads ----------------------------------------------------------------------------------------------------

  /** GET /payments/:id: status, lines, voucher, hold countdown and receipt link. Staff also get the timeline. */
  async get(caller: Caller, paymentId: string) {
    await this.findVisible(caller, paymentId)
    const view = await this.view(paymentId)
    if (caller.kind !== 'staff') return view
    const [attempts, events, refunds] = await Promise.all([
      this.db.payment_attempt.findMany({ where: { payment_id: paymentId }, orderBy: { created_at: 'asc' } }),
      this.db.payment_event_receipt.findMany({ where: { payment_id: paymentId }, orderBy: { received_at: 'asc' } }),
      this.db.refund.findMany({ where: { payment_id: paymentId }, orderBy: { requested_at: 'asc' }, include: { refund_line: true } }),
    ])
    return { ...view, attempts, events, refunds }
  }

  async view(paymentId: string) {
    const payment = await this.db.payment.findUnique({
      where: { id: paymentId },
      include: {
        payment_line_payment_line_payment_idTopayment: { orderBy: { created_at: 'asc' } },
        compensation_voucher: { select: { code: true, amount: true } },
        payment_attempt: { where: { status: 'authorised' }, select: { card_brand: true, card_last4: true } },
        receipt: { where: { refund_id: null }, select: { id: true, document_number: true, document_type: true } },
        booking: { select: { booking_reference: true, status: true } },
        cargo_booking_payment_cargo_booking_idTocargo_booking: { select: { booking_ref: true, awb_number: true } },
        customer: { select: { id: true, passenger: { select: { first_name: true, last_name: true } } } },
      },
    })
    if (!payment) throw new NotFoundException(paymentError(PaymentErrorCode.PAYMENT_NOT_FOUND, 'Payment not found'))
    const lines = payment.payment_line_payment_line_payment_idTopayment
    const card = payment.payment_attempt[0]
    const cargo = payment.cargo_booking_payment_cargo_booking_idTocargo_booking
    const now = this.clock.now()
    return {
      id: payment.id,
      status: payment.status,
      source_feature: payment.source_feature,
      purchase_ref: payment.purchase_ref,
      provider: payment.provider,
      currency: payment.currency,
      amount_total: fromCents(toCents(payment.amount_total)),
      voucher_amount: fromCents(toCents(payment.voucher_amount)),
      card_amount: fromCents(toCents(payment.card_amount)),
      voucher_code: payment.compensation_voucher?.code ?? null,
      lines: lines.map((l) => ({
        id: l.id,
        line_type: l.line_type,
        description: l.description,
        booking_coupon_id: l.booking_coupon_id,
        amount: fromCents(toCents(l.amount)),
        refunded_amount: fromCents(toCents(l.refunded_amount)),
      })),
      card_brand: card?.card_brand ?? null,
      card_last4: card?.card_last4 ?? null,
      booking_reference: payment.booking?.booking_reference ?? null,
      cargo_booking_ref: cargo?.booking_ref ?? null,
      awb_number: cargo?.awb_number ?? null,
      payer: payment.customer
        ? { id: payment.customer.id, name: `${payment.customer.passenger.first_name} ${payment.customer.passenger.last_name}` }
        : null,
      miles_used: payment.booking_id ? await this.milesUsed(payment.id) : null,
      receipt: payment.receipt[0] ?? null,
      started_at: payment.started_at,
      expires_at: payment.expires_at,
      seconds_left: payment.status === 'created' ? Math.max(0, Math.floor((payment.expires_at.getTime() - now.getTime()) / 1000)) : 0,
      authorised_at: payment.authorised_at,
      captured_at: payment.captured_at,
      voided_at: payment.voided_at,
      capture_stalled_at: payment.capture_stalled_at,
      capture_attempts: payment.capture_attempts,
      last_error: payment.last_error,
    }
  }

  /** GET /staff/payments?q=: by booking reference, Air Waybill number, payment id, customer id or customer email. */
  async search(q: string) {
    const text = q.trim()
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
    const rows = await this.db.payment.findMany({
      where: {
        OR: [
          ...(isUuid ? [{ id: text }, { payer_customer_id: text }, { booking_id: text }, { cargo_booking_id: text }] : []),
          { booking: { booking_reference: text.toUpperCase() } },
          { cargo_booking_payment_cargo_booking_idTocargo_booking: { OR: [{ awb_number: text }, { booking_ref: text.toUpperCase() }] } },
          { customer: { user: { email: { equals: text, mode: 'insensitive' } } } },
        ],
      },
      orderBy: { started_at: 'desc' },
      take: 50,
      select: { id: true },
    })
    return Promise.all(rows.map((r) => this.view(r.id)))
  }

  /** GET /customers/me/payments, newest first. */
  async listMine(customerId: string) {
    const payments = await this.db.payment.findMany({
      where: { payer_customer_id: customerId },
      orderBy: { started_at: 'desc' },
      take: 100,
      select: { id: true },
    })
    return Promise.all(payments.map((p) => this.view(p.id)))
  }

  /** GET /payments/:id/receipt: the receipt or invoice with its lines, credit notes and card brand and last four. */
  async receipt(caller: Caller, paymentId: string) {
    await this.findVisible(caller, paymentId)
    const view = await this.view(paymentId)
    const documents = await this.db.receipt.findMany({ where: { payment_id: paymentId }, orderBy: { issued_at: 'asc' } })
    const original = documents.find((d) => !d.refund_id)
    if (!original)
      throw new NotFoundException(paymentError(PaymentErrorCode.PAYMENT_NOT_FOUND, 'No receipt has been issued for this payment yet'))
    return {
      document_type: original.document_type,
      document_number: original.document_number,
      issued_at: original.issued_at,
      billing_name: original.billing_name,
      amount: fromCents(toCents(original.amount)),
      payment: view,
      credit_notes: documents
        .filter((d) => d.refund_id)
        .map((d) => ({
          document_number: d.document_number,
          amount: fromCents(toCents(d.amount)),
          issued_at: d.issued_at,
          refund_id: d.refund_id,
        })),
    }
  }

  /** Miles from feature 11's redeem rows for the booking's coupons (they never change after confirm). Never a balance. */
  private async milesUsed(paymentId: string): Promise<number | null> {
    const coupons = await this.db.payment_line.findMany({
      where: { payment_id: paymentId, line_type: 'award_fee', booking_coupon_id: { not: null } },
      select: { booking_coupon_id: true },
    })
    if (coupons.length === 0) return null
    const rows = await this.db.loyalty_transaction.findMany({
      where: { type: 'redeem', booking_coupon_id: { in: coupons.map((c) => c.booking_coupon_id as string) } },
      select: { miles: true },
    })
    return rows.reduce((sum, r) => sum + Math.abs(r.miles), 0)
  }

  /** A customer reaches only their own payments; any other id answers 404. Staff reach all. */
  async findVisible(caller: Caller, paymentId: string) {
    const payment = await this.db.payment.findUnique({ where: { id: paymentId } })
    if (!payment || (caller.kind === 'customer' && payment.payer_customer_id !== caller.customerId)) {
      throw new NotFoundException(paymentError(PaymentErrorCode.PAYMENT_NOT_FOUND, 'Payment not found'))
    }
    return payment
  }

  private async readPurchase(input: Omit<CheckoutInput, 'idempotencyKey'>): Promise<Purchase> {
    const purchase = input.cargoBookingId
      ? await this.cargoSeller.getCargoBooking(input.cargoBookingId)
      : await this.bookingSeller.getBooking(input.bookingReference ?? '')
    if (!purchase) throw new NotFoundException(paymentError(PaymentErrorCode.BOOKING_NOT_FOUND, 'Booking not found'))
    return purchase
  }

  private async readPurchaseForPayment(payment: { booking_id: string | null; cargo_booking_id: string | null }): Promise<Purchase> {
    if (payment.cargo_booking_id) return this.readPurchase({ cargoBookingId: payment.cargo_booking_id })
    const booking = payment.booking_id
      ? await this.db.booking.findUnique({ where: { id: payment.booking_id }, select: { booking_reference: true } })
      : null
    return this.readPurchase({ bookingReference: booking?.booking_reference ?? '' })
  }

  private assertOwner(caller: Caller, purchase: Purchase) {
    // Answer 404, not 403, so a customer cannot probe other people's booking references.
    if (caller.kind === 'customer' && purchase.customerId !== caller.customerId) {
      throw new NotFoundException(paymentError(PaymentErrorCode.BOOKING_NOT_FOUND, 'Booking not found'))
    }
  }

  private assertPayable(purchase: Purchase) {
    if (purchase.payable) return
    const code = purchase.sourceFeature === 17 ? PaymentErrorCode.CARGO_NOT_PAYABLE : PaymentErrorCode.PAYMENT_NOT_PAYABLE
    throw new ConflictException(paymentError(code, 'This purchase cannot be paid now'))
  }
}
