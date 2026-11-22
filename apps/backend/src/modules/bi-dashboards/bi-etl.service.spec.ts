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

  describe('rebuild order', () => {
    async function rebuildStatements(now: Date) {
      const db = makeDb()
      db.$queryRaw
        .mockResolvedValueOnce([{ id: RUN_ID }])
        .mockResolvedValueOnce([{ id: RUN_ID, trigger: 'manual', status: 'success', row_count: 3 }])
      const service = new BiEtlService(db as never, { now: () => now } as never)
      await service.refresh('manual', 'staff-1')
      return db.tx.$executeRaw.mock.calls.map(([strings, ...values]: [TemplateStringsArray, ...unknown[]]) => ({
        sql: strings.join('?').replace(/\s+/g, ' ').trim(),
        values,
      }))
    }
    const indexOf = (statements: { sql: string }[], prefix: string) => statements.findIndex((s) => s.sql.startsWith(prefix))

    it('deletes children before the tables they point to, including the aircraft and extra revenue copies', async () => {
      const statements = await rebuildStatements(new Date('2026-11-07T00:00:00Z'))
      const deletes = statements.filter((s) => s.sql.startsWith('DELETE FROM')).map((s) => s.sql.replace('DELETE FROM ', ''))

      expect(deletes).toEqual([
        'bi_metric_day',
        'bi_booking_day',
        'bi_flight_delay',
        'bi_flight_cabin',
        'bi_flight',
        'bi_aircraft_downtime',
        'bi_aircraft',
        'bi_route',
        'bi_extra_revenue_day',
      ])
    })

    it('fills the aircraft and their downtime before bi_flight, which points to them', async () => {
      const statements = await rebuildStatements(new Date('2026-11-07T00:00:00Z'))

      const aircraft = indexOf(statements, 'INSERT INTO bi_aircraft (')
      const downtime = indexOf(statements, 'INSERT INTO bi_aircraft_downtime')
      const flight = indexOf(statements, 'INSERT INTO bi_flight (')
      expect(aircraft).toBeGreaterThan(-1)
      expect(aircraft).toBeLessThan(downtime)
      expect(downtime).toBeLessThan(flight)
      expect(indexOf(statements, 'INSERT INTO bi_extra_revenue_day')).toBeGreaterThan(-1)
    })

    it('counts no-shows from the coupons live at gate close, so a later cancel does not change them', async () => {
      const statements = await rebuildStatements(new Date('2026-11-07T00:00:00Z'))

      const flight = statements[indexOf(statements, 'INSERT INTO bi_flight (')].sql
      // A coupon cancelled after the gate closed was still booked when it closed.
      expect(flight).toContain("bc.status = 'confirmed' OR (bc.status = 'cancelled' AND bc.cancelled_at > closed.closed_at)")
      // Boarded and denied come from those coupons' check-ins only, so no floor is needed to hide a negative count.
      expect(flight).toContain('LEFT JOIN check_in ci ON ci.booking_passenger_id = bc.booking_passenger_id')
      expect(flight).not.toContain('GREATEST(0, COALESCE(')
    })

    it('cuts downtime off at the run date as UTC, the same "today" as feature 9', async () => {
      // 23:30 UTC is already the next day in Bangkok; feature 9 still counts it as the UTC date.
      const statements = await rebuildStatements(new Date('2026-11-07T23:30:00Z'))

      const downtime = statements[indexOf(statements, 'INSERT INTO bi_aircraft_downtime')]
      expect(downtime.values).toEqual(['2026-11-07', '2026-11-07', '2026-11-07'])
    })
  })

  it('rebuilds an empty source as an empty copy and succeeds', async () => {
    const db = makeDb()
    db.$queryRaw
      .mockResolvedValueOnce([{ id: RUN_ID }])
      .mockResolvedValueOnce([{ id: RUN_ID, trigger: 'manual', status: 'success', row_count: 0 }])
    db.tx.$queryRaw.mockResolvedValueOnce([{ count: 0 }])
    const service = new BiEtlService(db as never, clock as never)

    await expect(service.refresh('manual', 'staff-1')).resolves.toEqual(expect.objectContaining({ status: 'success', row_count: 0 }))
  })
})
