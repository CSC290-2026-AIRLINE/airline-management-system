import type { PaymentExceptionRecord, PaymentLineRecord, PaymentRecord, PaymentSourceFeature, ReceiptRecord } from './payment.types'
import { DEMO_CUSTOMER_ID, resolveCustomerId as resolveMockCustomerId } from './mock-booking-state'

/**
 * The DI token for the repository. The module provides the mock implementation under this token; the real
 * Prisma-backed one replaces it in the same providers array.
 */
export const PAYMENT_REPOSITORY = 'PAYMENT_REPOSITORY'

/**
 * The seam between Feature 5a and the database.
 *
 * Everything above this interface is feature code; everything below it is storage. The mock implementation keeps the
 * rows in memory, so swapping in Prisma means writing one new class and changing one line in the module's providers
 * array — no service, controller or DTO changes.
 *
 * Every method is asynchronous, because Prisma's are: the mock resolves immediately, so the service awaits it exactly
 * as it will await the database later.
 *
 * TODO(F5a): replace `InMemoryPaymentRepository` with a Prisma-backed implementation over `payment`, `payment_line`,
 * `payment_attempt` and `receipt`. The Database Team owns the schema; this interface is shaped to match it exactly.
 */
export interface PaymentRepository {
  insert(payment: PaymentRecord): Promise<PaymentRecord>
  update(payment: PaymentRecord): Promise<PaymentRecord>
  findById(id: string): Promise<PaymentRecord | undefined>
  /** The one live payment for a purchase, if any. `created | authorised | captured | reversed` count as live. */
  findLiveByPurchaseRef(sourceFeature: PaymentSourceFeature, purchaseRef: string): Promise<PaymentRecord | undefined>
  /** The payment made with an idempotency key, whatever its status. Replaying a key returns the same payment. */
  findByIdempotencyKey(payerCustomerId: string | null, idempotencyKey: string): Promise<PaymentRecord | undefined>
  listPayments(): Promise<PaymentRecord[]>
  insertReceipt(receipt: ReceiptRecord): Promise<ReceiptRecord>
  listReceipts(): Promise<ReceiptRecord[]>
  findReceiptById(id: string): Promise<ReceiptRecord | undefined>
  findReceiptByPaymentId(paymentId: string): Promise<ReceiptRecord | undefined>
  /** The credit note attached to a payment, if the payment was reversed. Feature 5b owns the refund itself. */
  findCreditNoteByPaymentId(paymentId: string): Promise<ReceiptRecord | undefined>
  /** The staff exception row for a payment, if it has ever been on the list. */
  findException(paymentId: string): Promise<PaymentExceptionRecord | undefined>
  saveException(exception: PaymentExceptionRecord): Promise<PaymentExceptionRecord>
  listExceptions(): Promise<PaymentExceptionRecord[]>
  /** The `customer.id` behind a signed-in user id, or undefined when that user is not a customer. */
  resolveCustomerId(userId: string): Promise<string | undefined>
}

/** The statuses that hold the `payment_one_live_per_purchase_uq` slot for a purchase. */
export const LIVE_STATUSES = ['created', 'authorised', 'captured', 'reversed'] as const

export function isLiveStatus(payment: PaymentRecord): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(payment.status)
}

/**
 * The mock repository. Rows live in maps for the life of the process; nothing is written anywhere.
 */
export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly payments = new Map<string, PaymentRecord>()
  private readonly receipts = new Map<string, ReceiptRecord>()
  private readonly exceptions = new Map<string, PaymentExceptionRecord>()

  insert(payment: PaymentRecord): Promise<PaymentRecord> {
    this.payments.set(payment.id, payment)
    return Promise.resolve(payment)
  }

  update(payment: PaymentRecord): Promise<PaymentRecord> {
    this.payments.set(payment.id, payment)
    return Promise.resolve(payment)
  }

  findById(id: string): Promise<PaymentRecord | undefined> {
    return Promise.resolve(this.payments.get(id))
  }

  findLiveByPurchaseRef(sourceFeature: PaymentSourceFeature, purchaseRef: string): Promise<PaymentRecord | undefined> {
    const live = this.allPayments().find((p) => this.matchesPurchase(p, sourceFeature, purchaseRef) && isLiveStatus(p))
    return Promise.resolve(live)
  }

  findByIdempotencyKey(payerCustomerId: string | null, idempotencyKey: string): Promise<PaymentRecord | undefined> {
    const payment = this.allPayments().find((p) => p.payer_customer_id === payerCustomerId && p.idempotency_key === idempotencyKey)
    return Promise.resolve(payment)
  }

  listPayments(): Promise<PaymentRecord[]> {
    return Promise.resolve(this.allPayments())
  }

  insertReceipt(receipt: ReceiptRecord): Promise<ReceiptRecord> {
    this.receipts.set(receipt.id, receipt)
    return Promise.resolve(receipt)
  }

  listReceipts(): Promise<ReceiptRecord[]> {
    return Promise.resolve(this.allReceipts())
  }

  findReceiptById(id: string): Promise<ReceiptRecord | undefined> {
    return Promise.resolve(this.receipts.get(id))
  }

  findReceiptByPaymentId(paymentId: string): Promise<ReceiptRecord | undefined> {
    const receipt = this.allReceipts().find((r) => r.payment_id === paymentId && r.refund_id === null)
    return Promise.resolve(receipt)
  }

  findCreditNoteByPaymentId(paymentId: string): Promise<ReceiptRecord | undefined> {
    const note = this.allReceipts().find((r) => r.payment_id === paymentId && r.document_type === 'credit_note')
    return Promise.resolve(note)
  }

  findException(paymentId: string): Promise<PaymentExceptionRecord | undefined> {
    return Promise.resolve(this.exceptions.get(paymentId))
  }

  saveException(exception: PaymentExceptionRecord): Promise<PaymentExceptionRecord> {
    this.exceptions.set(exception.payment_id, exception)
    return Promise.resolve(exception)
  }

  listExceptions(): Promise<PaymentExceptionRecord[]> {
    return Promise.resolve([...this.exceptions.values()])
  }

  resolveCustomerId(userId: string): Promise<string | undefined> {
    return Promise.resolve(resolveMockCustomerId(userId))
  }

  /** The rows as a plain array, so the lookups above stay one-liners. */
  private allPayments(): PaymentRecord[] {
    return [...this.payments.values()]
  }

  private allReceipts(): ReceiptRecord[] {
    return [...this.receipts.values()]
  }

  private matchesPurchase(payment: PaymentRecord, sourceFeature: PaymentSourceFeature, purchaseRef: string): boolean {
    return payment.source_feature === sourceFeature && payment.purchase_ref === purchaseRef
  }
}

/** One line of a seeded payment, without the row's own bookkeeping. */
export interface SeedLine {
  line_type: PaymentRecord['lines'][number]['line_type']
  description: string
  amount: number
  source_ref?: string | null
  booking_coupon_id?: string | null
}

/** The receipt a seeded payment carries. */
export interface SeedReceipt {
  id: string
  document_type: ReceiptRecord['document_type']
  document_number: string
  amount: number
  billing_name?: string | null
  issued_at: Date
  /** Set on a credit note: the refund it belongs to. Feature 5b owns the refund. */
  refund_id?: string | null
}

/** A seeded payment. The repository fills in the ids and timestamps so the seed stays readable. */
export interface SeedPayment {
  id: string
  source_feature: PaymentRecord['source_feature']
  purchase_ref: string
  payer_customer_id: string | null
  booking_id?: string | null
  cargo_booking_id?: string | null
  voucher_id?: string | null
  idempotency_key: string
  status: PaymentRecord['status']
  provider: PaymentRecord['provider']
  currency: string
  amount_total: number
  /** The money a compensation voucher covered. Miles are not money and are not stored here (see Feature 11). */
  voucher_amount?: number
  card_brand?: string | null
  card_last4?: string | null
  started_at: Date
  expires_at: Date
  authorised_at?: Date | null
  /** When the selling feature confirmed the purchase. See `PaymentRecord.confirmed_at`. */
  confirmed_at?: Date | null
  captured_at?: Date | null
  voided_at?: Date | null
  capture_stalled_at?: Date | null
  capture_attempts?: number
  last_error?: string | null
  lines: SeedLine[]
  receipt?: SeedReceipt | null
  creditNote?: SeedReceipt | null
  exception?: PaymentExceptionRecord
}

/**
 * The demo rows: one payment per state the Figma frames show — captured, miles and cash, zero-cash miles, cargo
 * invoice, refunded with a credit note, capture stalled, failed, expired and voided.
 *
 * TODO(F5a): delete this seed when the repository talks to Prisma.
 */
export function buildSeedPayments(): SeedPayment[] {
  const day = 24 * 60 * 60 * 1000
  const now = Date.now()
  return [
    {
      id: 'pay_00000000-0000-4000-8000-000000000001',
      source_feature: 3,
      purchase_ref: 'booking:bk_7f3a91',
      payer_customer_id: DEMO_CUSTOMER_ID,
      booking_id: 'bk_7f3a91',
      idempotency_key: 'demo-idem-1',
      status: 'captured',
      provider: 'fake',
      currency: 'USD',
      amount_total: 412.6,
      card_brand: 'Visa',
      card_last4: '4242',
      started_at: new Date(now - 6 * day),
      expires_at: new Date(now - 6 * day + 15 * 60 * 1000),
      authorised_at: new Date(now - 6 * day + 60 * 1000),
      captured_at: new Date(now - 6 * day + 90 * 1000),
      lines: [{ line_type: 'fare', description: 'Flight SFO → JFK, 1 passenger', amount: 412.6, booking_coupon_id: 'cp_7f3a91' }],
      receipt: {
        id: 'rc_00000000-0000-4000-8000-000000000001',
        document_type: 'receipt',
        document_number: 'RCPT-2026-000001',
        amount: 412.6,
        billing_name: 'Demo Customer',
        issued_at: new Date(now - 6 * day + 90 * 1000),
      },
      /* A payment that was on the exception list and has since been closed, so the "resolved" tab has something in it. */
      exception: {
        payment_id: 'pay_00000000-0000-4000-8000-000000000001',
        state: 'resolved',
        detected_at: new Date(now - 6 * day + 70 * 1000),
        resolved_at: new Date(now - 6 * day + 90 * 1000),
        resolved_by: 'staff_demo',
        resolution: 'captured',
        note: 'The capture failed twice; the third attempt succeeded.',
      },
    },
    {
      id: 'pay_00000000-0000-4000-8000-000000000002',
      source_feature: 3,
      purchase_ref: 'booking:bk_2a44c0',
      payer_customer_id: DEMO_CUSTOMER_ID,
      booking_id: 'bk_2a44c0',
      idempotency_key: 'demo-idem-2',
      status: 'captured',
      provider: 'fake',
      currency: 'USD',
      amount_total: 58.2,
      card_brand: 'Mastercard',
      card_last4: '5100',
      started_at: new Date(now - 3 * day),
      expires_at: new Date(now - 3 * day + 15 * 60 * 1000),
      authorised_at: new Date(now - 3 * day + 45 * 1000),
      captured_at: new Date(now - 3 * day + 70 * 1000),
      lines: [
        {
          line_type: 'fare',
          description: 'Flight SFO → JFK, 1 passenger — 40,000 miles',
          amount: 58.2,
          booking_coupon_id: 'cp_2a44c0',
        },
      ],
      receipt: {
        id: 'rc_00000000-0000-4000-8000-000000000002',
        document_type: 'receipt',
        document_number: 'RCPT-2026-000002',
        amount: 58.2,
        billing_name: 'Demo Customer',
        issued_at: new Date(now - 3 * day + 70 * 1000),
      },
    },
    {
      id: 'pay_00000000-0000-4000-8000-000000000003',
      source_feature: 3,
      purchase_ref: 'booking:bk_0b12c3',
      payer_customer_id: DEMO_CUSTOMER_ID,
      booking_id: 'bk_0b12c3',
      idempotency_key: 'demo-idem-3',
      status: 'captured',
      provider: 'none',
      currency: 'USD',
      amount_total: 0,
      started_at: new Date(now - 11 * day),
      expires_at: new Date(now - 11 * day + 15 * 60 * 1000),
      authorised_at: new Date(now - 11 * day + 50 * 1000),
      captured_at: new Date(now - 11 * day + 50 * 1000),
      lines: [
        {
          line_type: 'award_fee',
          description: 'Award ticket — 25,000 miles, no taxes due',
          amount: 0,
          booking_coupon_id: 'cp_0b12c3',
        },
      ],
      receipt: {
        id: 'rc_00000000-0000-4000-8000-000000000003',
        document_type: 'receipt',
        document_number: 'RCPT-2026-000003',
        amount: 0,
        billing_name: 'Demo Customer',
        issued_at: new Date(now - 11 * day + 50 * 1000),
      },
    },
    {
      id: 'pay_00000000-0000-4000-8000-000000000004',
      source_feature: 17,
      purchase_ref: 'cargo_booking:cb_9d10ff',
      payer_customer_id: DEMO_CUSTOMER_ID,
      cargo_booking_id: 'cb_9d10ff',
      idempotency_key: 'demo-idem-4',
      status: 'captured',
      provider: 'fake',
      currency: 'USD',
      amount_total: 1284.75,
      card_brand: 'Visa',
      card_last4: '1881',
      started_at: new Date(now - 9 * day),
      expires_at: new Date(now - 9 * day + 30 * 60 * 1000),
      authorised_at: new Date(now - 9 * day + 40 * 1000),
      captured_at: new Date(now - 9 * day + 65 * 1000),
      lines: [
        { line_type: 'cargo_freight', description: 'Cargo freight — 42 kg', amount: 1184.75, source_ref: 'cargo_freight:cb_9d10ff' },
        { line_type: 'cargo_surcharge', description: 'Oversize surcharge', amount: 100, source_ref: 'cargo_surcharge:cb_9d10ff' },
      ],
      receipt: {
        id: 'rc_00000000-0000-4000-8000-000000000004',
        document_type: 'invoice',
        document_number: 'INV-2026-000004',
        amount: 1284.75,
        billing_name: 'Demo Customer',
        issued_at: new Date(now - 9 * day + 65 * 1000),
      },
    },
    {
      id: 'pay_00000000-0000-4000-8000-000000000005',
      source_feature: 3,
      purchase_ref: 'booking:bk_3e5f44',
      payer_customer_id: DEMO_CUSTOMER_ID,
      booking_id: 'bk_3e5f44',
      idempotency_key: 'demo-idem-5',
      status: 'reversed',
      provider: 'fake',
      currency: 'USD',
      amount_total: 305.4,
      card_brand: 'Visa',
      card_last4: '4242',
      started_at: new Date(now - 14 * day),
      expires_at: new Date(now - 14 * day + 15 * 60 * 1000),
      authorised_at: new Date(now - 14 * day + 55 * 1000),
      captured_at: new Date(now - 14 * day + 80 * 1000),
      lines: [{ line_type: 'fare', description: 'Flight BOS → MIA, 1 passenger', amount: 305.4, booking_coupon_id: 'cp_3e5f44' }],
      receipt: {
        id: 'rc_00000000-0000-4000-8000-000000000005',
        document_type: 'receipt',
        document_number: 'RCPT-2026-000005',
        amount: 305.4,
        billing_name: 'Demo Customer',
        issued_at: new Date(now - 14 * day + 80 * 1000),
      },
      creditNote: {
        id: 'rc_00000000-0000-4000-8000-000000000005-cn',
        document_type: 'credit_note',
        document_number: 'CN-2026-000005',
        amount: 305.4,
        billing_name: 'Demo Customer',
        issued_at: new Date(now - 2 * day),
        refund_id: 'ref_00000000-0000-4000-8000-000000000005',
      },
    },
    {
      id: 'pay_00000000-0000-4000-8000-000000000006',
      source_feature: 3,
      purchase_ref: 'booking:bk_5c8e21',
      payer_customer_id: DEMO_CUSTOMER_ID,
      booking_id: 'bk_5c8e21',
      idempotency_key: 'demo-idem-6',
      status: 'authorised',
      provider: 'fake',
      currency: 'USD',
      amount_total: 233.4,
      card_brand: 'Visa',
      card_last4: '4242',
      started_at: new Date(now - 40 * 60 * 1000),
      expires_at: new Date(now + 5 * 60 * 1000),
      authorised_at: new Date(now - 38 * 60 * 1000),
      confirmed_at: new Date(now - 25 * 60 * 1000),
      capture_stalled_at: new Date(now - 20 * 60 * 1000),
      capture_attempts: 5,
      last_error: 'capture_retry_limit_reached',
      lines: [{ line_type: 'fare', description: 'Flight LAX → ORD, 1 passenger', amount: 233.4, booking_coupon_id: 'cp_5c8e21' }],
    },
    {
      id: 'pay_00000000-0000-4000-8000-000000000007',
      source_feature: 6,
      purchase_ref: 'check_in:ci_44bb07:bags:2',
      payer_customer_id: DEMO_CUSTOMER_ID,
      booking_id: 'bk_5c8e21',
      idempotency_key: 'demo-idem-7',
      status: 'failed',
      provider: 'fake',
      currency: 'USD',
      amount_total: 70,
      started_at: new Date(now - 2 * day),
      expires_at: new Date(now - 2 * day + 15 * 60 * 1000),
      last_error: 'card_declined',
      lines: [{ line_type: 'baggage', description: '2 excess checked bags', amount: 70, source_ref: 'checked_bag:bag_44bb07' }],
    },
    {
      id: 'pay_00000000-0000-4000-8000-000000000008',
      source_feature: 3,
      purchase_ref: 'booking:bk_6f1d99',
      payer_customer_id: DEMO_CUSTOMER_ID,
      booking_id: 'bk_6f1d99',
      idempotency_key: 'demo-idem-8',
      status: 'expired',
      provider: 'fake',
      currency: 'USD',
      amount_total: 189,
      started_at: new Date(now - 4 * day),
      expires_at: new Date(now - 4 * day + 15 * 60 * 1000),
      last_error: 'hold_expired',
      lines: [{ line_type: 'fare', description: 'Flight SEA → MIA, 1 passenger', amount: 189, booking_coupon_id: 'cp_6f1d99' }],
    },
    {
      id: 'pay_00000000-0000-4000-8000-000000000010',
      source_feature: 3,
      purchase_ref: 'booking:bk_1d7c40',
      payer_customer_id: DEMO_CUSTOMER_ID,
      booking_id: 'bk_1d7c40',
      idempotency_key: 'demo-idem-10',
      status: 'created',
      provider: 'fake',
      currency: 'USD',
      amount_total: 512.4,
      card_brand: 'Visa',
      card_last4: '4242',
      started_at: new Date(now - 2 * 60 * 1000),
      expires_at: new Date(now + 13 * 60 * 1000),
      lines: [{ line_type: 'fare', description: 'Flight DEN → SAN, 1 passenger', amount: 512.4, booking_coupon_id: 'cp_1d7c40' }],
    },
    {
      id: 'pay_00000000-0000-4000-8000-000000000009',
      source_feature: 12,
      purchase_ref: 'product_order:po_88c2a0',
      payer_customer_id: DEMO_CUSTOMER_ID,
      idempotency_key: 'demo-idem-9',
      status: 'voided',
      provider: 'fake',
      currency: 'USD',
      amount_total: 18.5,
      started_at: new Date(now - 5 * day),
      expires_at: new Date(now - 5 * day + 10 * 60 * 1000),
      authorised_at: new Date(now - 5 * day + 30 * 1000),
      voided_at: new Date(now - 5 * day + 90 * 1000),
      last_error: 'booking_confirm_failed',
      lines: [{ line_type: 'onboard_order', description: 'Onboard order — 1 item', amount: 18.5, source_ref: 'product_order:po_88c2a0' }],
    },
    {
      /* A second capture that stalled: the booking is confirmed and the ticket is live, but the card was never charged. */
      id: 'pay_00000000-0000-4000-8000-000000000011',
      source_feature: 3,
      purchase_ref: 'booking:bk_2c8f55',
      payer_customer_id: DEMO_CUSTOMER_ID,
      booking_id: 'bk_2c8f55',
      idempotency_key: 'demo-idem-11',
      status: 'authorised',
      provider: 'fake',
      currency: 'USD',
      amount_total: 342.1,
      card_brand: 'Visa',
      card_last4: '4242',
      started_at: new Date(now - 25 * 60 * 1000),
      expires_at: new Date(now - 10 * 60 * 1000),
      authorised_at: new Date(now - 23 * 60 * 1000),
      confirmed_at: new Date(now - 21 * 60 * 1000),
      capture_stalled_at: new Date(now - 12 * 60 * 1000),
      capture_attempts: 5,
      last_error: 'capture_retry_limit_reached',
      lines: [{ line_type: 'fare', description: 'Flight BKK → KIX, 1 passenger', amount: 342.1, booking_coupon_id: 'cp_2c8f55' }],
    },
    {
      /* A cargo capture that stalled: no Air Waybill is issued until the card is charged. */
      id: 'pay_00000000-0000-4000-8000-000000000012',
      source_feature: 17,
      purchase_ref: 'cargo_booking:cb_3a77c1',
      payer_customer_id: DEMO_CUSTOMER_ID,
      cargo_booking_id: 'cb_3a77c1',
      idempotency_key: 'demo-idem-12',
      status: 'authorised',
      provider: 'fake',
      currency: 'USD',
      amount_total: 820,
      card_brand: 'Visa',
      card_last4: '1881',
      started_at: new Date(now - 70 * 60 * 1000),
      expires_at: new Date(now - 40 * 60 * 1000),
      authorised_at: new Date(now - 68 * 60 * 1000),
      confirmed_at: new Date(now - 66 * 60 * 1000),
      capture_stalled_at: new Date(now - 40 * 60 * 1000),
      capture_attempts: 5,
      last_error: 'capture_retry_limit_reached',
      lines: [
        { line_type: 'cargo_freight', description: 'Cargo freight — 30 kg', amount: 720, source_ref: 'cargo_freight:cb_3a77c1' },
        { line_type: 'cargo_surcharge', description: 'Oversize surcharge', amount: 100, source_ref: 'cargo_surcharge:cb_3a77c1' },
      ],
    },
    {
      /* The provider event never arrived: the payment is authorised but the capture was never attempted. */
      id: 'pay_00000000-0000-4000-8000-000000000013',
      source_feature: 3,
      purchase_ref: 'booking:bk_4e1d92',
      payer_customer_id: DEMO_CUSTOMER_ID,
      booking_id: 'bk_4e1d92',
      idempotency_key: 'demo-idem-13',
      status: 'authorised',
      provider: 'fake',
      currency: 'USD',
      amount_total: 268.9,
      card_brand: 'Visa',
      card_last4: '1881',
      started_at: new Date(now - 32 * 60 * 1000),
      /* The seller's hold was extended while the provider event was missing. */
      expires_at: new Date(now + 2 * 60 * 1000),
      authorised_at: new Date(now - 31 * 60 * 1000),
      confirmed_at: new Date(now - 30 * 60 * 1000),
      lines: [{ line_type: 'fare', description: 'Flight BKK → SGN, 1 passenger', amount: 268.9, booking_coupon_id: 'cp_4e1d92' }],
    },
    {
      /* The customer paid, but the finance ledger never answered. */
      id: 'pay_00000000-0000-4000-8000-000000000014',
      source_feature: 3,
      purchase_ref: 'booking:bk_6b0a44',
      payer_customer_id: DEMO_CUSTOMER_ID,
      booking_id: 'bk_6b0a44',
      idempotency_key: 'demo-idem-14',
      status: 'captured',
      provider: 'fake',
      currency: 'USD',
      amount_total: 156.2,
      card_brand: 'Visa',
      card_last4: '4242',
      started_at: new Date(now - 3 * 60 * 60 * 1000),
      expires_at: new Date(now - 3 * 60 * 60 * 1000 + 15 * 60 * 1000),
      authorised_at: new Date(now - 3 * 60 * 60 * 1000 + 45 * 1000),
      confirmed_at: new Date(now - 3 * 60 * 60 * 1000 + 60 * 1000),
      captured_at: new Date(now - 3 * 60 * 60 * 1000 + 75 * 1000),
      last_error: 'finance_posting_failed',
      lines: [{ line_type: 'fare', description: 'Flight BKK → DMK, 1 passenger', amount: 156.2, booking_coupon_id: 'cp_6b0a44' }],
      receipt: {
        id: 'rc_00000000-0000-4000-8000-000000000014',
        document_type: 'receipt',
        document_number: 'RCPT-2026-000014',
        amount: 156.2,
        billing_name: 'Demo Customer',
        issued_at: new Date(now - 3 * 60 * 60 * 1000 + 75 * 1000),
      },
    },
  ]
}

/** Turn the seed rows into repository rows, filling in ids, timestamps and the money split. */
export async function seedRepository(repo: InMemoryPaymentRepository, seed: SeedPayment[], now: Date): Promise<void> {
  for (const s of seed) {
    const voucherAmount = s.voucher_amount ?? 0
    const cardAmount = Math.round((s.amount_total - voucherAmount) * 100) / 100
    const lines: PaymentLineRecord[] = s.lines.map((line, index) => ({
      id: `${s.id}-line-${index + 1}`,
      payment_id: s.id,
      booking_id: s.booking_id ?? null,
      booking_coupon_id: line.booking_coupon_id ?? null,
      line_type: line.line_type,
      source_ref: line.source_ref ?? null,
      description: line.description,
      amount: line.amount,
      refunded_amount: s.status === 'reversed' ? line.amount : 0,
      created_at: s.started_at,
    }))

    const payment: PaymentRecord = {
      id: s.id,
      source_feature: s.source_feature,
      purchase_ref: s.purchase_ref,
      payer_customer_id: s.payer_customer_id,
      booking_id: s.booking_id ?? null,
      cargo_booking_id: s.cargo_booking_id ?? null,
      voucher_id: s.voucher_id ?? null,
      idempotency_key: s.idempotency_key,
      status: s.status,
      provider: s.provider,
      currency: s.currency,
      amount_total: s.amount_total,
      voucher_amount: voucherAmount,
      card_amount: cardAmount,
      provider_fee: s.status === 'captured' && cardAmount > 0 ? Math.round(cardAmount * 0.029 * 100) / 100 : null,
      capture_attempts: s.capture_attempts ?? 0,
      last_error: s.last_error ?? null,
      started_at: s.started_at,
      expires_at: s.expires_at,
      authorised_at: s.authorised_at ?? null,
      confirmed_at: s.confirmed_at ?? null,
      captured_at: s.captured_at ?? null,
      voided_at: s.voided_at ?? null,
      capture_stalled_at: s.capture_stalled_at ?? null,
      created_at: s.started_at,
      updated_at: now,
      lines,
      attempts:
        s.provider === 'none'
          ? []
          : [
              {
                id: `${s.id}-attempt-1`,
                payment_id: s.id,
                provider_session_id: `cs_test_${s.id.slice(-6)}`,
                provider_intent_id: `pi_test_${s.id.slice(-6)}`,
                status:
                  s.status === 'captured' || s.status === 'authorised' || s.status === 'voided' || s.status === 'reversed'
                    ? 'authorised'
                    : 'failed',
                failure_code: s.status === 'failed' ? 'card_declined' : null,
                card_brand: s.card_brand ?? null,
                card_last4: s.card_last4 ?? null,
                created_at: s.started_at,
                updated_at: now,
              },
            ],
    }

    await repo.insert(payment)

    for (const receipt of [s.receipt, s.creditNote]) {
      if (!receipt) continue
      await repo.insertReceipt({
        id: receipt.id,
        payment_id: s.id,
        refund_id: receipt.refund_id ?? null,
        document_type: receipt.document_type,
        document_number: receipt.document_number,
        amount: receipt.amount,
        billing_name: receipt.billing_name ?? null,
        issued_at: receipt.issued_at,
        created_at: receipt.issued_at,
      })
    }

    if (s.exception) {
      await repo.saveException(s.exception)
    }
  }
}
