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

/** Just enough of `DbService` for `saveLegs` on a pairing in a draft run, and for dropping drafts. */
function setupEdit() {
  const out = flight('1', 'BKK', 'NRT', 1, 7)
  const back = flight('2', 'NRT', 'BKK', 9, 15)
  const row = {
    id: 'pairing-1',
    code: 'P-1',
    base_airport: 'BKK',
    pairing_leg: [
      { id: 'leg-1', added_by: 'auto', flight: out },
      { id: 'leg-2', added_by: 'auto', flight: back },
    ],
    roster_run_pairing: { roster_run: { id: 'run-1', status: 'draft' } },
  }
  const tx = {
    rule_break: { deleteMany: jest.fn() },
    pairing_leg_assignment: { deleteMany: jest.fn() },
    roster_run_pairing: { deleteMany: jest.fn() },
    pairing_leg: { deleteMany: jest.fn(), createMany: jest.fn() },
    pairing: { update: jest.fn() },
  }
  const db = {
    crew_setting: { findMany: jest.fn().mockResolvedValue([]) },
    country_legality_rule: { findMany: jest.fn().mockResolvedValue([]) },
    airport: {
      findMany: jest.fn().mockResolvedValue([
        { iata_code: 'BKK', country: 'TH', timezone: 'Asia/Bangkok' },
        { iata_code: 'NRT', country: 'JP', timezone: 'Asia/Tokyo' },
      ]),
    },
    pairing: {
      findUnique: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue([{ id: row.id, roster_run_pairing: { pairing_id: row.id } }]),
      deleteMany: jest.fn(),
    },
    flight: { findMany: jest.fn().mockResolvedValue([{ id: '1', flight_number: 'FD1', pairing_leg: { pairing_id: 'pairing-1' } }]) },
    $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx)),
  }
  return { service: new BuildPairingService(db as unknown as DbService), tx, db }
}

describe('BuildPairingService.saveLegs on a committed pairing', () => {
  it('keeps the pairing in its run and clears only the legs taken off', async () => {
    const { service, tx } = setupEdit()

    const result = await service.saveLegs('pairing-1', [leg('1')])

    expect(tx.roster_run_pairing.deleteMany).not.toHaveBeenCalled()
    expect(tx.rule_break.deleteMany).toHaveBeenCalledWith({ where: { pairing_leg_id: { in: ['leg-2'] } } })
    expect(tx.pairing_leg_assignment.deleteMany).toHaveBeenCalledWith({ where: { pairing_leg_id: { in: ['leg-2'] } } })
    expect(tx.pairing_leg.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['leg-2'] } } })
    expect(result.withdrawnFromRun).toBe(false)
  })

  it('is still in the run after the next Generate, which drops only pairings outside every run', async () => {
    const { service, db } = setupEdit()
    await service.saveLegs('pairing-1', [leg('1')])

    const result = await (service as unknown as { discardDrafts: (p: typeof params) => Promise<unknown> }).discardDrafts(params)

    expect(db.pairing.deleteMany).not.toHaveBeenCalled()
    expect(result).toEqual({ deleted: 0, kept: 1 })
  })
})

describe('BuildPairingService.flightImpact', () => {
  const FLIGHT = '11111111-1111-4111-8111-111111111111'
  function impactService(options: { pairing?: boolean }) {
    const db = {
      flight: {
        findUnique: jest.fn().mockResolvedValue({
          id: FLIGHT,
          flight_number: 'FD1',
          pairing_leg: options.pairing
            ? { pairing: { id: 'pairing-1', code: 'P-1', roster_run_pairing: { roster_run: { id: 'run-1', status: 'draft' } } } }
            : null,
        }),
      },
      pairing_leg_assignment: {
        findMany: jest.fn().mockResolvedValue([
          { role: 'captain', crew: { id: 'c-1', first_name: 'Somchai', last_name: 'Kittipong' } },
          // The same person on the next leg of the pairing counts once.
          { role: 'captain', crew: { id: 'c-1', first_name: 'Somchai', last_name: 'Kittipong' } },
          { role: 'police', crew: { id: 'c-2', first_name: 'Anan', last_name: 'Sukhum' } },
        ]),
      },
    }
    return { service: new BuildPairingService(db as unknown as DbService), db }
  }

  it('counts the pairings that use the flight and the crew on them once each', async () => {
    const { service, db } = impactService({ pairing: true })

    const result = await service.flightImpact(FLIGHT)

    expect(result).toMatchObject({ flightNumber: 'FD1', pairingCount: 1, crewCount: 2 })
    expect(result.pairings[0]).toMatchObject({ code: 'P-1', rosterRunId: 'run-1', rosterRunStatus: 'draft' })
    expect(db.pairing_leg_assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pairing_id: 'pairing-1', unassigned_at: null } }),
    )
  })

  it('reports nothing affected for a flight in no pairing, and does not read assignments', async () => {
    const { service, db } = impactService({ pairing: false })

    expect(await service.flightImpact(FLIGHT)).toMatchObject({ pairings: [], pairingCount: 0, crewCount: 0 })
    expect(db.pairing_leg_assignment.findMany).not.toHaveBeenCalled()
  })
})
