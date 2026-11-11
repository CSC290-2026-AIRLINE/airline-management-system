import { ConflictException, NotFoundException } from '@nestjs/common'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { PaymentsRefundsService } from './payments-refunds.service'
import { buildSeedRefunds, buildSeedVouchers, InMemoryRefundRepository, seedRepository } from './refund.repository'
import { CreateRefundRequestDto, IssueCompensationDto, RefundDecisionDto } from './dto/refund-action.dto'

// The service imports the audit writer, which imports DbService. The service only uses Prisma as types, so mocking
// DbService is enough — no database and no Clerk.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const USER = 'user_customer'
const STAFF = 'staff-1'

async function makeService() {
  const repo = new InMemoryRefundRepository()
  const clock = new SimulationClock()
  const now = clock.now()
  await seedRepository(repo, buildSeedRefunds(now), buildSeedVouchers(now))
  const audit = {
    resolveActor: jest.fn().mockResolvedValue({ type: 'staff', id: STAFF, role: 'admin' }),
    tryWrite: jest.fn().mockResolvedValue(true),
  }
  const svc = new PaymentsRefundsService(repo, clock, audit as unknown as AuditService)
  return { repo, clock, svc, audit }
}

function decision(decision: RefundDecisionDto['decision'], reason = 'Approved.'): RefundDecisionDto {
  return Object.assign(new RefundDecisionDto(), { decision, reason })
}

function compensation(overrides: Partial<IssueCompensationDto> = {}): IssueCompensationDto {
  return Object.assign(new IssueCompensationDto(), {
    booking_reference: 'M3XP9D',
    kind: 'voucher',
    amount: 40,
    reason: 'Delay over 3 hours on FY102',
    ...overrides,
  })
}

describe('PaymentsRefundsService — the staff queue', () => {
  it('counts the tabs the way the frames do: three to review, two done', async () => {
    const { svc } = await makeService()
    const queue = await svc.listQueue({})

    expect(queue.counts).toEqual({ all: 5, needs_review: 3, done: 2 })
    expect(queue.items.map((row) => row.reference)).toEqual(expect.arrayContaining(['REF-0121', 'REF-0122', 'REF-0123']))
  })

  it('keeps compensation and old refunds out of the queue', async () => {
    const { svc } = await makeService()
    const references = (await svc.listQueue({})).items.map((row) => row.reference)

    expect(references).not.toContain('REF-0090')
    expect(references).not.toContain('REF-0127')
    expect(references).not.toContain('REF-0131')
  })

  it('filters by tab and by search', async () => {
    const { svc } = await makeService()

    const review = await svc.listQueue({ tab: 'needs_review' })
    expect(review.items.every((row) => row.status_label === 'Needs review')).toBe(true)

    const done = await svc.listQueue({ tab: 'done' })
    expect(done.items.map((row) => row.status_label).sort()).toEqual(['Refunded', 'Voucher issued'])

    const found = await svc.listQueue({ search: 'k7qf2m' })
    expect(found.items.map((row) => row.reference).sort()).toEqual(['REF-0113', 'REF-0121'])
  })

  it('calls a refund the fare rules do not allow "Outside fare rules"', async () => {
    const { svc } = await makeService()
    const row = (await svc.listQueue({})).items.find((item) => item.reference === 'REF-0122')

    expect(row?.source_label).toBe('Outside fare rules')
  })

  it('finds a refund by its reference as well as its id', async () => {
    const { svc } = await makeService()
    const byReference = await svc.getStaffRefund('REF-0122')
    const byId = await svc.getStaffRefund(byReference.id)

    expect(byId.reference).toBe('REF-0122')
    expect(byReference.needs_override).toBe(true)
    expect(byReference.item).toBe('Fare · 1 adult · FY214')
    await expect(svc.getStaffRefund('REF-9999')).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('PaymentsRefundsService.decide', () => {
  it('approves to the card: the refund is paying out and the audit trail has the reason', async () => {
    const { svc, audit } = await makeService()
    const detail = await svc.decide('REF-0121', STAFF, decision('approve_card', 'Approved.'))

    expect(detail.status).toBe('processing')
    expect(detail.status_label).toBe('Paying to card')
    expect(detail.provider_refund_id).toBe('RF-0121')
    expect(detail.decision).toMatchObject({ decided_by: STAFF, note: 'Approved.', override: false })
    expect(audit.tryWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'status_change', entityType: 'refund', reason: 'Approved.', sourceFeature: '5' }),
    )
  })

  it('approves as a voucher: the refund is done and a voucher exists', async () => {
    const { svc } = await makeService()
    /* REF-0121 is the demo customer's, so the new voucher shows on that customer's page. REF-0122 is another customer's. */
    const detail = await svc.decide('REF-0121', STAFF, decision('approve_voucher', 'Returned as a voucher.'))

    expect(detail.status).toBe('succeeded')
    expect(detail.status_label).toBe('Voucher issued')
    expect(detail.voucher_amount).toBe(45)
    expect(detail.provider_refund_id).toBeNull()
    expect(detail.voucher_code).toMatch(/^VCH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)

    const vouchers = await svc.listMyVouchers(USER)
    expect(vouchers.items.some((voucher) => voucher.code === detail.voucher_code && voucher.amount === 45)).toBe(true)
  })

  it('records an override when a refund outside the fare rules is approved, and not when it is rejected', async () => {
    const { svc, audit } = await makeService()
    const approved = await svc.decide('REF-0122', STAFF, decision('approve_card'))
    expect(approved.decision?.override).toBe(true)
    expect(audit.tryWrite).toHaveBeenCalledWith(expect.objectContaining({ after: expect.objectContaining({ override: true }) }))

    const { svc: other } = await makeService()
    const rejected = await other.decide('REF-0122', STAFF, decision('reject', 'Non-refundable fare.'))
    expect(rejected.decision?.override).toBe(false)
  })

  it('rejects with the reason the customer is sent', async () => {
    const { svc } = await makeService()
    const detail = await svc.decide('REF-0121', STAFF, decision('reject', 'Baggage was already used.'))
    const mine = await svc.getMyRefund(USER, 'REF-0121')

    expect(detail.status).toBe('rejected')
    expect(mine.tab).toBe('rejected')
    expect(mine.outcome_note).toBe('Baggage was already used.')
  })

  it('refuses to decide a refund twice, and refuses a compensation', async () => {
    const { svc } = await makeService()
    await svc.decide('REF-0121', STAFF, decision('approve_card'))

    await expect(svc.decide('REF-0121', STAFF, decision('reject', 'No.'))).rejects.toBeInstanceOf(ConflictException)
    await expect(svc.decide('REF-0113', STAFF, decision('reject', 'No.'))).rejects.toBeInstanceOf(ConflictException)
    await expect(svc.decide('REF-0131', STAFF, decision('reject', 'No.'))).rejects.toBeInstanceOf(ConflictException)
  })
})

describe('PaymentsRefundsService — the customer', () => {
  it('counts My refunds the way the frames do', async () => {
    const { svc } = await makeService()
    const mine = await svc.listMyRefunds(USER, {})

    expect(mine.counts).toEqual({ all: 4, in_progress: 1, refunded: 2, rejected: 1 })
    expect(mine.items.map((row) => row.status_label).sort()).toEqual([
      'Awaiting review',
      'Refunded to card',
      'Reissued as voucher',
      'Rejected',
    ])
  })

  it('words each outcome the way the frames do', async () => {
    const { svc } = await makeService()
    const byReference = async (reference: string) => svc.getMyRefund(USER, reference)

    expect((await byReference('REF-0121')).outcome_note).toBe('Staff are reviewing this request. You will get an email when it is decided.')
    expect((await byReference('REF-0113')).outcome_note).toBe(
      'Credited to Visa ending 4242. Reference RF-0113. It can take 5–10 working days to appear on your statement.',
    )
    expect((await byReference('REF-0113')).credit_note_number).toBe('CRN-0007')
    expect((await byReference('REF-0098')).outcome_note).toBe('Issued as a single-use voucher you can use at checkout.')
    expect((await byReference('REF-0090')).outcome_note).toContain('upgrade was already used')
  })

  it('queues a new request and refuses the same request twice', async () => {
    const { svc } = await makeService()
    const request = { booking_reference: 'K7QF2M', item: 'Seat 12A', amount: 18, reason: 'Wrong seat.' }
    const created = await svc.requestRefund(USER, Object.assign(new CreateRefundRequestDto(), request))

    expect(created.status_label).toBe('Awaiting review')
    expect(created.reference).toBe('REF-0132')
    expect((await svc.listQueue({})).counts.needs_review).toBe(4)

    await expect(svc.requestRefund(USER, Object.assign(new CreateRefundRequestDto(), request))).rejects.toBeInstanceOf(ConflictException)
  })

  it('refuses a request for a booking the mock does not know, or one that is not the customer’s', async () => {
    const { svc } = await makeService()

    await expect(
      svc.requestRefund(
        USER,
        Object.assign(new CreateRefundRequestDto(), { booking_reference: 'R5NH7C', item: 'Seat', amount: 5, reason: 'x' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(
      svc.requestRefund(
        USER,
        Object.assign(new CreateRefundRequestDto(), { booking_reference: 'ZZZZZZ', item: 'Seat', amount: 5, reason: 'x' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('lists the vouchers, usable ones first, and marks the one that ends soon', async () => {
    const { svc } = await makeService()
    const vouchers = await svc.listMyVouchers(USER)

    expect(vouchers.total).toBe(3)
    expect(vouchers.usable).toBe(2)
    expect(vouchers.items[vouchers.items.length - 1]).toMatchObject({
      code: 'VCH-1B6E-20WK',
      status_label: 'Redeemed',
      used_on: 'Used on booking M3XP9D',
    })
    const ending = vouchers.items.find((voucher) => voucher.code === 'VCH-3D8A-55TR')
    expect(ending).toMatchObject({ status_label: 'Expiring', expires_in_days: 9 })
  })
})

describe('PaymentsRefundsService — compensation and vouchers', () => {
  it('counts the history the way the frames do: five, three vouchers and two card refunds', async () => {
    const { svc } = await makeService()
    const history = await svc.listCompensation({})

    expect(history.counts).toEqual({ all: 5, vouchers: 3, card_refunds: 2 })
    const paying = history.items.find((entry) => entry.reference === 'RF-0131')
    expect(paying).toMatchObject({ kind: 'card_refund', status_label: 'Paying to card', can_void: false, value: 25 })
    expect(history.items.find((entry) => entry.reference === 'RF-0127')?.status_label).toBe('Refunded')
  })

  it('filters the chips', async () => {
    const { svc } = await makeService()

    expect((await svc.listCompensation({ filter: 'vouchers' })).items.every((entry) => entry.kind === 'voucher')).toBe(true)
    expect((await svc.listCompensation({ filter: 'card_refunds' })).total).toBe(2)
  })

  it('issues a voucher to a booking and writes the audit row', async () => {
    const { svc, audit } = await makeService()
    const entry = await svc.issueCompensation(STAFF, compensation())

    expect(entry).toMatchObject({ kind: 'voucher', value: 40, booking_reference: 'M3XP9D', status_label: 'Active', can_void: true })
    expect(entry.reference).toMatch(/^VCH-/)
    expect((await svc.listCompensation({})).counts).toEqual({ all: 6, vouchers: 4, card_refunds: 2 })
    expect(audit.tryWrite).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', reason: 'Delay over 3 hours on FY102' }))
  })

  it('issues a card refund that cannot be voided', async () => {
    const { svc } = await makeService()
    const entry = await svc.issueCompensation(STAFF, compensation({ kind: 'card_refund', amount: 25, booking_reference: 'F6RW9K' }))

    expect(entry).toMatchObject({ kind: 'card_refund', status_label: 'Paying to card', can_void: false })
    await expect(svc.voidVoucher(entry.id, STAFF, {})).rejects.toBeInstanceOf(NotFoundException)
  })

  it('voids an unused voucher once, and never a used one', async () => {
    const { svc, audit } = await makeService()
    const voided = await svc.voidVoucher('VCH-7K2M-91QD', STAFF, {})

    expect(voided.status_label).toBe('Voided')
    expect(voided.can_void).toBe(false)
    expect(audit.tryWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'status_change', reason: 'Voided by staff', after: { status: 'cancelled' } }),
    )
    await expect(svc.voidVoucher('VCH-7K2M-91QD', STAFF, {})).rejects.toBeInstanceOf(ConflictException)
    await expect(svc.voidVoucher('VCH-1B6E-20WK', STAFF, {})).rejects.toBeInstanceOf(ConflictException)
  })

  it('keeps a voided voucher in the history but not in the customer’s vouchers', async () => {
    const { svc } = await makeService()
    await svc.voidVoucher('VCH-7K2M-91QD', STAFF, { reason: 'Issued by mistake' })

    expect((await svc.listCompensation({})).items.find((entry) => entry.reference === 'VCH-7K2M-91QD')?.status_label).toBe('Voided')
    expect((await svc.listMyVouchers(USER)).items.some((voucher) => voucher.code === 'VCH-7K2M-91QD')).toBe(false)
  })

  it('refuses to issue to a booking it does not know', async () => {
    const { svc } = await makeService()

    await expect(svc.issueCompensation(STAFF, compensation({ booking_reference: 'ZZZZZZ' }))).rejects.toBeInstanceOf(NotFoundException)
  })
})
