import { BadRequestException, ConflictException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { BuildPairingService } from './build-pairing.service'

// The service only needs these two for types and the unique-violation check; the real modules are ESM.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/db/generated/prisma/client', () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }))

const HOUR = 3_600_000
const DAY0 = Date.UTC(2026, 8, 15)
const at = (hours: number) => new Date(DAY0 + hours * HOUR)
const params = { dateFrom: '2026-09-15', dateTo: '2026-09-19', base: 'BKK' }

function flight(id: string, origin: string, destination: string, dep: number, arr: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    flight_number: `FD${id}`,
    dep_at: at(dep),
    arr_at: at(arr),
    service_date: new Date(Date.UTC(2026, 8, 15 + Math.floor(dep / 24))),
    status: 'scheduled',
    route: { origin, destination },
    pairing_leg: null,
    ...extra,
  }
}

/** Just enough of `DbService` for `commitPairings`, with every write recorded. */
function setup(options: { flights: ReturnType<typeof flight>[]; runs?: { id: string; status: string }[] }) {
  const created: { data: { pairing_leg: { create: { flight_id: string; added_by: string }[] } } }[] = []
  let sequence = 200
  const tx = {
    roster_run: { create: jest.fn().mockResolvedValue({ id: 'run-new', status: 'draft' }), update: jest.fn() },
    pairing: {
      create: jest.fn((args: (typeof created)[number]) => {
        created.push(args)
        sequence += 1
        return Promise.resolve({ id: `pairing-${sequence}`, code: `P-${sequence}` })
      }),
    },
    roster_run_pairing: { createMany: jest.fn() },
  }
  const db = {
    crew_setting: { findMany: jest.fn().mockResolvedValue([]) },
    country_legality_rule: { findMany: jest.fn().mockResolvedValue([]) },
    airport: {
      findMany: jest.fn().mockResolvedValue([
        { iata_code: 'BKK', country: 'TH', timezone: 'Asia/Bangkok' },
        { iata_code: 'NRT', country: 'JP', timezone: 'Asia/Tokyo' },
        { iata_code: 'ICN', country: 'KR', timezone: 'Asia/Seoul' },
      ]),
    },
    roster_run: { findMany: jest.fn().mockResolvedValue(options.runs ?? []) },
    flight: { findMany: jest.fn().mockResolvedValue(options.flights) },
    $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx)),
  }
  return { service: new BuildPairingService(db as unknown as DbService), tx, created }
}

const leg = (flightId: string, addedManually = false) => ({ flightId, addedManually })

describe('BuildPairingService.commitPairings', () => {
  // A closed day trip: out 12:30, back 19:30 (Bangkok time), well inside every limit.
  const out = flight('1', 'BKK', 'NRT', 5.5, 11.5)
  const back = flight('2', 'NRT', 'BKK', 12.5, 16.5)

  it('stores a valid draft, links it to a new run and reports the code it was given', async () => {
    const { service, tx, created } = setup({ flights: [out, back] })
    const result = await service.commitPairings(params, [{ ref: 'P-108', legs: [leg('1'), leg('2', true)] }])

    expect(result.committed).toEqual([{ ref: 'P-108', code: 'P-201' }])
    expect(result.skippedInvalid).toEqual([])
    expect(tx.roster_run.create).toHaveBeenCalledTimes(1)
    expect(created[0].data.pairing_leg.create).toEqual([
      { flight_id: '1', added_by: 'auto' },
      { flight_id: '2', added_by: 'ops' },
    ])
    expect(tx.roster_run_pairing.createMany).toHaveBeenCalledWith({ data: [{ roster_run_id: 'run-new', pairing_id: 'pairing-201' }] })
  })

  it('reuses the draft run for the window instead of creating another', async () => {
    const { service, tx } = setup({ flights: [out, back], runs: [{ id: 'run-1', status: 'draft' }] })
    const result = await service.commitPairings(params, [{ ref: 'P-108', legs: [leg('1'), leg('2')] }])
    expect(tx.roster_run.create).not.toHaveBeenCalled()
    expect(result.rosterRun.id).toBe('run-1')
  })

  it('re-checks legality and leaves out a draft that does not come home, without storing it', async () => {
    const { service, tx } = setup({ flights: [out, back] })
    const result = await service.commitPairings(params, [
      { ref: 'P-108', legs: [leg('1')] },
      { ref: 'P-109', legs: [leg('1'), leg('2')] },
    ])
    expect(result.skippedInvalid).toEqual(['P-108'])
    expect(result.committed.map((row) => row.ref)).toEqual(['P-109'])
    expect(tx.pairing.create).toHaveBeenCalledTimes(1)
  })

  it('skips a draft with a flight that is already in another pairing, and a flight claimed twice in one request', async () => {
    const taken = flight('1', 'BKK', 'NRT', 5.5, 11.5, { pairing_leg: { pairing_id: 'someone-else' } })
    const first = setup({ flights: [taken, back] })
    expect((await first.service.commitPairings(params, [{ ref: 'P-108', legs: [leg('1'), leg('2')] }])).skippedTaken).toEqual(['P-108'])

    const second = setup({ flights: [out, back] })
    const result = await second.service.commitPairings(params, [
      { ref: 'P-108', legs: [leg('1'), leg('2')] },
      { ref: 'P-109', legs: [leg('1'), leg('2')] },
    ])
    expect(result.committed.map((row) => row.ref)).toEqual(['P-108'])
    expect(result.skippedTaken).toEqual(['P-109'])
  })

  it('leaves out a valid draft that runs past the window', async () => {
    const { service, tx } = setup({ flights: [out, back] })
    const result = await service.commitPairings({ ...params, dateTo: '2026-09-14', dateFrom: '2026-09-14' }, [
      { ref: 'P-108', legs: [leg('1'), leg('2')] },
    ])
    expect(result.skippedOutsideWindow).toEqual(['P-108'])
    expect(tx.pairing.create).not.toHaveBeenCalled()
  })

  it('refuses an empty commit and a published run', async () => {
    await expect(setup({ flights: [] }).service.commitPairings(params, [])).rejects.toBeInstanceOf(BadRequestException)
    const published = setup({ flights: [out, back], runs: [{ id: 'run-1', status: 'published' }] })
    await expect(published.service.commitPairings(params, [{ ref: 'P-108', legs: [leg('1'), leg('2')] }])).rejects.toBeInstanceOf(
      ConflictException,
    )
  })
})
