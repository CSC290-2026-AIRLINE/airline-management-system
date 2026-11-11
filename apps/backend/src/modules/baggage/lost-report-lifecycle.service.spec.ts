import { InternalServerErrorException } from '@nestjs/common'
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))
import { DbService } from '@backend/db/db.service'
import { MockSimulationClock } from './mocks/mock-simulation.clock'
import { LostReportLifecycleService } from './lost-report-lifecycle.service'

const DAY_MS = 24 * 60 * 60 * 1000
const TIMEOUT_DAYS = 21

type TestReport = {
  id: string
  status: string
  reported_at: Date
  lost_at: Date | null
  hasConfirmedMatch: boolean
}

function makeService(reports: TestReport[], initialTime: Date) {
  const clock = new MockSimulationClock(initialTime)
  const updateMany = jest.fn(({ where, data }: any) => {
    const eligibleIds = new Set(where.id.in as string[])
    let count = 0

    for (const report of reports) {
      if (
        eligibleIds.has(report.id) &&
        report.status === where.status &&
        report.lost_at === where.lost_at &&
        report.reported_at <= where.reported_at.lte &&
        !report.hasConfirmedMatch
      ) {
        report.status = data.status
        report.lost_at = data.lost_at
        count += 1
      }
    }

    return Promise.resolve({ count })
  })

  // The threshold is read inside the transaction with the FOR SHARE row lock; reports are then locked FOR UPDATE.
  const setting = { value: String(TIMEOUT_DAYS) as string | null }
  const queryRaw = jest.fn((strings: TemplateStringsArray, param: unknown) => {
    if (strings.join(' ').includes('FROM baggage_setting')) {
      return Promise.resolve(setting.value === null ? [] : [{ value: setting.value }])
    }
    const cutoff = param as Date
    return Promise.resolve(
      reports
        .filter((report) => report.status === 'open' && report.lost_at === null && report.reported_at <= cutoff)
        .map(({ id }) => ({ id })),
    )
  })
  const transaction = jest.fn(async (callback: (tx: any) => Promise<unknown>) =>
    callback({ $queryRaw: queryRaw, lost_bag_report: { updateMany } }),
  )

  // No baggage_setting delegate outside the transaction: a pre-transaction read would throw here.
  const db = {
    $transaction: transaction,
  } as unknown as DbService

  return {
    service: new LostReportLifecycleService(db, clock),
    clock,
    db,
    setting,
    queryRaw,
    transaction,
    updateMany,
  }
}

function report(
  id: string,
  status = 'open',
  reportedAt = new Date('2026-01-01T00:00:00.000Z'),
  lostAt: Date | null = null,
  hasConfirmedMatch = false,
): TestReport {
  return { id, status, reported_at: reportedAt, lost_at: lostAt, hasConfirmedMatch }
}

describe('LostReportLifecycleService', () => {
  const reportedAt = new Date('2026-01-01T00:00:00.000Z')
  const threshold = new Date(reportedAt.getTime() + TIMEOUT_DAYS * DAY_MS)

  it('leaves an open unmatched report unchanged just before the timeout threshold', async () => {
    const reports = [report('before-threshold')]
    const { service, updateMany } = makeService(reports, new Date(threshold.getTime() - 1))

    const result = await service.markTimedOutReports()

    expect(result.marked).toBe(0)
    expect(reports[0]).toMatchObject({ status: 'open', lost_at: null })
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('marks an open report lost exactly at the configured threshold, without closing it', async () => {
    const reports = [report('at-threshold')]
    const { service } = makeService(reports, threshold)

    const result = await service.markTimedOutReports()

    expect(result).toMatchObject({ lostAfterDays: TIMEOUT_DAYS, evaluatedAt: threshold, marked: 1 })
    expect(reports[0]).toMatchObject({ status: 'lost', lost_at: threshold })
    expect(reports[0]).not.toHaveProperty('closed_at')
  })

  it('does not transition an open report with a confirmed match', async () => {
    const reports = [report('confirmed-match', 'open', reportedAt, null, true)]
    const { service, updateMany } = makeService(reports, threshold)

    const result = await service.markTimedOutReports()

    expect(result.marked).toBe(0)
    expect(reports[0]).toMatchObject({ status: 'open', lost_at: null })
    expect(updateMany.mock.calls[0][0].where.bag_match).toEqual({ none: { status: 'confirmed' } })
  })

  it.each(['matched', 'delivering', 'cancelled', 'closed', 'lost'])('leaves a %s report unchanged', async (status) => {
    const existingLostAt = status === 'lost' ? new Date('2026-01-15T00:00:00.000Z') : null
    const reports = [report(`status-${status}`, status, reportedAt, existingLostAt)]
    const { service, updateMany } = makeService(reports, threshold)

    const result = await service.markTimedOutReports()

    expect(result.marked).toBe(0)
    expect(reports[0]).toMatchObject({ status, lost_at: existingLostAt })
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('preserves an existing lost_at value and is idempotent on repeated invocation', async () => {
    const reports = [report('repeat')]
    const { service, clock } = makeService(reports, threshold)

    expect((await service.markTimedOutReports()).marked).toBe(1)
    const firstLostAt = reports[0].lost_at

    clock.setTime(new Date(threshold.getTime() + 2 * DAY_MS))
    expect((await service.markTimedOutReports()).marked).toBe(0)
    expect(reports[0].lost_at).toEqual(firstLostAt)
  })

  it('uses advancing and rewinding simulation time to evaluate the cutoff', async () => {
    const reports = [report('clock-controlled')]
    const { service, clock } = makeService(reports, new Date(threshold.getTime() - 2 * DAY_MS))

    expect((await service.markTimedOutReports()).marked).toBe(0)
    clock.setTime(threshold)
    expect((await service.markTimedOutReports()).marked).toBe(1)

    const originalLostAt = reports[0].lost_at
    clock.setTime(new Date(reportedAt.getTime() + DAY_MS))
    expect((await service.markTimedOutReports()).marked).toBe(0)
    expect(reports[0].lost_at).toEqual(originalLostAt)
  })

  it('catches up when simulation time jumps well beyond the timeout in one advance', async () => {
    const reports = [report('large-time-jump')]
    const { service, clock } = makeService(reports, reportedAt)

    expect((await service.markTimedOutReports()).marked).toBe(0)
    clock.setTime(new Date(reportedAt.getTime() + 365 * DAY_MS))

    const result = await service.markTimedOutReports()

    expect(result.cutoff).toEqual(new Date(reportedAt.getTime() + (365 - TIMEOUT_DAYS) * DAY_MS))
    expect(result.marked).toBe(1)
    expect(reports[0]).toMatchObject({ status: 'lost', lost_at: new Date(reportedAt.getTime() + 365 * DAY_MS) })
  })

  it('locks due open report rows before updating and rechecks confirmed matches in the database update', async () => {
    const reports = [report('locking')]
    const { service, queryRaw, updateMany, transaction } = makeService(reports, threshold)

    await service.markTimedOutReports()

    expect(transaction).toHaveBeenCalledTimes(1)
    // Call 0 is the setting read (FOR SHARE); call 1 locks the due reports.
    expect(queryRaw.mock.invocationCallOrder[1]).toBeLessThan(updateMany.mock.invocationCallOrder[0])
    const sql = queryRaw.mock.calls[1][0].join(' ')
    expect(sql).toContain("status = 'open'")
    expect(sql).toContain('lost_at IS NULL')
    expect(sql).toContain('reported_at <=')
    expect(sql).toContain('ORDER BY id')
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')

    expect(updateMany.mock.calls[0][0].where).toMatchObject({
      status: 'open',
      lost_at: null,
      bag_match: { none: { status: 'confirmed' } },
    })
    expect(updateMany.mock.calls[0][0].data).toMatchObject({ status: 'lost', lost_at: threshold })
    expect(updateMany.mock.calls[0][0].data).not.toHaveProperty('closed_at')
  })

  it.each([
    ['invalid', 'not-a-duration'],
    ['absent', null],
  ])('fails clearly when the configured timeout is %s, before locking or changing any report', async (_label, value) => {
    const reports = [report('kept-open')]
    const { service, setting, queryRaw, updateMany } = makeService(reports, threshold)
    setting.value = value

    await expect(service.markTimedOutReports()).rejects.toBeInstanceOf(InternalServerErrorException)
    expect(queryRaw).toHaveBeenCalledTimes(1)
    expect(updateMany).not.toHaveBeenCalled()
    expect(reports[0].status).toBe('open')
  })

  it('reads lost_after_days under a FOR SHARE lock as the first statement of the sweep transaction', async () => {
    const reports = [report('due')]
    const { service, queryRaw, transaction } = makeService(reports, threshold)

    await service.markTimedOutReports()

    expect(transaction).toHaveBeenCalledTimes(1)
    const [settingSql, ...params] = queryRaw.mock.calls[0]
    expect(settingSql.join('?')).toMatch(/SELECT value FROM baggage_setting WHERE key = \? FOR SHARE/)
    expect(params).toEqual(['lost_after_days'])
    expect(queryRaw.mock.calls[1][0].join(' ')).toContain('FROM lost_bag_report')
  })

  it('applies the value read under the lock in its own transaction, not one from before it', async () => {
    const reports = [report('due-at-21-not-at-30')]
    const { service, setting, queryRaw, updateMany, transaction } = makeService(reports, threshold)
    // An admin raised the threshold to 30, committing just before this sweep's transaction took its lock.
    transaction.mockImplementationOnce(async (callback: (tx: any) => Promise<unknown>) => {
      setting.value = '30'
      return callback({ $queryRaw: queryRaw, lost_bag_report: { updateMany } })
    })

    await expect(service.markTimedOutReports()).resolves.toMatchObject({ lostAfterDays: 30, marked: 0 })
    expect(reports[0].status).toBe('open')
  })
})
