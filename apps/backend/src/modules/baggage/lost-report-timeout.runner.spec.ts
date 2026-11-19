import { Logger } from '@nestjs/common'
jest.mock('./lost-report-lifecycle.service', () => ({
  LostReportLifecycleService: class LostReportLifecycleService {},
}))
import { LostReportLifecycleService } from './lost-report-lifecycle.service'
import { LostReportTimeoutRunner } from './lost-report-timeout.runner'

describe('LostReportTimeoutRunner', () => {
  const evaluatedAt = new Date('2026-11-08T00:00:00.000Z')

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('sweeps immediately at startup and repeats periodically', async () => {
    jest.useFakeTimers()
    const markTimedOutReports = jest.fn().mockResolvedValue({ marked: 0, evaluatedAt })
    const runner = new LostReportTimeoutRunner({ markTimedOutReports } as unknown as LostReportLifecycleService)

    runner.onModuleInit()
    await Promise.resolve()
    expect(markTimedOutReports).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(60_000)
    expect(markTimedOutReports).toHaveBeenCalledTimes(2)
    runner.onModuleDestroy()
  })

  it('suppresses overlapping local sweeps and resumes on a later interval', async () => {
    jest.useFakeTimers()
    let completeSweep!: (value: { marked: number; evaluatedAt: Date }) => void
    const markTimedOutReports = jest
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (completeSweep = resolve)))
      .mockResolvedValue({ marked: 0, evaluatedAt })
    const runner = new LostReportTimeoutRunner({ markTimedOutReports } as unknown as LostReportLifecycleService)

    runner.onModuleInit()
    await jest.advanceTimersByTimeAsync(120_000)
    expect(markTimedOutReports).toHaveBeenCalledTimes(1)

    completeSweep({ marked: 0, evaluatedAt })
    await Promise.resolve()
    await jest.advanceTimersByTimeAsync(60_000)
    expect(markTimedOutReports).toHaveBeenCalledTimes(2)
    runner.onModuleDestroy()
  })

  it('logs sweep failures and continues on the next interval', async () => {
    jest.useFakeTimers()
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation()
    const markTimedOutReports = jest
      .fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue({ marked: 0, evaluatedAt })
    const runner = new LostReportTimeoutRunner({ markTimedOutReports } as unknown as LostReportLifecycleService)

    runner.onModuleInit()
    await Promise.resolve()
    await Promise.resolve()
    expect(logger).toHaveBeenCalledWith('Lost-report timeout sweep failed', expect.any(String))

    await jest.advanceTimersByTimeAsync(60_000)
    expect(markTimedOutReports).toHaveBeenCalledTimes(2)
    runner.onModuleDestroy()
  })
})
