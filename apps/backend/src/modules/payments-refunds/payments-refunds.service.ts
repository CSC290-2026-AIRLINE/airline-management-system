import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type {
  CompensationEntryDto,
  CompensationListDto,
  MyRefundDto,
  MyRefundListDto,
  MyVoucherDto,
  MyVoucherListDto,
  RefundDetailDto,
  RefundQueueListDto,
  RefundSummaryDto,
} from './dto/payments-refunds.types'
import type { CompensationQueryDto, MyRefundQueryDto, RefundQueueQueryDto } from './dto/refund-query.dto'
import type { CreateRefundRequestDto, IssueCompensationDto, RefundDecisionDto, VoidVoucherDto } from './dto/refund-action.dto'
import { MOCK_BOOKINGS, resolveCustomerId } from './mock-refund-state'
import { pad, REFUND_REPOSITORY } from './refund.repository'
import type { RefundRepository } from './refund.repository'
import {
  cardRefundLabel,
  COMPENSATION_REASONS,
  customerRefundLabel,
  EXPIRING_SOON_DAYS,
  myRefundTabFor,
  queueTabFor,
  REFUND_REASON_LABELS,
  staffRefundLabel,
  VOUCHER_VALID_MONTHS,
  voucherLabel,
} from './refund-status'
import type { RefundRecord, VoucherRecord } from './refund.types'

const DAY = 24 * 60 * 60 * 1000
const CURRENCY = 'USD'
/** The characters a voucher code may use. The schema leaves out the ones that are easy to misread (I, O, 0, 1). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** `REF-0121`. */
function referenceOf(refund: RefundRecord): string {
  return `REF-${pad(refund.number)}`
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
 * Feature 13's `case_compensation`, and the card refund goes through Feature 5a's payment provider. Each is a mock
 * field today and carries its own TODO.
 */
@Injectable()
export class PaymentsRefundsService {
  constructor(
    @Inject(REFUND_REPOSITORY) private readonly repo: RefundRepository,
    private readonly clock: SimulationClock,
    private readonly audit: AuditService,
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
    if (refund.status !== 'requested' && refund.status !== 'pending_approval') {
      throw new ConflictException(
        `${referenceOf(refund)} is ${staffRefundLabel(refund.status, refund.method).toLowerCase()} and cannot be decided again`,
      )
    }
    if (isCompensation(refund)) {
      throw new ConflictException(`${referenceOf(refund)} is a compensation, not a request in the queue`)
    }

    const before = refund.status
    const now = this.clock.now()
    const override = dto.decision !== 'reject' && refund.context.fare_rule === 'outside'

    if (dto.decision === 'reject') {
      refund.status = 'rejected'
    } else if (dto.decision === 'approve_card') {
      refund.status = 'processing'
      refund.method = 'original'
      refund.voucher_amount = 0
      refund.provider_refund_id = `RF-${pad(refund.number)}`
    } else {
      refund.method = 'voucher'
      refund.voucher_amount = refund.amount
      refund.provider_refund_id = null
      refund.status = 'succeeded'
      refund.completed_at = now
      const voucher = await this.issueVoucher({
        customerId: refund.context.customer_id,
        amount: refund.amount,
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
    await this.repo.updateRefund(refund)

    await this.writeAudit(actorId, {
      action: 'status_change',
      entityType: 'refund',
      entityId: refund.id,
      summary: `${referenceOf(refund)} ${dto.decision === 'reject' ? 'rejected' : 'approved'} (${dto.decision})${override ? ' with a fare-rule override' : ''}`,
      reason: dto.reason,
      before: { status: before },
      after: { status: refund.status, method: refund.method, override },
    })

    return this.toDetail(refund)
  }

  /* ---- Customer: My refunds and My vouchers --------------------------------------------------------------- */

  /** The signed-in customer's refunds, newest first, with the counts the frames show on the tabs. */
  async listMyRefunds(userId: string, query: MyRefundQueryDto): Promise<MyRefundListDto> {
    const customerId = resolveCustomerId(userId)
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
    if (refund.context.customer_id !== resolveCustomerId(userId) || isCompensation(refund)) {
      throw new NotFoundException(`Refund ${idOrReference} not found`)
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
    const customerId = resolveCustomerId(userId)
    const booking = MOCK_BOOKINGS[dto.booking_reference]
    if (!booking || booking.customer_id !== customerId) {
      throw new NotFoundException(`Booking ${dto.booking_reference} not found`)
    }

    const open = (await this.repo.listRefunds()).find(
      (refund) =>
        refund.context.booking_reference === booking.reference &&
        refund.context.item === dto.item &&
        refund.status !== 'rejected' &&
        refund.status !== 'failed',
    )
    if (open) {
      throw new ConflictException(`${referenceOf(open)} already asks for a refund of ${dto.item} on ${booking.reference}`)
    }

    const now = this.clock.now()
    const number = await this.repo.nextRefundNumber()
    const refund: RefundRecord = {
      id: `ref_${crypto.randomUUID()}`,
      number,
      payment_id: booking.payment_id,
      source_key: `customer_request:${booking.reference}:${number}`,
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
        paid_by: `Card ${booking.card_last4} (${dto.amount.toFixed(2)}) · no voucher`,
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
    await this.repo.insertRefund(refund)
    return this.toMyRefund(refund)
  }

  /** The signed-in customer's vouchers, usable ones first. */
  async listMyVouchers(userId: string): Promise<MyVoucherListDto> {
    const customerId = resolveCustomerId(userId)
    const now = this.clock.now()
    const mine = (await this.repo.listVouchers())
      .filter((voucher) => voucher.customer_id === customerId && voucher.status !== 'cancelled')
      .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.issued_at.getTime() - a.issued_at.getTime())
    return {
      items: mine.map((voucher) => this.toMyVoucher(voucher, now)),
      total: mine.length,
      usable: mine.filter((v) => v.status === 'active').length,
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
    const booking = MOCK_BOOKINGS[dto.booking_reference]
    if (!booking) throw new NotFoundException(`Booking ${dto.booking_reference} not found`)

    const now = this.clock.now()
    const number = await this.repo.nextRefundNumber()
    const isVoucher = dto.kind === 'voucher'
    const refund: RefundRecord = {
      id: `ref_${crypto.randomUUID()}`,
      number,
      payment_id: booking.payment_id,
      source_key: `staff_adjustment:${booking.reference}:${number}`,
      reason: 'staff_adjustment',
      method: isVoucher ? 'voucher' : 'original',
      status: isVoucher ? 'succeeded' : 'processing',
      amount: dto.amount,
      voucher_amount: isVoucher ? dto.amount : 0,
      fee_withheld: 0,
      provider_refund_id: isVoucher ? null : `RF-${pad(number)}`,
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
        paid_by: `Card ${booking.card_last4}`,
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
      const voucher = await this.issueVoucher({
        customerId: booking.customer_id,
        amount: dto.amount,
        booking: booking.reference,
        refundId: refund.id,
        note: dto.reason,
        description: 'Compensation issued by staff',
      })
      refund.context.voucher_code = voucher.code
      await this.repo.insertRefund(refund)
      entry = this.voucherEntry(voucher, now)
    } else {
      await this.repo.insertRefund(refund)
      entry = this.cardRefundEntry(refund)
    }

    await this.writeAudit(actorId, {
      action: 'create',
      entityType: isVoucher ? 'compensation_voucher' : 'refund',
      entityId: entry.id,
      summary: `${isVoucher ? `Voucher ${entry.reference}` : `Card refund ${entry.reference}`} for ${dto.amount.toFixed(2)} ${CURRENCY} added to booking ${booking.reference}`,
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
    if (voucher.status !== 'active') {
      throw new ConflictException(`${voucher.code} is ${voucherLabel(voucher.status, false).toLowerCase()} and cannot be voided`)
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
    const byId = await this.repo.findRefundById(idOrReference)
    if (byId) return byId
    const match = /^REF-(\d{1,6})$/i.exec(idOrReference.trim())
    const byNumber = match ? await this.repo.findRefundByNumber(Number(match[1])) : undefined
    if (!byNumber) throw new NotFoundException(`Refund ${idOrReference} not found`)
    return byNumber
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

  private toMyVoucher(voucher: VoucherRecord, now: Date): MyVoucherDto {
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

  private voucherEntry(voucher: VoucherRecord, now: Date): CompensationEntryDto {
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

  /** A new single-use voucher, good for `VOUCHER_VALID_MONTHS` from now. */
  private async issueVoucher(input: {
    customerId: string
    amount: number
    booking: string
    refundId: string
    note: string
    description: string
  }): Promise<VoucherRecord> {
    const now = this.clock.now()
    const expires = new Date(now)
    expires.setMonth(expires.getMonth() + VOUCHER_VALID_MONTHS)
    const voucher: VoucherRecord = {
      id: `vch_${crypto.randomUUID()}`,
      code: await this.newCode(),
      customer_id: input.customerId,
      amount: input.amount,
      currency: CURRENCY,
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
    return this.repo.insertVoucher(voucher)
  }

  /** `VCH-XXXX-XXXX`, from the alphabet the schema allows, not used by another voucher. */
  private async newCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const pick = () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
      const code = `VCH-${Array.from({ length: 4 }, pick).join('')}-${Array.from({ length: 4 }, pick).join('')}`
      if (!(await this.repo.findVoucherByCode(code))) return code
    }
    throw new BadRequestException('Could not make a voucher code, try again')
  }

  /** Writes the audit row for a staff action. The action is already done, so a failed write is logged, never thrown. */
  private async writeAudit(
    actorId: string,
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
    const actor = await this.audit.resolveActor(actorId).catch(() => AuditService.systemActor())
    await this.audit.tryWrite({ actor, sourceFeature: '5', ...row })
  }
}
