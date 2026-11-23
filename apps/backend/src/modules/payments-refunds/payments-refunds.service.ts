import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { RefundSettlement } from '@backend/modules/payments-checkout/card-refund.types'
import { PaymentErrorCode, paymentFailure } from '@backend/modules/payments-crew-pay/payments.errors'
import type { RefundReason } from './refund-status'
import { CARD_REFUND_PORT } from './card-refund.port'
import type { CardRefundPort } from './card-refund.port'
import type {
  CompensationEntryDto,
  CompensationListDto,
  MyRefundDto,
  MyRefundListDto,
  MyVoucherDto,
  MyVoucherListDto,
  VoucherValidationDto,
  RefundableListDto,
  RefundDetailDto,
  RefundQueueListDto,
  RefundSummaryDto,
} from './dto/payments-refunds.types'
import type { CompensationQueryDto, MyRefundQueryDto, RefundQueueQueryDto } from './dto/refund-query.dto'
import type {
  CreateRefundRequestDto,
  IssueCompensationDto,
  RefundDecisionDto,
  ValidateVoucherDto,
  VoidVoucherDto,
} from './dto/refund-action.dto'
import { REFUND_REPOSITORY } from './refund-repository.interface'
import type { RefundRepository } from './refund-repository.interface'
import {
  cardRefundLabel,
  COMPENSATION_REASONS,
  customerRefundLabel,
  EXPIRING_SOON_DAYS,
  myRefundTabFor,
  queueTabFor,
  REFUND_REASON_LABELS,
  staffRefundLabel,
  voucherLabel,
} from './refund-status'
import type { BookingInfo, FlightCancellation, RefundRecord, VoucherRecord } from './refund.types'

const DAY = 24 * 60 * 60 * 1000
const CURRENCY = 'USD'
/** The characters a voucher code may use. The schema leaves out the ones that are easy to misread (I, O, 0, 1). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** `REF-0121`. */
function referenceOf(refund: RefundRecord): string {
  return refund.reference
}

/** The id the provider knows a card refund by: `RF-` and the reference's number (`RF-0121`, `RF-3FA9C21B`). */
function providerRefundOf(refund: RefundRecord): string {
  return `RF-${refund.reference.replace(/^REF-/, '')}`
}

/** True when a refund is one the compensation page owns rather than the queue the customer's requests go through. */
function isCompensation(refund: RefundRecord): boolean {
  return COMPENSATION_REASONS.includes(refund.reason)
}

/** The first characters of a text, lower-cased, for a search box that does not care about case. */
function matches(search: string | undefined, ...values: (string | null | undefined)[]): boolean {
  const needle = search?.trim().toLowerCase()
  if (!needle) return true
  return values.some((value) => value?.toLowerCase().includes(needle))
}

/**
 * Feature 5b: refunds, vouchers and compensation.
 *
 * It reads and writes through `RefundRepository`, so the mock's in-memory rows and the real tables are one swap apart.
 * Money never moves here: an approval to the card is a state the gateway will finish (5a's provider), and a voucher is
 * a row.
 *
 * Every staff decision is written to the audit trail with the staff member's name and the reason, as the frames say.
 *
 * TODO(F5b): the fare rule check comes from Feature 4's `quote-fee` (in-process), the compensation requests from
 * Feature 13's `case_compensation`. Each is a mock field today and carries its own TODO.
 *
 * A card refund goes back through Feature 5a's provider (`CardRefundPort`): the refund is `processing` while the provider
 * works, `succeeded` with a credit note when the money is on its way back, `failed` with the provider's reason when it
 * is not. The provider can answer later, by webhook (`settleFromProvider`). Without the port a card refund stays
 * `processing`, as it did before a provider was connected.
 */
@Injectable()
export class PaymentsRefundsService {
  private readonly logger = new Logger(PaymentsRefundsService.name)

  constructor(
    @Inject(REFUND_REPOSITORY) private readonly repo: RefundRepository,
    private readonly clock: SimulationClock,
    private readonly audit: AuditService,
    @Optional() @Inject(CARD_REFUND_PORT) private readonly cardRefunds?: CardRefundPort,
  ) {}

  /* ---- Staff: the refund queue --------------------------------------------------------------------------- */

  /** The queue, newest first, with the counts the frames show on the tabs. */
  async listQueue(query: RefundQueueQueryDto): Promise<RefundQueueListDto> {
    const all = (await this.repo.listRefunds()).filter((refund) => !isCompensation(refund) && !refund.context.older)
    const searched = all.filter((refund) => matches(query.search, referenceOf(refund), refund.context.booking_reference))

    const counts = { all: searched.length, needs_review: 0, done: 0 }
    for (const refund of searched) counts[queueTabFor(refund.status)] += 1

    const tab = query.tab ?? 'all'
    const rows = searched
      .filter((refund) => tab === 'all' || queueTabFor(refund.status) === tab)
      .sort((a, b) => b.requested_at.getTime() - a.requested_at.getTime())
    return { items: rows.map((refund) => this.toSummary(refund)), total: rows.length, counts }
  }

  /** One refund, by id or by the reference staff read out loud. */
  async getStaffRefund(idOrReference: string): Promise<RefundDetailDto> {
    return this.toDetail(await this.requireRefund(idOrReference))
  }

  /**
   * Decides a refund that is waiting in the queue.
   *
   * - `approve_card` — the money goes back to the card. The refund is `processing` until the provider confirms it, which
   *   is why the frames call it "Paying to card".
   * - `approve_voucher` — the money comes back as a new single-use voucher, so the refund is done at once.
   * - `reject` — nothing is refunded, and the customer is told why.
   *
   * A refund outside the fare rules needs an override: it is approved anyway, and the override and the staff member's
   * name go in the audit trail. A rejection needs no override.
   */
  async decide(idOrReference: string, actorId: string, dto: RefundDecisionDto): Promise<RefundDetailDto> {
    const refund = await this.requireRefund(idOrReference)
    const waiting = refund.status === 'requested' || refund.status === 'pending_approval'
    /* A refund whose payout failed stays in the queue for a person to look at, who can still return it as a voucher or reject it. */
    if (!waiting && refund.status !== 'failed') {
      throw new ConflictException(
        `${referenceOf(refund)} is ${staffRefundLabel(refund.status, refund.method).toLowerCase()} and cannot be decided again`,
      )
    }
    if (refund.status === 'failed' && dto.decision === 'approve_card') {
      /* Sending it again could pay the customer twice when the first answer was lost, so it is not offered from here. */
      throw new ConflictException(
        `${referenceOf(refund)}'s payout to the card failed and is not sent again from here; return it as a voucher or reject it`,
      )
    }
    if (isCompensation(refund)) {
      throw new ConflictException(`${referenceOf(refund)} is a compensation, not a request in the queue`)
    }

    const before = refund.status
    const now = this.clock.now()
    const override = dto.decision !== 'reject' && refund.context.fare_rule === 'outside'
    // A refund the fare rules do not allow can only be approved by an admin, whose reason goes to the audit trail.
    if (override && (await this.audit.resolveActor(actorId).catch(() => null))?.role !== 'admin') {
      throw new ForbiddenException(
        paymentFailure(
          PaymentErrorCode.REFUND_NEEDS_APPROVAL,
          `${referenceOf(refund)} is outside the fare rules and needs an admin to approve it`,
        ),
      )
    }
    let voucher: VoucherRecord | undefined

    if (dto.decision === 'reject') {
      refund.status = 'rejected'
    } else if (dto.decision === 'approve_card') {
      refund.status = 'processing'
      refund.method = 'original'
      refund.voucher_amount = 0
      /* The provider names the refund once it has it; without a provider the module keeps its own placeholder. */
      refund.provider_refund_id = this.cardRefunds ? null : providerRefundOf(refund)
    } else {
      refund.method = 'voucher'
      refund.voucher_amount = refund.amount
      refund.provider_refund_id = null
      refund.failure_reason = null
      refund.status = 'succeeded'
      refund.completed_at = now
      voucher = await this.newVoucher({
        customerId: refund.context.customer_id,
        amount: refund.amount,
        currency: await this.currencyOf(refund),
        booking: refund.context.booking_reference,
        refundId: refund.id,
        note: dto.reason,
        description: `Issued for refund ${referenceOf(refund)}`,
      })
      refund.context.voucher_code = voucher.code
    }

    refund.decision_note = dto.reason
    refund.updated_at = now
    refund.context.decided_at = now
    refund.context.decided_by = actorId
    refund.context.override = override
    /* A voucher and the refund that returns it are saved together, so one never exists without the other. */
    if (voucher) await this.repo.saveRefundWithVoucher(refund, voucher, 'update')
    else await this.repo.updateRefund(refund)

    await this.writeAudit(actorId, {
      action: 'status_change',
      entityType: 'refund',
      entityId: refund.id,
      summary: `${referenceOf(refund)} ${dto.decision === 'reject' ? 'rejected' : 'approved'} (${dto.decision})${override ? ' with a fare-rule override' : ''}`,
      reason: dto.reason,
      before: { status: before },
      after: { status: refund.status, method: refund.method, override },
    })

    /* The decision is saved as "paying to card" before the provider is asked, so a refund is never lost between the two. */
    if (dto.decision === 'approve_card') await this.payToCard(refund, actorId)

    return this.toDetail(refund)
  }

  /**
   * A provider's late word on a card refund (Stripe's webhook, handed on by 5a). A repeat does nothing: a refund that is
   * already settled is left alone. A refund that failed but later succeeded is honoured — the provider's word is the
   * truth about the money.
   */
  async settleFromProvider(settlement: RefundSettlement): Promise<void> {
    if (!this.cardRefunds) return
    const refund = await this.repo.findRefundById(settlement.refund_id)
    if (!refund || refund.method !== 'original') {
      this.logger.warn(`A provider event names refund ${settlement.refund_id}, which is not a card refund here`)
      return
    }
    const outcome = {
      status: settlement.outcome,
      provider_refund_id: settlement.provider_refund_id,
      failure_code: settlement.failure_code,
    } as const
    if (settlement.outcome === 'succeeded' && (refund.status === 'processing' || refund.status === 'failed')) {
      await this.settleCardPayout(refund, outcome, null)
    } else if (settlement.outcome === 'failed' && refund.status === 'processing') {
      await this.settleCardPayout(refund, outcome, null)
    }
  }

  /** Asks the provider to send an approved card refund back, and records what it says. */
  private async payToCard(refund: RefundRecord, actorId: string | null): Promise<void> {
    if (!this.cardRefunds) return
    // A mixed payment returns the voucher's share as a new voucher, so only the card's share goes back to the card.
    const outcome = await this.cardRefunds.refundToCard({
      payment_id: refund.payment_id,
      refund_id: refund.id,
      amount: Math.round((refund.amount - refund.voucher_amount) * 100) / 100,
    })
    await this.settleCardPayout(refund, outcome, actorId)
  }

  /**
   * Records how a card refund ended. `pending` only notes the provider's id and waits for the webhook.
   *
   * On success the credit note comes first and the refund is marked `succeeded` after it: the credit note names the
   * refund (which is saved by now) and a repeat finds the same note, so a failure between the two is mended by the next
   * try rather than leaving a refund with no document.
   */
  private async settleCardPayout(
    refund: RefundRecord,
    outcome: { status: 'succeeded' | 'pending' | 'failed'; provider_refund_id: string | null; failure_code: string | null },
    actorId: string | null,
  ): Promise<void> {
    const port = this.cardRefunds
    if (!port) return
    const before = refund.status
    const now = this.clock.now()
    if (outcome.provider_refund_id) refund.provider_refund_id = outcome.provider_refund_id
    refund.updated_at = now

    if (outcome.status === 'pending') {
      await this.repo.updateRefund(refund)
      return
    }

    if (outcome.status === 'succeeded') {
      const note = await port.recordRefundSucceeded({
        payment_id: refund.payment_id,
        refund_id: refund.id,
        amount: refund.amount,
        fully_refunded: await this.leavesNothing(refund),
      })
      refund.status = 'succeeded'
      refund.completed_at = now
      refund.failure_reason = null
      refund.context.credit_note_number = note.credit_note_number
      await this.repo.updateRefund(refund)
    } else {
      refund.status = 'failed'
      refund.completed_at = null
      refund.failure_reason = outcome.failure_code ?? 'refund_failed'
      await this.repo.updateRefund(refund)
      await port.recordRefundFailed(refund.payment_id)
    }

    await this.writeAudit(actorId, {
      action: 'status_change',
      entityType: 'refund',
      entityId: refund.id,
      summary: `${referenceOf(refund)} card payout ${refund.status}${refund.status === 'failed' ? ` (${refund.failure_reason})` : ''}`,
      reason: refund.failure_reason,
      before: { status: before },
      after: { status: refund.status, provider_refund_id: refund.provider_refund_id, credit_note: refund.context.credit_note_number },
    })
  }

  /**
   * True when this refund, with the others on the payment, gives back everything the payment took: nothing is still
   * waiting on the provider, and the refunds that count add up to the payment's total. The payment is then `reversed`.
   */
  private async leavesNothing(refund: RefundRecord): Promise<boolean> {
    const booking = await this.repo.findBooking(refund.context.booking_reference)
    if (!booking || booking.payment_id !== refund.payment_id) return false
    const others = (await this.repo.listRefunds()).filter(
      (other) =>
        other.payment_id === refund.payment_id &&
        other.id !== refund.id &&
        other.status !== 'rejected' &&
        other.status !== 'failed' &&
        /* A voucher given as goodwill is store credit, not money taken back out of the payment (see `issueCompensation`). */
        !(other.reason === 'staff_adjustment' && other.method === 'voucher'),
    )
    if (others.some((other) => other.status !== 'succeeded')) return false
    const cents = (value: number) => Math.round(value * 100)
    return cents(others.reduce((sum, other) => sum + other.amount, 0) + refund.amount) >= cents(booking.total)
  }

  /* ---- Customer: My refunds and My vouchers --------------------------------------------------------------- */

  /** The signed-in customer's refunds, newest first, with the counts the frames show on the tabs. */
  async listMyRefunds(userId: string, query: MyRefundQueryDto): Promise<MyRefundListDto> {
    const customerId = await this.repo.resolveCustomerId(userId)
    const mine = (await this.repo.listRefunds()).filter((refund) => refund.context.customer_id === customerId && !isCompensation(refund))
    const searched = mine.filter((refund) => matches(query.search, referenceOf(refund), refund.context.booking_reference))

    const counts = { all: searched.length, in_progress: 0, refunded: 0, rejected: 0 }
    for (const refund of searched) counts[myRefundTabFor(refund.status)] += 1

    const tab = query.tab ?? 'all'
    const rows = searched
      .filter((refund) => tab === 'all' || myRefundTabFor(refund.status) === tab)
      .sort((a, b) => b.requested_at.getTime() - a.requested_at.getTime())
    return { items: rows.map((refund) => this.toMyRefund(refund)), total: rows.length, counts }
  }

  /** One of the signed-in customer's refunds. 404 when it is not theirs. */
  async getMyRefund(userId: string, idOrReference: string): Promise<MyRefundDto> {
    const refund = await this.requireRefund(idOrReference)
    if (refund.context.customer_id !== (await this.repo.resolveCustomerId(userId)) || isCompensation(refund)) {
      throw new NotFoundException(paymentFailure(PaymentErrorCode.REFUND_NOT_FOUND, `Refund ${idOrReference} not found`))
    }
    return this.toMyRefund(refund)
  }

  /**
   * The customer's "Request a refund" dialog.
   *
   * The request waits for a person: the frame says "now awaiting review", and "anything else goes to our staff, who
   * reply within 2 working days". A request inside the fare rules is refunded without staff, which is Feature 4's quote
   * and the payment provider — both still to come, so every request is queued today.
   */
  async requestRefund(userId: string, dto: CreateRefundRequestDto): Promise<MyRefundDto> {
    const customerId = await this.repo.resolveCustomerId(userId)
    const booking = customerId ? await this.repo.findBooking(dto.booking_reference) : undefined
    /* Another customer's purchase answers the same as one that does not exist. */
    if (!customerId || !booking || booking.customer_id !== customerId) {
      throw new NotFoundException(`Booking ${dto.booking_reference} not found`)
    }

    /* The line asked about must be on the payment, and the amount no more than what is left on it. */
    const payment = (await this.repo.listRefundable(customerId)).find((candidate) => candidate.booking.reference === booking.reference)
    const line = payment?.lines.find((candidate) => candidate.description === dto.item)
    if (!payment || !line) throw new NotFoundException(`${dto.item} is not on a payment of booking ${booking.reference}`)
    /* A request for the same line that is already waiting is answered first: it is more useful than "nothing left". */
    const open = (await this.repo.listRefunds()).find(
      (refund) =>
        refund.context.booking_reference === booking.reference &&
        refund.context.item === dto.item &&
        (refund.status === 'requested' || refund.status === 'pending_approval'),
    )
    if (open) {
      throw new ConflictException(`${referenceOf(open)} already asks for a refund of ${dto.item} on ${booking.reference}`)
    }

    if (dto.amount > line.remaining) {
      throw new UnprocessableEntityException(
        paymentFailure(
          PaymentErrorCode.REFUND_EXCEEDS_PAID,
          line.remaining > 0
            ? `You can ask for at most ${line.remaining.toFixed(2)} ${booking.currency} for ${dto.item}`
            : `${dto.item} has nothing left to refund`,
          { refundable: line.remaining },
        ),
      )
    }

    const now = this.clock.now()
    const id = crypto.randomUUID()
    const refund: RefundRecord = {
      id,
      reference: '',
      payment_id: booking.payment_id,
      payment_line_id: line.payment_line_id,
      source_key: `customer_request:${id}`,
      reason: 'customer_request',
      method: 'original',
      status: 'requested',
      amount: dto.amount,
      voucher_amount: 0,
      fee_withheld: 0,
      provider_refund_id: null,
      requested_by_user_id: userId,
      case_compensation_id: null,
      audit_log_id: null,
      decision_note: null,
      failure_reason: null,
      requested_at: now,
      completed_at: null,
      created_at: now,
      updated_at: now,
      context: {
        customer_id: customerId,
        booking_reference: booking.reference,
        item: dto.item,
        customer_reason: dto.reason,
        fare_rule: 'inside',
        fare_rule_label: 'Inside rules',
        fare_rule_note: 'This request is inside the fare rules.',
        paid_by: this.paidBy(booking, payment.total),
        card_brand: booking.card_brand,
        card_last4: booking.card_last4,
        credit_note_number: null,
        voucher_code: null,
        decided_at: null,
        decided_by: null,
        override: false,
        older: false,
      },
    }
    const saved = await this.repo.insertRefund(refund)

    /* The refund table has no column for the line or the customer's own words, so they go in the audit trail with the request. */
    await this.writeAudit(userId, {
      action: 'create',
      entityType: 'refund',
      entityId: saved.id,
      summary: `${referenceOf(saved)} requested: ${dto.amount.toFixed(2)} ${booking.currency} for ${dto.item} on ${booking.reference}`,
      reason: dto.reason,
      after: { status: 'requested', item: dto.item, amount: dto.amount, customer_reason: dto.reason, booking_reference: booking.reference },
    })
    return this.toMyRefund(saved)
  }

  /**
   * Refunds every paid coupon of a cancelled flight, once per `flight_event`.
   *
   * It works from 5b's own `payment_line` rows (they point at coupons that carry the flight), so it never asks Feature 3
   * what status a coupon has, and Feature 3 never asks it. One refund per payment, split across that payment's lines,
   * 100% of the fare, award-fee and seat-fee lines, no fee, back to the original method. `source_key` is
   * `flight_cancelled:<event id>:<payment id>`, and the event's receipt is saved in the same transaction as the refunds,
   * so a replay (or a crash between the two) finds either everything or nothing and pays nobody twice.
   */
  async handleFlightCancelled(event: FlightCancellation): Promise<{ refunds: number }> {
    const paid = await this.repo.listPaidLinesOnFlight(event.flight_id)
    const now = this.clock.now()
    const drafts: RefundRecord[] = paid.map(({ booking, lines }) => {
      const id = crypto.randomUUID()
      const cents = lines.reduce((sum, line) => sum + Math.round(line.remaining * 100), 0)
      return {
        id,
        reference: '',
        payment_id: booking.payment_id,
        payment_line_id: null,
        lines: lines.map((line) => ({ payment_line_id: line.payment_line_id, amount: line.remaining })),
        source_key: `flight_cancelled:${event.event_id}:${booking.payment_id}`,
        reason: 'flight_cancelled',
        method: 'original',
        /* It is already approved by the airline's own decision; the card is asked next and `processing` says so. */
        status: 'processing',
        amount: cents / 100,
        voucher_amount: 0,
        fee_withheld: 0,
        provider_refund_id: null,
        requested_by_user_id: null,
        case_compensation_id: null,
        audit_log_id: null,
        decision_note: 'The airline cancelled the flight',
        failure_reason: null,
        requested_at: now,
        completed_at: null,
        created_at: now,
        updated_at: now,
        context: {
          customer_id: booking.customer_id,
          booking_reference: booking.reference,
          item: lines.map((line) => line.description).join(', '),
          customer_reason: null,
          fare_rule: 'inside',
          fare_rule_label: 'Flight cancelled by the airline',
          fare_rule_note: 'A cancelled flight is refunded in full, with no fee.',
          paid_by: this.paidBy(booking),
          card_brand: booking.card_brand,
          card_last4: booking.card_last4,
          credit_note_number: null,
          voucher_code: null,
          decided_at: now,
          decided_by: null,
          override: false,
          older: false,
        },
      }
    })

    const created = await this.repo.insertFlightRefunds(event.event_id, drafts, now)
    for (const refund of created) {
      await this.writeAudit(null, {
        action: 'create',
        entityType: 'refund',
        entityId: refund.id,
        summary: `${referenceOf(refund)} refunds ${refund.amount.toFixed(2)} ${refund.context.booking_reference} for a cancelled flight`,
        reason: refund.decision_note,
        after: { status: refund.status, source_key: refund.source_key, flight_event_id: event.event_id },
      })
      /* A failed payout stays on the refund (and in the staff exception list); one bad card must not stop the others. */
      if (this.cardRefunds)
        await this.payToCard(refund, null).catch((error: unknown) => this.logger.error(`Refund ${refund.id}: ${String(error)}`))
      else {
        refund.provider_refund_id = providerRefundOf(refund)
        await this.repo.updateRefund(refund)
      }
    }
    return { refunds: created.length }
  }

  /**
   * Feature 3 cancelled a booking and says how much to give back (fare lines less the cancellation fee, which 3 gets from
   * Feature 4). One `customer_cancel` refund is made against the booking's payment, split across its lines, once per
   * booking (`source_key = customer_cancel:<booking id>`), and a replay finds it and does nothing.
   *
   * A payment that used a voucher is refunded pro rata: the voucher's share comes back as a new voucher and the rest goes
   * to the card, with any rounding remainder on the card. The fee kept is stored on the refund (`fee_withheld`), so the
   * amount can be explained later.
   */
  async refundCancelledBooking(input: {
    paymentId: string
    bookingId: string
    amount: number
    reason: string
  }): Promise<RefundRecord | undefined> {
    return this.refundPaidPayment({
      paymentId: input.paymentId,
      sourceKey: `customer_cancel:${input.bookingId}`,
      reason: 'customer_cancel',
      amount: input.amount,
      note: input.reason,
      label: 'Cancelled by the customer',
      rule: 'Fare less the cancellation fee from the fare rules.',
    })
  }

  /**
   * A customer cancels an onboard order (feature 12) that was already paid: the whole payment goes back, once per payment
   * (`source_key = order_cancel:<payment id>`), to the card. Feature 12 decides the amount.
   */
  async refundOnboardOrder(input: { paymentId: string; amount: number; note: string }): Promise<RefundRecord | undefined> {
    return this.refundPaidPayment({
      paymentId: input.paymentId,
      sourceKey: `order_cancel:${input.paymentId}`,
      reason: 'customer_cancel',
      amount: input.amount,
      note: input.note,
      label: 'Order cancelled by the customer',
      rule: 'An onboard order is refunded in full when it is cancelled.',
      lineTypes: ['onboard_order'],
    })
  }

  /**
   * Feature 17 cancels a cargo booking, rejects a shipment or re-weighs it lower, and says how much goes back: the whole
   * payment before acceptance, the part the fee and refundable percent leave after it, or the difference for a re-weigh.
   * `source_key` is per cargo booking (`cargo_cancel:<id>`, `cargo_rejected:<id>`), and a re-weigh is numbered
   * (`cargo_reweigh:<id>:<n>`) because a booking can be re-weighed more than once. A payment that was only authorised
   * (capture stalled) is not refunded: nothing was charged, so the caller voids it instead (`voidPayment`).
   */
  async refundCargoBooking(input: {
    paymentId: string
    cargoBookingId: string
    reason: 'cargo_cancel' | 'cargo_rejected' | 'cargo_reweigh'
    amount: number
    note: string
    reweighNo?: number
  }): Promise<RefundRecord | undefined> {
    const key = input.reason === 'cargo_reweigh' ? `${input.cargoBookingId}:${input.reweighNo ?? 1}` : input.cargoBookingId
    return this.refundPaidPayment({
      paymentId: input.paymentId,
      sourceKey: `${input.reason}:${key}`,
      reason: input.reason,
      amount: input.amount,
      note: input.note,
      label: { cargo_cancel: 'Cancelled by the shipper', cargo_rejected: 'Shipment rejected', cargo_reweigh: 'Re-weighed lower' }[
        input.reason
      ],
      rule: 'The amount Feature 17 worked out from its fee and refundable percent.',
      lineTypes: ['cargo_freight', 'cargo_surcharge'],
    })
  }

  /**
   * One refund of a captured payment, split across its lines in proportion to what each has left. It is once per
   * `source_key`, never more than is left, and a voucher's share comes back as a new voucher.
   */
  private async refundPaidPayment(input: {
    paymentId: string
    sourceKey: string
    reason: RefundReason
    amount: number
    note: string
    label: string
    rule: string
    lineTypes?: string[]
  }): Promise<RefundRecord | undefined> {
    const sourceKey = input.sourceKey
    const existing = (await this.repo.listRefunds()).find((refund) => refund.source_key === sourceKey)
    if (existing) return existing
    const paid = await this.repo.findPaidPayment(input.paymentId, input.lineTypes)
    if (!paid || paid.lines.length === 0) return undefined

    const cents = (value: number) => Math.round(value * 100)
    const refundable = paid.lines.reduce((sum, line) => sum + cents(line.remaining), 0)
    const want = Math.min(cents(input.amount), refundable)
    if (want <= 0) return undefined
    if (want < cents(input.amount)) this.logger.warn(`Refund of ${input.amount} for ${input.sourceKey} is capped at ${refundable / 100}`)

    // Split across the lines in proportion to what each has left; the last line takes the rounding remainder.
    let left = want
    const lines = paid.lines.map((line, index) => {
      const share = index === paid.lines.length - 1 ? left : Math.min(left, Math.round((want * cents(line.remaining)) / refundable))
      left -= share
      return { payment_line_id: line.payment_line_id, amount: share / 100 }
    })
    const voucherShare = paid.amount_total > 0 ? Math.round((want * cents(paid.voucher_amount)) / cents(paid.amount_total)) / 100 : 0
    const cardShare = (want - cents(voucherShare)) / 100

    const now = this.clock.now()
    const id = crypto.randomUUID()
    const refund: RefundRecord = {
      id,
      reference: '',
      payment_id: input.paymentId,
      payment_line_id: null,
      lines: lines.filter((line) => line.amount > 0),
      source_key: sourceKey,
      reason: input.reason,
      method: 'original',
      status: cardShare > 0 ? 'processing' : 'succeeded',
      amount: want / 100,
      voucher_amount: voucherShare,
      fee_withheld: Math.max(0, (refundable - want) / 100),
      provider_refund_id: null,
      requested_by_user_id: null,
      case_compensation_id: null,
      audit_log_id: null,
      decision_note: input.note,
      failure_reason: null,
      requested_at: now,
      completed_at: cardShare > 0 ? null : now,
      created_at: now,
      updated_at: now,
      context: {
        customer_id: paid.booking.customer_id,
        booking_reference: paid.booking.reference,
        item: paid.lines.map((line) => line.description).join(', '),
        customer_reason: null,
        fare_rule: 'inside',
        fare_rule_label: input.label,
        fare_rule_note: input.rule,
        paid_by: this.paidBy(paid.booking),
        card_brand: paid.booking.card_brand,
        card_last4: paid.booking.card_last4,
        credit_note_number: null,
        voucher_code: null,
        decided_at: now,
        decided_by: null,
        override: false,
        older: false,
      },
    }

    let saved: RefundRecord
    if (voucherShare > 0) {
      const voucher = await this.newVoucher({
        customerId: paid.booking.customer_id,
        amount: voucherShare,
        currency: paid.booking.currency,
        booking: paid.booking.reference,
        refundId: id,
        note: 'Your voucher’s share of a cancelled booking',
        description: `Returned from the cancelled booking ${paid.booking.reference}`,
      })
      refund.context.voucher_code = voucher.code
      saved = (await this.repo.saveRefundWithVoucher(refund, voucher, 'insert')).refund
    } else {
      saved = await this.repo.insertRefund(refund)
    }
    await this.writeAudit(null, {
      action: 'create',
      entityType: 'refund',
      entityId: saved.id,
      summary: `${referenceOf(saved)} refunds ${saved.amount.toFixed(2)} ${paid.booking.currency} of ${paid.booking.reference} (${input.reason})`,
      reason: input.note,
      after: { status: saved.status, source_key: sourceKey, fee_withheld: saved.fee_withheld, voucher_amount: saved.voucher_amount },
    })
    if (cardShare > 0) {
      if (this.cardRefunds)
        await this.payToCard(saved, null).catch((error: unknown) => this.logger.error(`Refund ${saved.id}: ${String(error)}`))
      else {
        saved.provider_refund_id = providerRefundOf(saved)
        await this.repo.updateRefund(saved)
      }
    }
    return saved
  }

  /**
   * Re-reads from the provider every card refund that has been `processing` for more than 2 minutes, so a lost
   * `refund.*` webhook does not leave a refund waiting for ever (problem 6). A refund still pending is left alone.
   */
  /** Marks the vouchers that ran out as expired, each with its journal row (the liability leaves). */
  expireVouchers(): Promise<number> {
    return this.repo.expireDueVouchers(this.clock.now())
  }

  async reconcileProcessingRefunds(): Promise<number> {
    const port = this.cardRefunds
    if (!port?.readRefundOutcome) return 0
    const cutoff = this.clock.now().getTime() - 2 * 60 * 1000
    let settled = 0
    for (const refund of await this.repo.listRefunds()) {
      if (refund.status !== 'processing' || refund.method !== 'original' || !refund.provider_refund_id) continue
      if (refund.updated_at.getTime() > cutoff) continue
      try {
        const outcome = await port.readRefundOutcome(refund.provider_refund_id)
        if (!outcome || outcome.status === 'pending') continue
        await this.settleFromProvider({
          refund_id: refund.id,
          provider_refund_id: refund.provider_refund_id,
          outcome: outcome.status === 'succeeded' ? 'succeeded' : 'failed',
          failure_code: outcome.failure_code,
        })
        settled += 1
      } catch (error) {
        this.logger.error(`Refund ${refund.id} could not be re-read from the provider: ${String(error)}`)
      }
    }
    return settled
  }

  /** Handles every cancelled flight with resolution `refund` that has no receipt yet, in `seq` order (startup and the poll). */
  async catchUpFlightCancellations(): Promise<number> {
    let refunds = 0
    for (const event of await this.repo.listUnprocessedFlightCancellations()) {
      try {
        refunds += (await this.handleFlightCancelled(event)).refunds
      } catch (error) {
        /* Leave the event without a receipt: the next pass tries it again. */
        this.logger.error(`flight.cancelled ${event.event_id} not handled yet: ${String(error)}`)
      }
    }
    return refunds
  }

  /** The customer's captured payments, with the lines they can still ask money back for (the "Request a refund" dialog). */
  async listMyRefundable(userId: string): Promise<RefundableListDto> {
    const customerId = await this.repo.resolveCustomerId(userId)
    const payments = customerId ? await this.repo.listRefundable(customerId) : []
    const items = payments
      .map((payment) => ({
        booking_reference: payment.booking.reference,
        currency: payment.booking.currency,
        total: payment.total,
        lines: payment.lines
          .filter((line) => line.remaining > 0)
          .map((line) => ({ description: line.description, amount: line.amount, remaining: line.remaining })),
      }))
      .filter((payment) => payment.lines.length > 0)
    return { items, total: items.length }
  }

  /** The signed-in customer's vouchers, usable ones first. */
  async listMyVouchers(userId: string): Promise<MyVoucherListDto> {
    const customerId = await this.repo.resolveCustomerId(userId)
    const now = this.clock.now()
    const mine = (await this.repo.listVouchers())
      .map((voucher) => this.current(voucher, now))
      .filter((voucher) => voucher.customer_id === customerId && voucher.status !== 'cancelled')
      .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.issued_at.getTime() - a.issued_at.getTime())
    return {
      items: mine.map((voucher) => this.toMyVoucher(voucher, now)),
      total: mine.length,
      usable: mine.filter((v) => v.status === 'active').length,
    }
  }

  /**
   * Checks a voucher code for checkout and says what it is worth, without reserving it. A code that does not exist, is
   * someone else's, is used, expired or voided all answer the same `VOUCHER_INVALID`, so a code cannot be probed.
   * A voucher is used whole: with a `total`, whatever the voucher is worth above it is forfeited, and the answer says so.
   */
  async validateVoucher(userId: string, dto: ValidateVoucherDto): Promise<VoucherValidationDto> {
    const invalid = () => new UnprocessableEntityException(paymentFailure(PaymentErrorCode.VOUCHER_INVALID, 'This voucher cannot be used'))
    const customerId = await this.repo.resolveCustomerId(userId)
    const found = customerId ? await this.repo.findVoucherByCode(dto.code.trim().toUpperCase()) : undefined
    if (!found || found.customer_id !== customerId) throw invalid()
    const voucher = this.current(found, this.clock.now())
    if (voucher.status !== 'active') throw invalid()
    const cents = (value: number) => Math.round(value * 100)
    const applied = dto.total === undefined ? null : Math.min(cents(voucher.amount), cents(dto.total)) / 100
    return {
      code: voucher.code,
      value: voucher.amount,
      currency: voucher.currency,
      expires_at: voucher.expires_at.toISOString(),
      applied,
      forfeited: applied === null ? null : (cents(voucher.amount) - cents(applied)) / 100,
    }
  }

  /* ---- Staff: compensation and vouchers -------------------------------------------------------------------- */

  /** The compensation history: every voucher and every card refund that is not a request from the queue. */
  async listCompensation(query: CompensationQueryDto): Promise<CompensationListDto> {
    const now = this.clock.now()
    const vouchers = (await this.repo.listVouchers()).map((voucher) => this.voucherEntry(voucher, now))
    const cardRefunds = (await this.repo.listRefunds())
      .filter((refund) => isCompensation(refund) && refund.method === 'original')
      .map((refund) => this.cardRefundEntry(refund))
    const searched = [...vouchers, ...cardRefunds].filter((entry) =>
      matches(query.search, entry.booking_reference, entry.reference, entry.reason),
    )

    const counts = {
      all: searched.length,
      vouchers: searched.filter((entry) => entry.kind === 'voucher').length,
      card_refunds: searched.filter((entry) => entry.kind === 'card_refund').length,
    }
    const filter = query.filter ?? 'all'
    const rows = searched
      .filter((entry) => filter === 'all' || (filter === 'vouchers' ? entry.kind === 'voucher' : entry.kind === 'card_refund'))
      .sort((a, b) => Date.parse(b.issued_at) - Date.parse(a.issued_at))
    return { items: rows, total: rows.length, counts }
  }

  /**
   * Issues a voucher or a card refund to a booking.
   *
   * Both are a `refund` row with the `staff_adjustment` reason: a card refund goes to the card, a voucher is the refund
   * returned as a new voucher. The schema ties every voucher to a refund or to a Feature 13 decision, and this staff
   * action is neither a case nor a customer's request.
   */
  async issueCompensation(actorId: string, dto: IssueCompensationDto): Promise<CompensationEntryDto> {
    const booking = await this.repo.findBooking(dto.booking_reference)
    if (!booking) throw new NotFoundException(`Booking ${dto.booking_reference} not found`)

    /* Money back to the card can never be more than the payment still holds. A voucher is store credit, so it is not capped. */
    if (dto.kind === 'card_refund') {
      const counted = (await this.repo.listRefunds())
        .filter(
          (refund) =>
            refund.payment_id === booking.payment_id &&
            refund.status !== 'rejected' &&
            refund.status !== 'failed' &&
            /* A voucher given as goodwill is not money taken back out of the payment. */
            !(refund.reason === 'staff_adjustment' && refund.method === 'voucher'),
        )
        .reduce((sum, refund) => sum + refund.amount, 0)
      const left = Math.max(0, booking.total - counted)
      if (dto.amount > left) {
        throw new UnprocessableEntityException(
          paymentFailure(
            PaymentErrorCode.REFUND_EXCEEDS_PAID,
            left > 0
              ? `A card refund on ${booking.reference} can be at most ${left.toFixed(2)} ${booking.currency}, what the payment still holds`
              : `The payment for ${booking.reference} has nothing left to refund to the card`,
            { refundable: left },
          ),
        )
      }
    }

    const now = this.clock.now()
    const id = crypto.randomUUID()
    const isVoucher = dto.kind === 'voucher'
    const refund: RefundRecord = {
      id,
      reference: '',
      payment_id: booking.payment_id,
      payment_line_id: null,
      source_key: `staff_adjustment:${id}`,
      reason: 'staff_adjustment',
      method: isVoucher ? 'voucher' : 'original',
      status: isVoucher ? 'succeeded' : 'processing',
      amount: dto.amount,
      voucher_amount: isVoucher ? dto.amount : 0,
      fee_withheld: 0,
      provider_refund_id: null,
      requested_by_user_id: actorId,
      case_compensation_id: null,
      audit_log_id: null,
      decision_note: dto.reason,
      failure_reason: null,
      requested_at: now,
      completed_at: isVoucher ? now : null,
      created_at: now,
      updated_at: now,
      context: {
        customer_id: booking.customer_id,
        booking_reference: booking.reference,
        item: dto.reason,
        customer_reason: null,
        fare_rule: 'inside',
        fare_rule_label: 'Staff decision',
        fare_rule_note: 'Issued by staff as compensation.',
        paid_by: this.paidBy(booking),
        card_brand: booking.card_brand,
        card_last4: booking.card_last4,
        credit_note_number: null,
        voucher_code: null,
        decided_at: now,
        decided_by: actorId,
        override: false,
        older: false,
      },
    }

    let entry: CompensationEntryDto
    if (isVoucher) {
      const voucher = await this.newVoucher({
        customerId: booking.customer_id,
        amount: dto.amount,
        currency: booking.currency,
        booking: booking.reference,
        refundId: id,
        note: dto.reason,
        description: 'Compensation issued by staff',
      })
      refund.context.voucher_code = voucher.code
      const saved = await this.repo.saveRefundWithVoucher(refund, voucher, 'insert')
      entry = this.voucherEntry(saved.voucher, now)
    } else {
      const saved = await this.repo.insertRefund(refund)
      /* A card refund is paid out by the provider (Feature 5a's gateway), so it starts as "Paying to card". */
      if (this.cardRefunds) {
        await this.payToCard(saved, actorId)
      } else {
        saved.provider_refund_id = providerRefundOf(saved)
        await this.repo.updateRefund(saved)
      }
      entry = this.cardRefundEntry(saved)
    }

    await this.writeAudit(actorId, {
      action: 'create',
      entityType: isVoucher ? 'compensation_voucher' : 'refund',
      entityId: entry.id,
      summary: `${isVoucher ? `Voucher ${entry.reference}` : `Card refund ${entry.reference}`} for ${dto.amount.toFixed(2)} ${booking.currency} added to booking ${booking.reference}`,
      reason: dto.reason,
      after: { kind: dto.kind, amount: dto.amount, booking_reference: booking.reference },
    })
    return entry
  }

  /**
   * Voids a voucher that has not been used.
   *
   * A used voucher cannot be voided, and a card refund cannot be taken back once it is sent to the card — the frame says
   * both. The schema needs a `cancel_reason` for a cancelled voucher, so a missing reason becomes "Voided by staff".
   */
  async voidVoucher(voucherId: string, actorId: string, dto: VoidVoucherDto): Promise<CompensationEntryDto> {
    const voucher = (await this.repo.findVoucherById(voucherId)) ?? (await this.repo.findVoucherByCode(voucherId))
    if (!voucher) throw new NotFoundException(`Voucher ${voucherId} not found`)
    const status = this.current(voucher, this.clock.now()).status
    if (status !== 'active') {
      throw new ConflictException(`${voucher.code} is ${voucherLabel(status, false).toLowerCase()} and cannot be voided`)
    }

    const now = this.clock.now()
    voucher.status = 'cancelled'
    voucher.cancel_reason = dto.reason?.trim() || 'Voided by staff'
    voucher.updated_at = now
    await this.repo.updateVoucher(voucher)

    await this.writeAudit(actorId, {
      action: 'status_change',
      entityType: 'compensation_voucher',
      entityId: voucher.id,
      summary: `Voucher ${voucher.code} voided`,
      reason: voucher.cancel_reason,
      before: { status: 'active' },
      after: { status: 'cancelled' },
    })
    return this.voucherEntry(voucher, now)
  }

  /* ---- Mapping to the DTOs ---------------------------------------------------------------------------------- */

  private async requireRefund(idOrReference: string): Promise<RefundRecord> {
    const found = (await this.repo.findRefundById(idOrReference)) ?? (await this.repo.findRefundByReference(idOrReference))
    if (!found) throw new NotFoundException(paymentFailure(PaymentErrorCode.REFUND_NOT_FOUND, `Refund ${idOrReference} not found`))
    return found
  }

  private toSummary(refund: RefundRecord): RefundSummaryDto {
    return {
      id: refund.id,
      reference: referenceOf(refund),
      booking_reference: refund.context.booking_reference,
      /* A refund the fare rules do not allow is called what it is, whatever the customer asked for. */
      source_label: refund.context.fare_rule === 'outside' ? 'Outside fare rules' : REFUND_REASON_LABELS[refund.reason],
      reason: refund.reason,
      amount: refund.amount,
      currency: CURRENCY,
      status: refund.status,
      status_label: staffRefundLabel(refund.status, refund.method),
      queue_tab: queueTabFor(refund.status),
      requested_at: refund.requested_at.toISOString(),
    }
  }

  private toDetail(refund: RefundRecord): RefundDetailDto {
    const ctx = refund.context
    return {
      ...this.toSummary(refund),
      method: refund.method,
      voucher_amount: refund.voucher_amount,
      fee_withheld: refund.fee_withheld,
      item: ctx.item,
      customer_reason: ctx.customer_reason,
      paid_by: ctx.paid_by,
      fare_rule: { outcome: ctx.fare_rule, label: ctx.fare_rule_label, note: ctx.fare_rule_note },
      needs_override: ctx.fare_rule === 'outside',
      decision: ctx.decided_at
        ? { decided_at: ctx.decided_at.toISOString(), decided_by: ctx.decided_by, note: refund.decision_note, override: ctx.override }
        : null,
      provider_refund_id: refund.provider_refund_id,
      failure_reason: refund.status === 'failed' ? refund.failure_reason : null,
      voucher_code: ctx.voucher_code,
      credit_note_number: ctx.credit_note_number,
    }
  }

  private toMyRefund(refund: RefundRecord): MyRefundDto {
    const ctx = refund.context
    return {
      id: refund.id,
      reference: referenceOf(refund),
      title: ctx.item,
      booking_reference: ctx.booking_reference,
      amount: refund.amount,
      currency: CURRENCY,
      status: refund.status,
      status_label: customerRefundLabel(refund.status, refund.method),
      tab: myRefundTabFor(refund.status),
      requested_at: refund.requested_at.toISOString(),
      completed_at: refund.completed_at?.toISOString() ?? null,
      decided_at: refund.status === 'rejected' ? (ctx.decided_at?.toISOString() ?? null) : null,
      outcome_note: this.outcomeNote(refund),
      credit_note_number: ctx.credit_note_number,
      voucher_code: ctx.voucher_code,
    }
  }

  /** What the customer's card says under the refund, in the frames' words. */
  private outcomeNote(refund: RefundRecord): string {
    const ctx = refund.context
    switch (refund.status) {
      case 'requested':
      case 'pending_approval':
        return 'Staff are reviewing this request. You will get an email when it is decided.'
      case 'approved':
      case 'processing':
        return 'Approved. The money is on its way back to your card.'
      case 'succeeded':
        return refund.method === 'voucher'
          ? 'Issued as a single-use voucher you can use at checkout.'
          : `Credited to ${ctx.card_brand ?? 'your card'} ending ${ctx.card_last4 ?? '····'}. Reference ${refund.provider_refund_id ?? referenceOf(refund)}. It can take 5–10 working days to appear on your statement.`
      case 'failed':
        return 'The payout did not go through. Staff are looking into it.'
      case 'rejected':
        return refund.decision_note ?? 'This request was not approved.'
      default: {
        const unreachable: never = refund.status
        return unreachable
      }
    }
  }

  /**
   * The voucher as it is right now. The table keeps `active` until something rewrites it, and nothing does yet, so a
   * voucher past its end is read as `expired` here, on every screen, rather than shown as usable.
   */
  private current(voucher: VoucherRecord, now: Date): VoucherRecord {
    return voucher.status === 'active' && voucher.expires_at.getTime() <= now.getTime() ? { ...voucher, status: 'expired' } : voucher
  }

  private toMyVoucher(raw: VoucherRecord, now: Date): MyVoucherDto {
    const voucher = this.current(raw, now)
    const days = this.daysLeft(voucher, now)
    return {
      id: voucher.id,
      code: voucher.code,
      amount: voucher.amount,
      currency: voucher.currency,
      status: voucher.status,
      status_label: voucherLabel(voucher.status, days !== null && days <= EXPIRING_SOON_DAYS),
      description: voucher.description,
      issued_at: voucher.issued_at.toISOString(),
      expires_at: voucher.expires_at.toISOString(),
      expires_in_days: days,
      redeemed_at: voucher.redeemed_at?.toISOString() ?? null,
      used_on: voucher.used_on,
    }
  }

  /** Whole days until an unused voucher ends. Null once it is used or void. */
  private daysLeft(voucher: VoucherRecord, now: Date): number | null {
    if (voucher.status !== 'active') return null
    return Math.max(0, Math.ceil((voucher.expires_at.getTime() - now.getTime()) / DAY))
  }

  private voucherEntry(raw: VoucherRecord, now: Date): CompensationEntryDto {
    const voucher = this.current(raw, now)
    const days = this.daysLeft(voucher, now)
    return {
      id: voucher.id,
      kind: 'voucher',
      booking_reference: voucher.booking_reference,
      value: voucher.amount,
      currency: voucher.currency,
      reference: voucher.code,
      status_label: voucherLabel(voucher.status, days !== null && days <= EXPIRING_SOON_DAYS),
      reason: voucher.note,
      issued_at: voucher.issued_at.toISOString(),
      can_void: voucher.status === 'active',
    }
  }

  private cardRefundEntry(refund: RefundRecord): CompensationEntryDto {
    return {
      id: refund.id,
      kind: 'card_refund',
      booking_reference: refund.context.booking_reference,
      value: refund.amount,
      currency: CURRENCY,
      reference: refund.provider_refund_id ?? referenceOf(refund),
      status_label: cardRefundLabel(refund.status),
      reason: refund.decision_note ?? REFUND_REASON_LABELS[refund.reason],
      issued_at: refund.requested_at.toISOString(),
      can_void: false,
    }
  }

  /* ---- Vouchers and audit ----------------------------------------------------------------------------------- */

  /** The text under a refund's "Paid by": the card, and what it paid. */
  private paidBy(booking: BookingInfo, total?: number): string {
    const card = booking.card_last4 ? `Card ${booking.card_last4}` : 'Card'
    return total === undefined ? card : `${card} (${total.toFixed(2)}) · no voucher`
  }

  /** The currency of the payment a refund is on. */
  private async currencyOf(refund: RefundRecord): Promise<string> {
    return (await this.repo.findBooking(refund.context.booking_reference))?.currency ?? CURRENCY
  }

  /** A new single-use voucher, good for `payment_setting.voucher_valid_months` from now. It is saved with its refund, not here. */
  private async newVoucher(input: {
    customerId: string
    amount: number
    currency: string
    booking: string
    refundId: string
    note: string
    description: string
  }): Promise<VoucherRecord> {
    const now = this.clock.now()
    const expires = new Date(now)
    expires.setMonth(expires.getMonth() + (await this.repo.voucherValidMonths()))
    return {
      id: crypto.randomUUID(),
      code: await this.newCode(),
      customer_id: input.customerId,
      amount: input.amount,
      currency: input.currency,
      status: 'active',
      case_compensation_id: null,
      refund_id: input.refundId,
      issued_at: now,
      expires_at: expires,
      redeemed_at: null,
      cancel_reason: null,
      created_at: now,
      updated_at: now,
      booking_reference: input.booking,
      note: input.note,
      description: input.description,
      used_on: null,
    }
  }

  /** `VCH-XXXXX-XXXXX`: the ten characters the schema allows, from the alphabet that leaves out I, O, 0 and 1, split in two. */
  private async newCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const pick = () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
      const code = `VCH-${Array.from({ length: 5 }, pick).join('')}-${Array.from({ length: 5 }, pick).join('')}`
      if (!(await this.repo.findVoucherByCode(code))) return code
    }
    throw new BadRequestException('Could not make a voucher code, try again')
  }

  /** Writes the audit row for a staff action. The action is already done, so a failed write is logged, never thrown. */
  private async writeAudit(
    actorId: string | null,
    row: {
      action: 'create' | 'status_change'
      entityType: string
      entityId: string
      summary: string
      reason?: string | null
      before?: unknown
      after?: unknown
    },
  ): Promise<void> {
    /* A webhook has no staff member behind it: the provider's word is recorded as the system's. */
    const actor = actorId ? await this.audit.resolveActor(actorId).catch(() => AuditService.systemActor()) : AuditService.systemActor()
    await this.audit.tryWrite({ actor, sourceFeature: '5', ...row })
  }
}
