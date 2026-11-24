import { ConflictException } from '@nestjs/common'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { PaymentsRefundsService } from './payments-refunds.service'
import { buildSeedRefunds, buildSeedVouchers, InMemoryRefundRepository, seedRepository } from './refund.repository'
import { IssueCompensationDto, RefundDecisionDto } from './dto/refund-action.dto'
import type { CardRefundPort } from './card-refund.port'
import type { BookingInfo, PaidPayment, RefundRecord } from './refund.types'

// The service imports the audit writer, which imports DbService; the tests need neither a database nor Clerk.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const STAFF = 'staff-1'
const PAYMENT = '11111111-1111-4111-8111-111111111111'
const CUSTOMER = 'customer-1'

function decision(decision: RefundDecisionDto['decision'], reason = 'Approved.'): RefundDecisionDto {
  return Object.assign(new RefundDecisionDto(), { decision, reason })
}

/** A card refund of `amount` waiting in the queue, on a payment of `PAYMENT`. */
function waitingRefund(id: string, amount: number, over: Partial<RefundRecord> = {}): RefundRecord {
  const now = new Date()
  return {
    id,
    reference: '',
    payment_id: PAYMENT,
    payment_line_id: null,
    source_key: `customer_request:${id}`,
    reason: 'customer_request',
    method: 'original',
    status: 'requested',
    amount,
    voucher_amount: 0,
    fee_withheld: 0,
    provider_refund_id: null,
    requested_by_user_id: null,
    case_compensation_id: null,
    audit_log_id: null,
    decision_note: null,
    failure_reason: null,
    requested_at: now,
    completed_at: null,
    created_at: now,
    updated_at: now,
    context: {
      customer_id: CUSTOMER,
      booking_reference: 'K7QF2M',
      item: 'Seat 12A',
      customer_reason: null,
      fare_rule: 'inside',
      fare_rule_label: 'Inside rules',
      fare_rule_note: '',
      paid_by: 'Card 4242 (100.00) · no voucher',
      card_brand: 'Visa',
      card_last4: '4242',
      credit_note_number: null,
      voucher_code: null,
      decided_at: null,
      decided_by: null,
      override: false,
      older: false,
    },
    ...over,
  }
}

function booking(total: number): BookingInfo {
  return { reference: 'K7QF2M', customer_id: CUSTOMER, payment_id: PAYMENT, currency: 'USD', total, card_brand: 'Visa', card_last4: '4242' }
}

/** What the card side answers. Each test sets the one answer it is about. */
function makePort(): jest.Mocked<CardRefundPort> {
  return {
    refundToCard: jest.fn().mockResolvedValue({ status: 'succeeded', provider_refund_id: 're_1', failure_code: null }),
    recordRefundSucceeded: jest.fn().mockResolvedValue({ credit_note_number: 'CN-TEST0001' }),
    recordRefundFailed: jest.fn().mockResolvedValue(undefined),
  }
}

async function setup(options: { total?: number; refunds?: RefundRecord[]; seeded?: boolean } = {}) {
  const repo = new InMemoryRefundRepository()
  const clock = new SimulationClock()
  if (options.seeded) await seedRepository(repo, buildSeedRefunds(clock.now()), buildSeedVouchers(clock.now()))
  for (const refund of options.refunds ?? []) await repo.insertRefund(refund)
  if (!options.seeded) jest.spyOn(repo, 'findBooking').mockResolvedValue(booking(options.total ?? 1000))
  const port = makePort()
  const audit = {
    resolveActor: jest.fn().mockResolvedValue({ type: 'staff', id: STAFF, role: 'admin' }),
    tryWrite: jest.fn().mockResolvedValue(true),
  }
  const svc = new PaymentsRefundsService(repo, clock, audit as unknown as AuditService, port)
  return { repo, svc, port, audit }
}

describe('PaymentsRefundsService — a card refund goes to the card', () => {
  it('approving to the card sends the money, then records the credit note and the provider’s id', async () => {
    const { svc, port, audit } = await setup({ refunds: [waitingRefund('r-1', 45)] })

    const detail = await svc.decide('r-1', STAFF, decision('approve_card'))

    expect(port.refundToCard).toHaveBeenCalledWith({ payment_id: PAYMENT, refund_id: 'r-1', amount: 45 })
    expect(detail.status).toBe('succeeded')
    expect(detail.status_label).toBe('Refunded')
    expect(detail.provider_refund_id).toBe('re_1')
    expect(detail.credit_note_number).toBe('CN-TEST0001')
    expect(port.recordRefundSucceeded).toHaveBeenCalledWith({ payment_id: PAYMENT, refund_id: 'r-1', amount: 45, fully_refunded: false })
    // The decision and the payout are two facts, so two audit rows.
    expect(audit.tryWrite).toHaveBeenCalledTimes(2)
  })

  it('saves "paying to card" before it asks the provider, so a refund is never lost between the two', async () => {
    const { svc, port, repo } = await setup({ refunds: [waitingRefund('r-1', 45)] })
    let seenWhileAsking = ''
    port.refundToCard.mockImplementation(async () => {
      seenWhileAsking = (await repo.findRefundById('r-1'))?.status ?? ''
      return { status: 'succeeded', provider_refund_id: 're_1', failure_code: null }
    })

    await svc.decide('r-1', STAFF, decision('approve_card'))

    expect(seenWhileAsking).toBe('processing')
  })

  it('leaves a refund the provider is still working on as "Paying to card", with the provider’s id', async () => {
    const { svc, port } = await setup({ refunds: [waitingRefund('r-1', 45)] })
    port.refundToCard.mockResolvedValue({ status: 'pending', provider_refund_id: 're_pending', failure_code: null })

    const detail = await svc.decide('r-1', STAFF, decision('approve_card'))

    expect(detail.status).toBe('processing')
    expect(detail.status_label).toBe('Paying to card')
    expect(detail.provider_refund_id).toBe('re_pending')
    expect(port.recordRefundSucceeded).not.toHaveBeenCalled()
  })

  it('records a payout that failed with the provider’s reason, and keeps it in the queue for a person to see', async () => {
    const { svc, port } = await setup({ refunds: [waitingRefund('r-1', 45)] })
    port.refundToCard.mockResolvedValue({ status: 'failed', provider_refund_id: null, failure_code: 'charge_already_refunded' })

    const detail = await svc.decide('r-1', STAFF, decision('approve_card'))

    expect(detail.status).toBe('failed')
    expect(detail.status_label).toBe('Payout failed')
    expect(detail.failure_reason).toBe('charge_already_refunded')
    expect(port.recordRefundFailed).toHaveBeenCalledWith(PAYMENT)
    expect(port.recordRefundSucceeded).not.toHaveBeenCalled()
    const queue = await svc.listQueue({ tab: 'needs_review' })
    expect(queue.items.map((row) => row.status_label)).toContain('Payout failed')
  })

  it('does not touch the card for a refund returned as a voucher or rejected', async () => {
    const { svc, port } = await setup({ refunds: [waitingRefund('r-1', 45), waitingRefund('r-2', 30)] })

    await svc.decide('r-1', STAFF, decision('approve_voucher'))
    await svc.decide('r-2', STAFF, decision('reject', 'Outside the fare rules.'))

    expect(port.refundToCard).not.toHaveBeenCalled()
  })
})

describe('PaymentsRefundsService — when a payment is refunded in full', () => {
  it('tells 5a to reverse the payment when this refund takes the last of it', async () => {
    const { svc, port } = await setup({ total: 45, refunds: [waitingRefund('r-1', 45)] })

    await svc.decide('r-1', STAFF, decision('approve_card'))

    expect(port.recordRefundSucceeded).toHaveBeenCalledWith(expect.objectContaining({ fully_refunded: true }))
  })

  it('counts the refunds already paid, but not one that is rejected or failed', async () => {
    const paid = waitingRefund('r-paid', 20, { status: 'succeeded', completed_at: new Date() })
    const rejected = waitingRefund('r-no', 500, { status: 'rejected', decision_note: 'No.' })
    const { svc, port } = await setup({ total: 65, refunds: [paid, rejected, waitingRefund('r-1', 45)] })

    await svc.decide('r-1', STAFF, decision('approve_card'))

    expect(port.recordRefundSucceeded).toHaveBeenCalledWith(expect.objectContaining({ fully_refunded: true }))
  })

  it('does not count a goodwill voucher as money taken out of the payment', async () => {
    const goodwill = waitingRefund('r-gift', 30, {
      reason: 'staff_adjustment',
      method: 'voucher',
      voucher_amount: 30,
      status: 'succeeded',
      completed_at: new Date(),
    })
    const { svc, port } = await setup({ total: 45, refunds: [goodwill, waitingRefund('r-1', 45)] })

    await svc.decide('r-1', STAFF, decision('approve_card'))

    expect(port.recordRefundSucceeded).toHaveBeenCalledWith(expect.objectContaining({ fully_refunded: true }))
  })

  it('does not reverse while another refund on the payment is still waiting on the provider', async () => {
    const paying = waitingRefund('r-paying', 20, { status: 'processing' })
    const { svc, port } = await setup({ total: 65, refunds: [paying, waitingRefund('r-1', 45)] })

    await svc.decide('r-1', STAFF, decision('approve_card'))

    expect(port.recordRefundSucceeded).toHaveBeenCalledWith(expect.objectContaining({ fully_refunded: false }))
  })
})

describe('PaymentsRefundsService.settleFromProvider (the provider’s late word)', () => {
  const settle = (outcome: 'succeeded' | 'failed', failure_code: string | null = null) => ({
    refund_id: 'r-1',
    provider_refund_id: 're_late',
    outcome,
    failure_code,
  })

  it('completes a refund that was pending, once: a repeated webhook changes nothing', async () => {
    const { svc, port } = await setup({ refunds: [waitingRefund('r-1', 45, { status: 'processing' })] })

    await svc.settleFromProvider(settle('succeeded'))
    await svc.settleFromProvider(settle('succeeded'))

    const detail = await svc.getStaffRefund('r-1')
    expect(detail.status).toBe('succeeded')
    expect(detail.provider_refund_id).toBe('re_late')
    expect(detail.credit_note_number).toBe('CN-TEST0001')
    expect(port.recordRefundSucceeded).toHaveBeenCalledTimes(1)
  })

  it('fails a pending refund with the provider’s reason', async () => {
    const { svc, port } = await setup({ refunds: [waitingRefund('r-1', 45, { status: 'processing' })] })

    await svc.settleFromProvider(settle('failed', 'expired_or_canceled_card'))

    const detail = await svc.getStaffRefund('r-1')
    expect(detail.status).toBe('failed')
    expect(port.recordRefundFailed).toHaveBeenCalledWith(PAYMENT)
  })

  it('believes the provider when a refund we marked failed turns out to have gone through', async () => {
    const failed = waitingRefund('r-1', 45, { status: 'failed', failure_reason: 'provider_unreachable' })
    const { svc } = await setup({ refunds: [failed] })

    await svc.settleFromProvider(settle('succeeded'))

    const detail = await svc.getStaffRefund('r-1')
    expect(detail.status).toBe('succeeded')
  })

  it('does not undo a refund that already went through when a failure arrives after it', async () => {
    const done = waitingRefund('r-1', 45, { status: 'succeeded', completed_at: new Date() })
    const { svc, port } = await setup({ refunds: [done] })

    await svc.settleFromProvider(settle('failed', 'late'))

    expect((await svc.getStaffRefund('r-1')).status).toBe('succeeded')
    expect(port.recordRefundFailed).not.toHaveBeenCalled()
  })

  it('ignores a refund it does not know, and a voucher refund', async () => {
    const voucher = waitingRefund('r-1', 45, { method: 'voucher', voucher_amount: 45, status: 'succeeded', completed_at: new Date() })
    const { svc, port } = await setup({ refunds: [voucher] })

    await expect(svc.settleFromProvider({ ...settle('succeeded'), refund_id: 'no-such-refund' })).resolves.toBeUndefined()
    await expect(svc.settleFromProvider(settle('succeeded'))).resolves.toBeUndefined()
    expect(port.recordRefundSucceeded).not.toHaveBeenCalled()
  })
})

describe('PaymentsRefundsService — a refund whose payout failed', () => {
  const failedRefund = () => waitingRefund('r-1', 45, { status: 'failed', failure_reason: 'charge_already_refunded' })

  it('is not sent to the card again from here, because a lost first answer could pay the customer twice', async () => {
    const { svc, port } = await setup({ refunds: [failedRefund()] })

    await expect(svc.decide('r-1', STAFF, decision('approve_card'))).rejects.toBeInstanceOf(ConflictException)
    expect(port.refundToCard).not.toHaveBeenCalled()
  })

  it('can still be returned as a voucher, or rejected', async () => {
    const first = await setup({ refunds: [failedRefund()] })
    const voucher = await first.svc.decide('r-1', STAFF, decision('approve_voucher'))
    expect(voucher.status).toBe('succeeded')
    expect(voucher.voucher_code).toMatch(/^VCH-/)

    const second = await setup({ refunds: [failedRefund()] })
    const rejected = await second.svc.decide('r-1', STAFF, decision('reject', 'Customer has been told.'))
    expect(rejected.status).toBe('rejected')
  })
})

describe('PaymentsRefundsService.issueCompensation — a card refund as compensation', () => {
  it('goes to the card the same way, and is refunded when the provider says so', async () => {
    const { svc, port } = await setup({ seeded: true })
    const dto = Object.assign(new IssueCompensationDto(), {
      booking_reference: 'M3XP9D',
      kind: 'card_refund',
      amount: 100,
      reason: 'Delay over 3 hours on FY102',
    })

    const entry = await svc.issueCompensation(STAFF, dto)

    expect(port.refundToCard).toHaveBeenCalledWith(expect.objectContaining({ amount: 100 }))
    expect(entry.status_label).toBe('Refunded')
  })

  it('says why when the provider refuses it', async () => {
    const { svc, port } = await setup({ seeded: true })
    port.refundToCard.mockResolvedValue({ status: 'failed', provider_refund_id: null, failure_code: 'charge_already_refunded' })
    const dto = Object.assign(new IssueCompensationDto(), {
      booking_reference: 'M3XP9D',
      kind: 'card_refund',
      amount: 100,
      reason: 'Goodwill',
    })

    const entry = await svc.issueCompensation(STAFF, dto)

    expect(entry.status_label).toBe('Payout failed')
  })
})

describe('PaymentsRefundsService — approving to the card on a payment a voucher helped pay', () => {
  it('sends only the card’s share to the card and returns the voucher’s share as a new voucher', async () => {
    const { svc, port, repo } = await setup({ total: 300, refunds: [waitingRefund('r-mixed', 300)] })
    jest.spyOn(repo, 'findPaidPayment').mockResolvedValue({ amount_total: 300, voucher_amount: 200 } as PaidPayment)

    const detail = await svc.decide('r-mixed', STAFF, decision('approve_card'))

    expect(port.refundToCard).toHaveBeenCalledWith({ payment_id: PAYMENT, refund_id: 'r-mixed', amount: 100 })
    expect(detail.voucher_amount).toBe(200)
    expect(detail.status).toBe('succeeded')
    const stored = await repo.findRefundById('r-mixed')
    expect(stored?.context.voucher_code).toEqual(expect.any(String))
  })

  it('needs no card payout when the voucher paid for all of it', async () => {
    const { svc, port, repo } = await setup({ total: 50, refunds: [waitingRefund('r-voucher', 50)] })
    jest.spyOn(repo, 'findPaidPayment').mockResolvedValue({ amount_total: 50, voucher_amount: 50 } as PaidPayment)

    const detail = await svc.decide('r-voucher', STAFF, decision('approve_card'))

    expect(port.refundToCard).not.toHaveBeenCalled()
    expect(detail.voucher_amount).toBe(50)
    expect(detail.status).toBe('succeeded')
  })
})
