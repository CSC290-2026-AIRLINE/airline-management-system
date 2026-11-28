import { ConflictException, InternalServerErrorException, Logger } from '@nestjs/common'
import { BiNightlyRefresh, NIGHTLY_HOUR_UTC, msUntilNextRun } from './bi-nightly-refresh'

jest.mock('./bi-etl.service', () => ({ BiEtlService: class {} }))

const HOUR = 3_600_000

function setup() {
  const etl = { refresh: jest.fn().mockResolvedValue({ id: 'run-1' }) }
  return { etl, nightly: new BiNightlyRefresh(etl as never) }
}

// UTC instants, so the spec gives the same answer on a laptop in Bangkok and in UTC CI.
const utc = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2026, 10, day, hour, minute))

describe('msUntilNextRun', () => {
  it('runs at 19:00 UTC, which is 02:00 in Bangkok', () => {
    expect(NIGHTLY_HOUR_UTC).toBe(19)
    expect(new Date(utc(20, 0).getTime() + msUntilNextRun(utc(20, 0))).toISOString()).toBe('2026-11-20T19:00:00.000Z')
  })

  it('waits until 19:00 UTC later the same day', () => {
    expect(msUntilNextRun(utc(20, 17, 30))).toBe(1.5 * HOUR)
  })

  it('waits until the next day once 19:00 UTC has passed, including exactly at 19:00', () => {
    expect(msUntilNextRun(utc(20, 21))).toBe(22 * HOUR)
    expect(msUntilNextRun(utc(20, 19))).toBe(24 * HOUR)
  })

  it('rolls over the end of a month', () => {
    expect(new Date(utc(30, 20).getTime() + msUntilNextRun(utc(30, 20))).toISOString()).toBe('2026-12-01T19:00:00.000Z')
  })
})

describe('BiNightlyRefresh', () => {
  let warn: jest.SpyInstance
  let error: jest.SpyInstance
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it('runs a scheduled refresh with no staff member', async () => {
    const { etl, nightly } = setup()
    await nightly.run()
    expect(etl.refresh).toHaveBeenCalledWith('scheduled', null)
  })

  it('logs and skips a night that finds a run in progress, without throwing', async () => {
    const { etl, nightly } = setup()
    etl.refresh.mockRejectedValue(new ConflictException('RUN_IN_PROGRESS'))
    await expect(nightly.run()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('RUN_IN_PROGRESS'))
    expect(error).not.toHaveBeenCalled()
  })

  it('logs a failed run without throwing', async () => {
    const { etl, nightly } = setup()
    etl.refresh.mockRejectedValue(new InternalServerErrorException('REFRESH_FAILED'))
    await expect(nightly.run()).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('REFRESH_FAILED'))
  })

  it('fires at 19:00 UTC, runs again the next night, and stops when the module is destroyed', async () => {
    jest.useFakeTimers({ now: utc(20, 18) })
    const { etl, nightly } = setup()
    nightly.onModuleInit()

    await jest.advanceTimersByTimeAsync(HOUR - 1)
    expect(etl.refresh).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)
    expect(etl.refresh).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(24 * HOUR)
    expect(etl.refresh).toHaveBeenCalledTimes(2)

    nightly.onModuleDestroy()
    await jest.advanceTimersByTimeAsync(48 * HOUR)
    expect(etl.refresh).toHaveBeenCalledTimes(2)
  })
})
