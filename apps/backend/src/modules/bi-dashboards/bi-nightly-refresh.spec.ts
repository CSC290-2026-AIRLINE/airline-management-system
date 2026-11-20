import { ConflictException, InternalServerErrorException, Logger } from '@nestjs/common'
import { BiNightlyRefresh, msUntilNextRun } from './bi-nightly-refresh'

jest.mock('./bi-etl.service', () => ({ BiEtlService: class {} }))

const HOUR = 3_600_000

function setup() {
  const etl = { refresh: jest.fn().mockResolvedValue({ id: 'run-1' }) }
  return { etl, nightly: new BiNightlyRefresh(etl as never) }
}

describe('msUntilNextRun', () => {
  it('waits until 02:00 later the same night', () => {
    expect(msUntilNextRun(new Date(2026, 10, 20, 0, 30), 2)).toBe(1.5 * HOUR)
  })

  it('waits until tomorrow once 02:00 has passed, including exactly at 02:00', () => {
    expect(msUntilNextRun(new Date(2026, 10, 20, 14, 0), 2)).toBe(12 * HOUR)
    expect(msUntilNextRun(new Date(2026, 10, 20, 2, 0), 2)).toBe(24 * HOUR)
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

  it('fires at 02:00, runs again the next night, and stops when the module is destroyed', async () => {
    jest.useFakeTimers({ now: new Date(2026, 10, 20, 1, 0) })
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
