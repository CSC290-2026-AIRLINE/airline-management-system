import { Logger } from '@nestjs/common'
import type { FoundBagLifecycleService } from './found-bag-lifecycle.service'
import { FoundBagUnclaimedRunner, UNCLAIMED_SWEEP_INTERVAL_MS } from './found-bag-unclaimed.runner'

jest.mock('./found-bag-lifecycle.service', () => ({ FoundBagLifecycleService: class {} }))

const RESULT = { unclaimedAfterDays: 30, cutoff: new Date('2026-10-01T00:00:00Z'), marked: 0 }

function makeRunner(markUnclaimed: jest.Mock) {
  return new FoundBagUnclaimedRunner({ markUnclaimed } as unknown as FoundBagLifecycleService)
}

describe('FoundBagUnclaimedRunner', () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('sweeps at startup and then on every interval, as the system', async () => {
    jest.useFakeTimers()
    const markUnclaimed = jest.fn().mockResolvedValue(RESULT)
    const runner = makeRunner(markUnclaimed)

    runner.onModuleInit()
    await Promise.resolve()
    expect(markUnclaimed).toHaveBeenCalledTimes(1)
    expect(markUnclaimed).toHaveBeenCalledWith()

    await jest.advanceTimersByTimeAsync(UNCLAIMED_SWEEP_INTERVAL_MS)
    expect(markUnclaimed).toHaveBeenCalledTimes(2)

    runner.onModuleDestroy()
    await jest.advanceTimersByTimeAsync(UNCLAIMED_SWEEP_INTERVAL_MS)
    expect(markUnclaimed).toHaveBeenCalledTimes(2)
  })

  it('skips a sweep while the last one is still running', async () => {
    let finish!: (value: typeof RESULT) => void
    const markUnclaimed = jest
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockResolvedValue(RESULT)
    const runner = makeRunner(markUnclaimed)

    const first = runner.sweep()
    await runner.sweep()
    expect(markUnclaimed).toHaveBeenCalledTimes(1)

    finish(RESULT)
    await first
    await runner.sweep()
    expect(markUnclaimed).toHaveBeenCalledTimes(2)
  })

  it('suppresses overlapping timer sweeps and resumes on a later interval', async () => {
    jest.useFakeTimers()
    let finish!: (value: typeof RESULT) => void
    const markUnclaimed = jest
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockResolvedValue(RESULT)
    const runner = makeRunner(markUnclaimed)

    runner.onModuleInit()
    await jest.advanceTimersByTimeAsync(2 * UNCLAIMED_SWEEP_INTERVAL_MS)
    expect(markUnclaimed).toHaveBeenCalledTimes(1)

    finish(RESULT)
    await Promise.resolve()
    await jest.advanceTimersByTimeAsync(UNCLAIMED_SWEEP_INTERVAL_MS)
    expect(markUnclaimed).toHaveBeenCalledTimes(2)
    runner.onModuleDestroy()
  })

  it('logs a failed sweep and keeps going', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const markUnclaimed = jest
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue({ ...RESULT, marked: 2 })
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    const runner = makeRunner(markUnclaimed)

    await runner.sweep()
    expect(error).toHaveBeenCalledWith('Unclaimed bag sweep failed', expect.stringContaining('db down'))

    await runner.sweep()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Marked 2 held bag(s) unclaimed'))
  })
})
