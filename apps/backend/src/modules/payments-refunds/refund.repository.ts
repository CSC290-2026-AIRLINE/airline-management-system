import { DEMO_CUSTOMER_ID, MOCK_BOOKINGS } from './mock-refund-state'
import { REFUND_REPOSITORY } from './refund-repository.interface'
import type { RefundRepository } from './refund-repository.interface'
import type {
  BookingInfo,
  FlightCancellation,
  PaidOnFlight,
  PaidPayment,
  RefundablePayment,
  RefundRecord,
  VoucherRecord,
} from './refund.types'

export { REFUND_REPOSITORY }
export type { RefundRepository }

/** The mock repository. Rows live in maps for the life of the process; nothing is written anywhere. Used by the tests. */
export class InMemoryRefundRepository implements RefundRepository {
  private readonly refunds = new Map<string, RefundRecord>()
  private readonly vouchers = new Map<string, VoucherRecord>()
  private lastNumber = 0

  listRefunds(): Promise<RefundRecord[]> {
    return Promise.resolve([...this.refunds.values()])
  }

  findRefundById(id: string): Promise<RefundRecord | undefined> {
    return Promise.resolve(this.refunds.get(id))
  }

  findRefundByReference(reference: string): Promise<RefundRecord | undefined> {
    const wanted = reference.trim().toUpperCase()
    return Promise.resolve([...this.refunds.values()].find((refund) => refund.reference.toUpperCase() === wanted))
  }

  insertRefund(refund: RefundRecord): Promise<RefundRecord> {
    if (!refund.reference) {
      this.lastNumber += 1
      refund.reference = `REF-${pad(this.lastNumber)}`
    } else {
      const match = /^REF-(\d+)$/.exec(refund.reference)
      if (match) this.lastNumber = Math.max(this.lastNumber, Number(match[1]))
    }
    this.refunds.set(refund.id, refund)
    return Promise.resolve(refund)
  }

  updateRefund(refund: RefundRecord): Promise<RefundRecord> {
    this.refunds.set(refund.id, refund)
    return Promise.resolve(refund)
  }

  async saveRefundWithVoucher(refund: RefundRecord, voucher: VoucherRecord, mode: 'insert' | 'update') {
    const saved = mode === 'insert' ? await this.insertRefund(refund) : await this.updateRefund(refund)
    this.vouchers.set(voucher.id, voucher)
    return { refund: saved, voucher }
  }

  /** The cancelled flights the tests queue up, and the events already handled. */
  readonly cancellations: FlightCancellation[] = []
  readonly paidOnFlight = new Map<string, PaidOnFlight[]>()
  readonly handledEvents = new Set<string>()

  listUnprocessedFlightCancellations(): Promise<FlightCancellation[]> {
    return Promise.resolve(this.cancellations.filter((event) => !this.handledEvents.has(event.event_id)).sort((a, b) => a.seq - b.seq))
  }

  listPaidLinesOnFlight(flightId: string): Promise<PaidOnFlight[]> {
    return Promise.resolve(this.paidOnFlight.get(flightId) ?? [])
  }

  readonly paidPayments = new Map<string, PaidPayment>()

  findPaidPayment(paymentId: string): Promise<PaidPayment | undefined> {
    return Promise.resolve(this.paidPayments.get(paymentId))
  }

  async insertFlightRefunds(eventId: string, refunds: RefundRecord[]): Promise<RefundRecord[]> {
    const known = new Set([...this.refunds.values()].map((refund) => refund.source_key))
    const created: RefundRecord[] = []
    for (const refund of refunds) {
      if (known.has(refund.source_key)) continue
      created.push(await this.insertRefund(refund))
    }
    this.handledEvents.add(eventId)
    return created
  }

  expireDueVouchers(now: Date): Promise<number> {
    let count = 0
    for (const voucher of this.vouchers.values()) {
      if (voucher.status === 'active' && voucher.expires_at.getTime() <= now.getTime()) {
        voucher.status = 'expired'
        count += 1
      }
    }
    return Promise.resolve(count)
  }

  listVouchers(): Promise<VoucherRecord[]> {
    return Promise.resolve([...this.vouchers.values()])
  }

  findVoucherById(id: string): Promise<VoucherRecord | undefined> {
    return Promise.resolve(this.vouchers.get(id))
  }

  findVoucherByCode(code: string): Promise<VoucherRecord | undefined> {
    return Promise.resolve([...this.vouchers.values()].find((voucher) => voucher.code === code))
  }

  insertVoucher(voucher: VoucherRecord): Promise<VoucherRecord> {
    this.vouchers.set(voucher.id, voucher)
    return Promise.resolve(voucher)
  }

  updateVoucher(voucher: VoucherRecord): Promise<VoucherRecord> {
    this.vouchers.set(voucher.id, voucher)
    return Promise.resolve(voucher)
  }

  findBooking(reference: string): Promise<BookingInfo | undefined> {
    const found = MOCK_BOOKINGS[reference]
    return Promise.resolve(found ? { ...found, currency: 'USD', total: 1000 } : undefined)
  }

  resolveCustomerId(userId: string): Promise<string | undefined> {
    void userId
    return Promise.resolve(DEMO_CUSTOMER_ID)
  }

  listRefundable(customerId: string): Promise<RefundablePayment[]> {
    const mine = Object.values(MOCK_BOOKINGS).filter((booking) => booking.customer_id === customerId)
    return Promise.resolve(
      mine.map((booking) => ({
        booking: { ...booking, currency: 'USD', total: 1000 },
        total: 1000,
        lines: [
          { payment_line_id: null, description: 'Seat 12A', amount: 18, remaining: 18 },
          { payment_line_id: null, description: 'Extra baggage · 1 × 20 kg · FY214', amount: 45, remaining: 45 },
        ],
      })),
    )
  }

  voucherValidMonths(): Promise<number> {
    return Promise.resolve(12)
  }
}

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

/** `121` → `0121`, the way a reference is written. */
export function pad(number: number): string {
  return String(number).padStart(4, '0')
}

/** A stable id for a seed row, so a test can name the row it means. */
function refundId(number: number): string {
  return `ref_00000000-0000-4000-8000-00000000${pad(number)}`
}

function voucherId(suffix: string): string {
  return `vch_00000000-0000-4000-8000-00000000${suffix}`
}

/** The booking's payment and card, for a seed row. */
function bookingOf(reference: string): BookingInfo {
  const found = MOCK_BOOKINGS[reference]
  if (!found) throw new Error(`The seed names booking ${reference}, which the mock does not know`)
  return { ...found, currency: 'USD', total: 1000 }
}

type SeedRefund = Omit<Partial<RefundRecord>, 'context'> &
  Pick<RefundRecord, 'reason' | 'method' | 'status' | 'amount'> & {
    number: number
    booking: string
    item: string
    requested_at: Date
    context?: Partial<RefundRecord['context']>
  }

/** Fills in what every seed row shares, so a row below only says what is really its own. */
function refund(seed: SeedRefund): RefundRecord {
  const { booking, item, context, number, ...rest } = seed
  const known = bookingOf(booking)
  const amount = seed.amount
  return {
    id: refundId(number),
    reference: `REF-${pad(number)}`,
    payment_id: known.payment_id,
    payment_line_id: null,
    source_key: `${seed.reason}:${known.reference}:${number}`,
    voucher_amount: seed.method === 'voucher' ? amount : 0,
    fee_withheld: 0,
    provider_refund_id: null,
    requested_by_user_id: null,
    case_compensation_id: null,
    audit_log_id: null,
    decision_note: null,
    failure_reason: null,
    completed_at: null,
    created_at: seed.requested_at,
    updated_at: seed.completed_at ?? seed.requested_at,
    ...rest,
    context: {
      customer_id: known.customer_id,
      booking_reference: known.reference,
      item,
      customer_reason: null,
      fare_rule: 'inside',
      fare_rule_label: 'Inside rules',
      fare_rule_note: 'This request is inside the fare rules.',
      paid_by: `Card ${known.card_last4} (${amount.toFixed(2)}) · no voucher`,
      card_brand: known.card_brand,
      card_last4: known.card_last4,
      credit_note_number: null,
      voucher_code: null,
      decided_at: seed.completed_at ?? null,
      decided_by: null,
      override: false,
      older: false,
      ...context,
    },
  }
}

/**
 * The refunds the mock starts with: the frames' own rows.
 *
 * Three refunds wait in the queue (REF-0121, 0122 and 0123), two have been paid out (REF-0113 to the card, REF-0098 as a
 * voucher) and one was rejected a while ago (REF-0090). Two card refunds and a refund-as-voucher belong to the
 * compensation page rather than the queue.
 *
 * The times are relative to `now`, the simulation clock, so "requested today" stays today.
 *
 * REF-0123 is a rebook difference of 0.00, because that is what the frame shows. The schema says `refund.amount > 0`, so a
 * real row like it cannot exist — a question for the reviewer before the real repository is written.
 */
export function buildSeedRefunds(now: Date): RefundRecord[] {
  const at = (msAgo: number) => new Date(now.getTime() - msAgo)
  return [
    refund({
      number: 121,
      reason: 'customer_request',
      method: 'original',
      status: 'requested',
      amount: 45,
      booking: 'K7QF2M',
      item: 'Extra baggage · 1 × 20 kg · FY214',
      requested_at: at(2 * HOUR),
      context: {
        customer_reason: 'I no longer need the extra baggage.',
        fare_rule_label: 'Inside rules',
        fare_rule_note: 'This request is inside the fare rules, but baggage was already checked in online, so it came here for review.',
      },
    }),
    refund({
      number: 122,
      reason: 'customer_cancel',
      method: 'original',
      status: 'requested',
      amount: 210,
      booking: 'R5NH7C',
      item: 'Fare · 1 adult · FY214',
      requested_at: at(3 * HOUR),
      context: {
        customer_reason: 'Family emergency, travel no longer possible.',
        fare_rule: 'outside',
        fare_rule_label: 'Outside rules (non-refundable fare)',
        fare_rule_note:
          'A refund outside the fare rules needs an override. The override and your name are logged in the audit trail (feature 15).',
      },
    }),
    refund({
      number: 123,
      reason: 'rebook_difference',
      method: 'original',
      status: 'requested',
      amount: 0,
      booking: 'T9WE2L',
      item: 'Fare difference · rebooked flight',
      requested_at: at(5 * HOUR),
      context: {
        customer_reason: null,
        fare_rule_label: 'Inside rules',
        fare_rule_note: 'The rebooked flight costs the same, so there is nothing to return unless staff decide otherwise.',
        paid_by: 'Card 4242 (0.00) · no voucher',
      },
    }),
    refund({
      number: 113,
      reason: 'customer_request',
      method: 'original',
      status: 'succeeded',
      amount: 18,
      booking: 'K7QF2M',
      item: 'Seat 12B',
      requested_at: at(8 * DAY),
      completed_at: at(6 * DAY),
      provider_refund_id: 'RF-0113',
      decision_note: 'Approved.',
      context: { credit_note_number: 'CRN-0007', decided_by: 'staff_demo', customer_reason: 'The seat does not recline.' },
    }),
    refund({
      number: 98,
      reason: 'flight_cancelled',
      method: 'voucher',
      status: 'succeeded',
      amount: 150,
      booking: 'Q2LV8R',
      item: 'Flight FY088 cancelled',
      requested_at: at(15 * DAY),
      completed_at: at(15 * DAY),
      decision_note: 'Flight cancelled. Reissued as a voucher.',
      context: { voucher_code: 'VCH-7K2M-91QD', decided_by: 'system' },
    }),
    refund({
      number: 90,
      reason: 'customer_request',
      method: 'original',
      status: 'rejected',
      amount: 30,
      booking: 'M3XP9D',
      item: 'Upgrade',
      requested_at: at(40 * DAY),
      decision_note: 'Outside the fare rules. Staff note: upgrade was already used on the flight.',
      context: {
        decided_at: at(39 * DAY),
        decided_by: 'staff_demo',
        fare_rule: 'outside',
        fare_rule_label: 'Outside rules (upgrade used)',
        fare_rule_note: 'An upgrade that was used on the flight is not refundable.',
        older: true,
      },
    }),
    /* The compensation page's card refunds and refund-as-voucher, which the queue does not list. */
    refund({
      number: 127,
      reason: 'staff_adjustment',
      method: 'original',
      status: 'succeeded',
      amount: 60,
      booking: 'H2JD6A',
      item: 'Seat map error',
      requested_at: at(14 * DAY),
      completed_at: at(13 * DAY),
      provider_refund_id: 'RF-0127',
      decision_note: 'Seat map error',
      context: { decided_by: 'staff_demo' },
    }),
    refund({
      number: 131,
      reason: 'staff_adjustment',
      method: 'original',
      status: 'processing',
      amount: 25,
      booking: 'F6RW9K',
      item: 'Charged twice for seat',
      requested_at: at(1 * DAY),
      provider_refund_id: 'RF-0131',
      decision_note: 'Charged twice for seat',
      context: { decided_at: at(1 * DAY), decided_by: 'staff_demo' },
    }),
    refund({
      number: 96,
      reason: 'staff_adjustment',
      method: 'voucher',
      status: 'succeeded',
      amount: 75,
      booking: 'B8TN4W',
      item: 'Refund as voucher',
      requested_at: at(21 * DAY),
      completed_at: at(21 * DAY),
      decision_note: 'Refund as voucher',
      context: { voucher_code: 'VCH-1B6E-20WK', decided_by: 'staff_demo' },
    }),
  ]
}

/** The vouchers the mock starts with: three, one of them close to its end, one already used. */
export function buildSeedVouchers(now: Date): VoucherRecord[] {
  const at = (ms: number) => new Date(now.getTime() + ms)
  return [
    {
      id: voucherId('7K2M'),
      code: 'VCH-7K2M-91QD',
      customer_id: DEMO_CUSTOMER_ID,
      amount: 150,
      currency: 'USD',
      status: 'active',
      case_compensation_id: null,
      refund_id: refundId(98),
      issued_at: at(-15 * DAY),
      expires_at: at(350 * DAY),
      redeemed_at: null,
      cancel_reason: null,
      created_at: at(-15 * DAY),
      updated_at: at(-15 * DAY),
      booking_reference: 'Q2LV8R',
      note: 'Flight cancelled',
      description: 'Issued for cancelled flight FY088',
      used_on: null,
    },
    {
      id: voucherId('3D8A'),
      code: 'VCH-3D8A-55TR',
      customer_id: DEMO_CUSTOMER_ID,
      amount: 40,
      currency: 'USD',
      status: 'active',
      case_compensation_id: 'cc_00000000-0000-4000-8000-000000000001',
      refund_id: null,
      issued_at: at(-16 * DAY),
      expires_at: at(9 * DAY),
      redeemed_at: null,
      cancel_reason: null,
      created_at: at(-16 * DAY),
      updated_at: at(-16 * DAY),
      booking_reference: 'M3XP9D',
      note: 'Delay over 3 hours',
      description: 'Compensation · delay on FY102',
      used_on: null,
    },
    {
      id: voucherId('1B6E'),
      code: 'VCH-1B6E-20WK',
      customer_id: DEMO_CUSTOMER_ID,
      amount: 75,
      currency: 'USD',
      status: 'redeemed',
      case_compensation_id: null,
      refund_id: refundId(96),
      issued_at: at(-21 * DAY),
      expires_at: at(344 * DAY),
      redeemed_at: at(-23 * DAY + 4 * DAY),
      cancel_reason: null,
      created_at: at(-21 * DAY),
      updated_at: at(-19 * DAY),
      booking_reference: 'B8TN4W',
      note: 'Refund as voucher',
      description: 'Issued as the voucher share of a refund',
      used_on: 'Used on booking M3XP9D',
    },
  ]
}

/** Loads the seed rows into a repository. The mock is seeded when the module starts. */
export async function seedRepository(repo: InMemoryRefundRepository, refunds: RefundRecord[], vouchers: VoucherRecord[]): Promise<void> {
  for (const row of refunds) await repo.insertRefund(row)
  for (const row of vouchers) await repo.insertVoucher(row)
}
