import { Logger } from '@nestjs/common'
jest.mock('./found-bag-lifecycle.service', () => ({
  FoundBagLifecycleService: class FoundBagLifecycleService {},
}))
import { FoundBagLifecycleService } from './found-bag-lifecycle.service'
import { FoundBagUnclaimedRunner } from './found-bag-unclaimed.runner'

describe('FoundBagUnclaimedRunner', () => {
  const result = { unclaimedAfterDays: 90, cutoff: new Date('2026-07-23T00:00:00.000Z'), marked: 0 }

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('sweeps immediately at startup and repeats periodically', async () => {
    jest.useFakeTimers()
    const markUnclaimed = jest.fn().mockResolvedValue(result)
    const runner = new FoundBagUnclaimedRunner({ markUnclaimed } as unknown as FoundBagLifecycleService)

    runner.onModuleInit()
    await Promise.resolve()
    expect(markUnclaimed).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(60_000)
    expect(markUnclaimed).toHaveBeenCalledTimes(2)
    runner.onModuleDestroy()
  })

  it('runs as the system, without a staff actor', async () => {
    jest.useFakeTimers()
    const markUnclaimed = jest.fn().mockResolvedValue(result)
    const runner = new FoundBagUnclaimedRunner({ markUnclaimed } as unknown as FoundBagLifecycleService)

    runner.onModuleInit()
    await Promise.resolve()
    expect(markUnclaimed).toHaveBeenCalledWith()
    runner.onModuleDestroy()
  })

  it('suppresses overlapping local sweeps and resumes on a later interval', async () => {
    jest.useFakeTimers()
    let completeSweep!: (value: typeof result) => void
    const markUnclaimed = jest
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (completeSweep = resolve)))
      .mockResolvedValue(result)
    const runner = new FoundBagUnclaimedRunner({ markUnclaimed } as unknown as FoundBagLifecycleService)

    runner.onModuleInit()
    await jest.advanceTimersByTimeAsync(120_000)
    expect(markUnclaimed).toHaveBeenCalledTimes(1)

    completeSweep(result)
    await Promise.resolve()
    await jest.advanceTimersByTimeAsync(60_000)
    expect(markUnclaimed).toHaveBeenCalledTimes(2)
    runner.onModuleDestroy()
  })

  it('logs sweep failures and continues on the next interval', async () => {
    jest.useFakeTimers()
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation()
    const markUnclaimed = jest.fn().mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue(result)
    const runner = new FoundBagUnclaimedRunner({ markUnclaimed } as unknown as FoundBagLifecycleService)

    runner.onModuleInit()
    await Promise.resolve()
    await Promise.resolve()
    expect(logger).toHaveBeenCalledWith('Found-bag unclaimed sweep failed', expect.any(String))

    await jest.advanceTimersByTimeAsync(60_000)
    expect(markUnclaimed).toHaveBeenCalledTimes(2)
    runner.onModuleDestroy()
  })
})
