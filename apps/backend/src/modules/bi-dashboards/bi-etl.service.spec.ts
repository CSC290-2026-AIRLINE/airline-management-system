import { ConflictException } from '@nestjs/common'
import { BiEtlService } from './bi-etl.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

type Tx = { $executeRaw: jest.Mock; $queryRaw: jest.Mock }

function makeDb() {
  const tx: Tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([{ count: 3 }]),
  }
  const db = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (fn: (client: Tx) => Promise<unknown>) => fn(tx)),
    tx,
  }
  return db
}

const clock = { now: () => new Date('2026-11-07T00:00:00Z') }
const RUN_ID = '11111111-1111-4111-8111-111111111111'

describe('BiEtlService', () => {
  it('writes a running row, rebuilds in one transaction, then marks the run successful', async () => {
    const db = makeDb()
    db.$queryRaw
      .mockResolvedValueOnce([{ id: RUN_ID }])
      .mockResolvedValueOnce([{ id: RUN_ID, trigger: 'manual', status: 'success', row_count: 3 }])
    const service = new BiEtlService(db as never, clock as never)

    const run = await service.refresh('manual', 'staff-1')

    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.tx.$executeRaw).toHaveBeenCalled()
    expect(run).toEqual(expect.objectContaining({ status: 'success', row_count: 3 }))
    expect(db.$queryRaw).toHaveBeenLastCalledWith(expect.anything(), 3, RUN_ID)
  })

  it('maps a second concurrent run to a conflict', async () => {
    const db = makeDb()
    db.$queryRaw.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "bi_etl_run_one_running_uq"'))
    const service = new BiEtlService(db as never, clock as never)

    await expect(service.refresh('manual', 'staff-1')).rejects.toBeInstanceOf(ConflictException)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('marks the run failed and rethrows when the rebuild fails, leaving the old copy in place', async () => {
    const db = makeDb()
    db.$queryRaw.mockResolvedValueOnce([{ id: RUN_ID }])
    db.tx.$executeRaw.mockRejectedValueOnce(new Error('boom'))
    const service = new BiEtlService(db as never, clock as never)

    await expect(service.refresh('scheduled', null)).rejects.toThrow('REFRESH_FAILED')
    expect(db.$executeRaw).toHaveBeenLastCalledWith(expect.anything(), 'boom', RUN_ID)
  })

  it('fails runs left running by a previous process on startup', async () => {
    const db = makeDb()
    const service = new BiEtlService(db as never, clock as never)

    await service.onModuleInit()

    expect(db.$executeRaw).toHaveBeenCalled()
  })

  it('returns null for a user who is not staff', async () => {
    const db = makeDb()
    db.$queryRaw.mockResolvedValueOnce([])
    const service = new BiEtlService(db as never, clock as never)

    await expect(service.staffIdForUser('user-1')).resolves.toBeNull()
  })
  it('refuses to publish an empty source over a non-empty copy, and records why', async () => {
    const db = makeDb()
    db.$queryRaw.mockResolvedValueOnce([{ id: RUN_ID }])
    db.tx.$queryRaw.mockResolvedValueOnce([{ count: 5 }]).mockResolvedValueOnce([{ count: 0 }])
    const service = new BiEtlService(db as never, clock as never)

    await expect(service.refresh('manual', 'staff-1')).rejects.toThrow('REFRESH_FAILED')
    expect(db.$executeRaw).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('SOURCE_EMPTY'), expect.anything())
  })

  it('allows an empty copy to be rebuilt as empty (nothing to protect)', async () => {
    const db = makeDb()
    db.$queryRaw
      .mockResolvedValueOnce([{ id: RUN_ID }])
      .mockResolvedValueOnce([{ id: RUN_ID, trigger: 'manual', status: 'success', row_count: 0 }])
    db.tx.$queryRaw.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([{ count: 0 }])
    const service = new BiEtlService(db as never, clock as never)

    await expect(service.refresh('manual', 'staff-1')).resolves.toEqual(expect.objectContaining({ status: 'success', row_count: 0 }))
  })
})
