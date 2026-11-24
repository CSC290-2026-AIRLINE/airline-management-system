import { ConflictException } from '@nestjs/common'
import { BI_AUTO_REFRESH_INTERVAL_MS, BiAutoRefresh } from './bi-auto-refresh'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('./bi-etl.service', () => ({ BiEtlService: class {} }))

describe('BiAutoRefresh', () => {
  function setup(refresh: jest.Mock) {
    return new BiAutoRefresh({ refresh } as never)
  }

  it('runs every 15 seconds', () => {
    expect(BI_AUTO_REFRESH_INTERVAL_MS).toBe(15_000)
  })

  it('refreshes as a scheduled run with no staff member', async () => {
    const refresh = jest.fn().mockResolvedValue({ id: 'run-1' })
    await setup(refresh).run()
    expect(refresh).toHaveBeenCalledWith('scheduled', null)
  })

  it('skips a tick when a run is already in progress, without throwing', async () => {
    const refresh = jest.fn().mockRejectedValue(new ConflictException('RUN_IN_PROGRESS'))
    await expect(setup(refresh).run()).resolves.toBeUndefined()
  })

  it('does not throw on other failures either, so the timer keeps going', async () => {
    const refresh = jest.fn().mockRejectedValue(new Error('database down'))
    await expect(setup(refresh).run()).resolves.toBeUndefined()
  })
})
