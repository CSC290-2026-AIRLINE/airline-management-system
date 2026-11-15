import { ConflictException, ForbiddenException } from '@nestjs/common'
import type { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import type { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import type { FinancePostingService, PaymentSettingsService } from '../services/support.services'
import { lineAmountCents, minutesToHundredths, netByCrew, pairingQuantities } from './crew-pay-math'
import { CrewPayService } from './crew-pay.service'
import { FakePayoutProvider } from './payout.provider'

jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))
jest.mock('@backend/modules/admin-console/audit/audit.service', () => ({ AuditService: class AuditService {} }))

const BKK = 'Asia/Bangkok'
const at = (iso: string) => new Date(iso)

describe('crew pay math', () => {
  it('rounds each line half up to the cent, as the payroll_line CHECK recomputes it', () => {
    // 3.33 h x 25.00 x 1.50 = 124.875 -> 124.88
    expect(lineAmountCents(333, 2500, 150)).toBe(12488)
    // 0.01 h x 0.01 x 1.00 = 0.0001 -> 0.00
    expect(lineAmountCents(1, 1, 100)).toBe(0)
    expect(lineAmountCents(1250, 8500, 100)).toBe(106250)
  })

  it('turns minutes into hundredths of an hour, half up', () => {
    expect(minutesToHundredths(75)).toBe(125)
    expect(minutesToHundredths(20)).toBe(33)
    expect(minutesToHundredths(1)).toBe(2)
  })

  it('sums flight hours, overtime per duty day and overnights for a two-day pairing', () => {
    const q = pairingQuantities({
      // Day 1 (local): 06:00-07:15 and 16:00-17:15 -> duty 05:00-17:15 = 12.25 h, 2.25 h over a 10 h threshold.
      // Day 2: 08:00-09:15 -> duty 07:00-09:15, no overtime. One overnight.
      legs: [
        { depAt: at('2026-11-17T23:00:00Z'), arrAt: at('2026-11-18T00:15:00Z') },
        { depAt: at('2026-11-18T09:00:00Z'), arrAt: at('2026-11-18T10:15:00Z') },
        { depAt: at('2026-11-19T01:00:00Z'), arrAt: at('2026-11-19T02:15:00Z') },
      ],
      timeZone: BKK,
      reportMinutes: 60,
      releaseMinutes: 0,
      overtimeThresholdHours: 10,
    })
    expect(q).toEqual({ flightHundredths: 375, overtimeHundredths: 225, overnightHundredths: 100, dutyDays: 2, earnedOn: '2026-11-19' })
  })

  it('nets each crew member across their lines, including negative adjustments', () => {
    const net = netByCrew([
      { crewId: 'a', amountCents: 10000 },
      { crewId: 'a', amountCents: -2500 },
      { crewId: 'b', amountCents: -500 },
    ])
    expect(net.get('a')).toBe(7500)
    expect(net.get('b')).toBe(-500)
  })
})

const finance = { kind: 'staff' as const, userId: 'u-fin', staffId: 's-fin', isAdmin: false, roleCode: 'finance' }
const admin = { kind: 'staff' as const, userId: 'u-adm', staffId: 's-adm', isAdmin: true, roleCode: 'admin' }

function setup(run: Record<string, unknown> | null) {
  const db = {
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(db)),
    $queryRaw: jest.fn().mockResolvedValue([]),
    pay_run: {
      findUnique: jest.fn().mockResolvedValue(run),
      update: jest.fn().mockImplementation(({ data }: { data: object }) => ({ ...run, ...data })),
    },
    payout: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    payroll_line: { updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    pricing_setting: { findUnique: jest.fn().mockResolvedValue({ value: 'USD' }) },
  }
  const settings = { get: jest.fn().mockResolvedValue(50000) }
  const postings = { post: jest.fn() }
  const audit = { write: jest.fn().mockResolvedValue({ id: 'audit-1', seq: '1' }) }
  const service = new CrewPayService(
    db as never,
    { now: () => at('2026-11-30T10:00:00Z') } as unknown as SimulationClock,
    settings as unknown as PaymentSettingsService,
    postings as unknown as FinancePostingService,
    audit as unknown as AuditService,
    new FakePayoutProvider(),
  )
  return { db, settings, postings, audit, service }
}

describe('CrewPayService pay runs', () => {
  const draft = (overrides: Record<string, unknown> = {}) => ({
    id: 'run-1',
    status: 'draft',
    created_by_staff_id: 's-fin',
    payroll_line: [{ amount: '1062.50', line_type: 'base' }],
    ...overrides,
  })

  it('refuses an approval by the run creator (PAY_RUN_SELF_APPROVAL)', async () => {
    const { service } = setup(draft())
    const error = await service.approve(finance, 'run-1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ForbiddenException)
    expect((error as ForbiddenException).getResponse()).toMatchObject({ error: { code: 'PAY_RUN_SELF_APPROVAL' } })
  })

  it('needs an admin and writes an audit entry for a run with an adjustment', async () => {
    const run = draft({ created_by_staff_id: 's-other', payroll_line: [{ amount: '-50.00', line_type: 'adjustment' }] })
    const { db, audit, service } = setup(run)

    await expect(service.approve(finance, 'run-1', 'ok')).rejects.toBeInstanceOf(ForbiddenException)
    await service.approve(admin, 'run-1', 'Correction for P-101 checked')

    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'pay_run', entityId: 'run-1' }), db)
    expect(db.pay_run.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'approved', approved_by_staff_id: 's-adm', audit_log_id: 'audit-1' }),
      }),
    )
  })

  it('approves a small run without an admin or an audit entry', async () => {
    const { audit, db, service } = setup(draft({ created_by_staff_id: 's-other' }))
    await service.approve(finance, 'run-1')
    expect(audit.write).not.toHaveBeenCalled()
    expect(db.pay_run.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'approved', audit_log_id: null }) }),
    )
  })

  it('pays one payout per crew member and carries a negative net to the next run', async () => {
    const run = draft({
      status: 'approved',
      payroll_line: [
        { crew_id: 'a', amount: '300.00', line_type: 'base', crew: { email: 'a@crew.test' } },
        { crew_id: 'a', amount: '45.00', line_type: 'overtime', crew: { email: 'a@crew.test' } },
        { crew_id: 'b', amount: '-80.00', line_type: 'adjustment', crew: { email: 'b@crew.test' } },
      ],
    })
    const { db, postings, service } = setup(run)

    await service.pay(finance, 'run-1')

    expect(db.payout.create).toHaveBeenCalledTimes(1)
    expect(db.payout.create).toHaveBeenCalledWith({ data: expect.objectContaining({ crew_id: 'a', amount: '345.00', status: 'paid' }) })
    expect(db.payroll_line.updateMany).toHaveBeenCalledWith({
      where: { pay_run_id: 'run-1', crew_id: { in: ['a'] } },
      data: { status: 'paid' },
    })
    expect(db.payroll_line.updateMany).toHaveBeenCalledWith({
      where: { pay_run_id: 'run-1', crew_id: { in: ['b'] } },
      data: { status: 'accrued', pay_run_id: null },
    })
    expect(postings.post).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ postingKey: 'crew_pay_paid:run-1', postingType: 'crew_pay_paid' }),
    )
  })

  it('refuses to pay a run that is not approved', async () => {
    const { service } = setup(draft())
    await expect(service.pay(finance, 'run-1')).rejects.toBeInstanceOf(ConflictException)
  })

  it('keeps pay runs to finance and admins', () => {
    const { service } = setup(null)
    expect(() => service.assertFinance({ ...finance, roleCode: 'gate' })).toThrow(ForbiddenException)
  })

  it('stores a failed payout with its reason, keeps that person in the run unpaid, and still pays the others', async () => {
    const run = draft({
      status: 'approved',
      payroll_line: [
        { crew_id: 'a', amount: '300.00', line_type: 'base', crew: { email: 'a@crew.test' } },
        { crew_id: 'c', amount: '200.00', line_type: 'base', crew: { email: null } },
      ],
    })
    const { db, postings, service } = setup(run)

    await service.pay(finance, 'run-1')

    expect(db.payout.create).toHaveBeenCalledWith({ data: expect.objectContaining({ crew_id: 'a', status: 'paid' }) })
    expect(db.payout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ crew_id: 'c', status: 'failed', failure_reason: expect.stringContaining('No payout destination') }),
    })
    // Only 'a' becomes paid; 'c' keeps its lines in the run for a retry.
    expect(db.payroll_line.updateMany).toHaveBeenCalledTimes(1)
    expect(db.payroll_line.updateMany).toHaveBeenCalledWith({
      where: { pay_run_id: 'run-1', crew_id: { in: ['a'] } },
      data: { status: 'paid' },
    })
    expect(postings.post).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ payload: expect.objectContaining({ payouts: 1, failed_payouts: 1, total: '300.00' }) }),
    )
  })

  it('retries a failed payout: still failing keeps it failed, succeeding pays the lines and posts once', async () => {
    const { db, postings, service } = setup(null)
    db.payout.findUnique.mockResolvedValueOnce({
      id: 'po-1',
      status: 'failed',
      crew_id: 'c',
      pay_run_id: 'run-1',
      amount: '200.00',
      crew: { email: null },
    })

    await service.retryPayout(finance, 'po-1')
    expect(db.payout.update).toHaveBeenCalledWith({
      where: { id: 'po-1' },
      data: { failure_reason: expect.stringContaining('No payout destination') },
    })
    expect(postings.post).not.toHaveBeenCalled()

    db.payout.findUnique.mockResolvedValueOnce({
      id: 'po-1',
      status: 'failed',
      crew_id: 'c',
      pay_run_id: 'run-1',
      amount: '200.00',
      crew: { email: 'c@crew.test' },
    })
    db.payroll_line.findMany.mockResolvedValueOnce([{ id: 'l1', line_type: 'base', amount: '200.00' }])

    await service.retryPayout(finance, 'po-1')
    expect(db.payroll_line.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['l1'] } }, data: { status: 'paid' } })
    expect(db.payout.update).toHaveBeenLastCalledWith({
      where: { id: 'po-1' },
      data: expect.objectContaining({ status: 'paid', failure_reason: null, reference: expect.stringMatching(/^fake_po_/) }),
    })
    expect(postings.post).toHaveBeenCalledWith(db, expect.objectContaining({ postingKey: 'crew_pay_paid:payout:po-1' }))
  })

  it('refuses to retry a payout that did not fail', async () => {
    const { db, service } = setup(null)
    db.payout.findUnique.mockResolvedValue({ id: 'po-2', status: 'paid', crew: { email: 'x' } })
    await expect(service.retryPayout(finance, 'po-2')).rejects.toBeInstanceOf(ConflictException)
  })
})
