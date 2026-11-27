import { ConflictException } from '@nestjs/common'
import { BiEtlService } from './bi-etl.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

/** Calls `refreshWhenFree` on a bare instance, with `refresh` replaced, so no database or clock is needed. */
function waiter(refresh: jest.Mock): BiEtlService {
  const service = Object.create(BiEtlService.prototype) as BiEtlService
  Object.assign(service, { refresh })
  return service
}

describe('BiEtlService.refreshWhenFree', () => {
  it('returns the run when nothing is in progress', async () => {
    const refresh = jest.fn().mockResolvedValue({ id: 'run-1' })
    await expect(waiter(refresh).refreshWhenFree('manual', 'staff')).resolves.toEqual({ id: 'run-1' })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('waits out a run in progress, then runs', async () => {
    const refresh = jest
      .fn()
      .mockRejectedValueOnce(new ConflictException('RUN_IN_PROGRESS'))
      .mockRejectedValueOnce(new ConflictException('RUN_IN_PROGRESS'))
      .mockResolvedValue({ id: 'run-2' })
    await expect(waiter(refresh).refreshWhenFree('manual', 'staff')).resolves.toEqual({ id: 'run-2' })
    expect(refresh).toHaveBeenCalledTimes(3)
    expect(refresh).toHaveBeenLastCalledWith('manual', 'staff')
  })

  it('passes other errors straight through without retrying', async () => {
    const refresh = jest.fn().mockRejectedValue(new Error('database down'))
    await expect(waiter(refresh).refreshWhenFree('manual', 'staff')).rejects.toThrow('database down')
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
