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

  const queryRaw = jest.fn((_strings: TemplateStringsArray, cutoff: Date) =>
    Promise.resolve(
      reports
        .filter((report) => report.status === 'open' && report.lost_at === null && report.reported_at <= cutoff)
        .map(({ id }) => ({ id })),
    ),
  )
  const findSetting = jest.fn().mockResolvedValue({ value: String(TIMEOUT_DAYS) })
  const transaction = jest.fn(async (callback: (tx: any) => Promise<number>) =>
    callback({ $queryRaw: queryRaw, lost_bag_report: { updateMany } }),
  )

  const db = {
    baggage_setting: {
      findUnique: findSetting,
    },
    $transaction: transaction,
  } as unknown as DbService

  return {
    service: new LostReportLifecycleService(db, clock),
    clock,
    db,
    findSetting,
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
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(updateMany.mock.invocationCallOrder[0])
    const sql = queryRaw.mock.calls[0][0].join(' ')
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

  it('fails clearly when the configured timeout is absent or invalid', async () => {
    const { service, transaction, findSetting } = makeService([], threshold)
    findSetting.mockResolvedValue({ value: 'not-a-duration' })

    await expect(service.markTimedOutReports()).rejects.toBeInstanceOf(InternalServerErrorException)
    expect(transaction).not.toHaveBeenCalled()
  })
})
