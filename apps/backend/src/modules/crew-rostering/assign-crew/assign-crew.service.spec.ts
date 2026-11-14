import type { DbService } from '@backend/db/db.service'
import { AssignCrewService, type Leg, type RuleLimitsRow, type RunPairing } from './assign-crew.service'

// The services only need these for types; the real modules are ESM.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/db/generated/prisma/client', () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }))

const RUN = '7c1b9d2e-3a44-4c1f-8f0a-5b6d7e8f9a00'
const HOUR = 3_600_000

const LIMITS: RuleLimitsRow = {
  minRestHours: 10,
  maxDutyHours: 14,
  maxFlightsPerDuty: 4,
  maxFlightHours28d: 100,
  minLocalCrew: 1,
  minPoliceInternational: 2,
  cabinCrewPerLeg: 4,
  reportMinutes: 60,
  releaseMinutes: 30,
}

function leg(id: string, dep: string, arr: string, overrides: Partial<Leg> = {}): Leg {
  return {
    id,
    pairingId: 'p-1',
    pairingCode: 'P-1',
    flightId: `f-${id}`,
    flightNumber: `TG${id}`,
    serviceDate: dep.slice(0, 10),
    dep: new Date(dep),
    arr: new Date(arr),
    origin: 'BKK',
    destination: 'NRT',
    destinationCountry: 'jp',
    aircraftType: 'A320',
    international: true,
    localLanguages: ['ja'],
    localCrewRequired: 1,
    ...overrides,
  }
}

function pairing(legs: Leg[]): RunPairing {
  return { id: 'p-1', code: 'P-1', legs, limits: LIMITS }
}

function crew(id: string, role: string, languages: string[] = []) {
  return {
    id,
    first_name: id,
    last_name: 'Test',
    role,
    languages,
    fleet_aircraft_type: role === 'police' ? '' : 'A320',
    licence_expires_on: new Date('2030-01-01T00:00:00Z'),
    crew_certification: [{ aircraft_type: 'A320', expires_on: new Date('2030-01-01T00:00:00Z') }],
  }
}

type CrewRow = ReturnType<typeof crew>

/** `planPairing` and the duty helpers are private; the tests call them directly, with no database. */
interface Internals {
  planPairing: (
    pairing: RunPairing,
    pool: CrewRow[],
    busy: Map<string, { legId: string; pairingId: string; dep: Date; arr: Date }[]>,
    options: { demoBreaks?: boolean; random?: () => number },
  ) => Record<'captain' | 'first_officer' | 'cabin_crew' | 'police', CrewRow[]>
  dutyDays: (legs: Leg[], limits: RuleLimitsRow) => Leg[][]
  personDuties: (
    legs: { legId: string; pairingId: string; dep: Date; arr: Date }[],
    context: { defaults: RuleLimitsRow },
  ) => { firstLegId: string; start: number; end: number }[]
}

function service() {
  return new AssignCrewService({} as unknown as DbService)
}
const internals = (instance: AssignCrewService) => instance as unknown as Internals

describe('AssignCrewService auto-assign picks', () => {
  const pool = [
    crew('captain-ok', 'captain'),
    crew('captain-tired', 'captain'),
    crew('fo', 'first_officer'),
    crew('cabin-1', 'cabin_crew'),
    crew('cabin-2', 'cabin_crew'),
    crew('cabin-3', 'cabin_crew'),
    crew('cabin-4', 'cabin_crew'),
    crew('cabin-5', 'cabin_crew', ['ja']),
    crew('police-1', 'police'),
    crew('police-2', 'police'),
    crew('police-3', 'police'),
  ]
  const flight = pairing([leg('1', '2026-09-15T01:00:00Z', '2026-09-15T07:00:00Z')])
  // The second captain flies something else at the same time, so they are not legal for this pairing.
  const busy = () =>
    new Map([
      [
        'captain-tired',
        [{ legId: 'other', pairingId: 'p-9', dep: new Date('2026-09-15T02:00:00Z'), arr: new Date('2026-09-15T06:00:00Z') }],
      ],
    ])
  // Every roll comes up 0, the roll that would trigger every demo break.
  const always = () => 0

  it('gives zero breaks by default when there is enough legal crew, whatever the dice say', () => {
    const plan = internals(service()).planPairing(flight, pool, busy(), { random: always })

    expect(plan.captain.map((member) => member.id)).toEqual(['captain-ok'])
    expect(plan.first_officer).toHaveLength(1)
    expect(plan.cabin_crew).toHaveLength(4)
    expect(plan.police).toHaveLength(2)
  })

  it('prefers a local-language speaker for the cabin when one is legal and free', () => {
    const plan = internals(service()).planPairing(flight, pool, busy(), { random: always })

    expect(plan.cabin_crew.map((member) => member.id)).toContain('cabin-5')
  })

  it('plants breaks only in demo mode', () => {
    const plan = internals(service()).planPairing(flight, pool, busy(), { demoBreaks: true, random: always })

    expect(plan.captain.map((member) => member.id)).toEqual(['captain-tired'])
    expect(plan.police).toHaveLength(1)
    expect(plan.cabin_crew.map((member) => member.id)).not.toContain('cabin-5')
  })

  it('asks for as many local speakers as the destination requires', () => {
    const speakers = [crew('s-1', 'cabin_crew', ['ja']), crew('s-2', 'cabin_crew', ['ja']), crew('s-3', 'cabin_crew', ['ja'])]
    const everyone = [...pool, ...speakers]
    const speakersOn = (required: number) => {
      const legs = pairing([leg('1', '2026-09-15T01:00:00Z', '2026-09-15T07:00:00Z', { localCrewRequired: required })])
      const plan = internals(service()).planPairing(legs, everyone, busy(), { random: always })
      return plan.cabin_crew.filter((member) => member.languages.includes('ja')).length
    }

    expect(speakersOn(1)).toBe(1)
    expect(speakersOn(2)).toBe(2)
    expect(speakersOn(3)).toBe(3)
  })

  it('leaves a seat empty when nobody is legal', () => {
    const plan = internals(service()).planPairing(
      flight,
      pool.filter((member) => member.role !== 'first_officer'),
      busy(),
      { random: always },
    )

    expect(plan.first_officer).toEqual([])
  })
})

describe('AssignCrewService duties', () => {
  it('groups a late duty and an early one under minimum rest into one duty', () => {
    // Lands 23:45 and leaves 00:05 the next day: 0.3h apart, nowhere near the 10h rest.
    const late = leg('1', '2026-09-15T20:00:00Z', '2026-09-15T23:45:00Z')
    const early = leg('2', '2026-09-16T00:05:00Z', '2026-09-16T03:00:00Z')

    const days = internals(service()).dutyDays([late, early], LIMITS)

    expect(days).toHaveLength(1)
    expect(days[0].map((item) => item.id)).toEqual(['1', '2'])
  })

  it('starts a new duty when the rest between legs reaches the minimum', () => {
    const first = leg('1', '2026-09-15T01:00:00Z', '2026-09-15T05:00:00Z')
    const next = leg('2', '2026-09-16T01:00:00Z', '2026-09-16T05:00:00Z')

    expect(internals(service()).dutyDays([first, next], LIMITS)).toHaveLength(2)
  })

  it('keeps a person’s legs of one pairing as one duty across midnight, and other pairings apart', () => {
    const own = [
      { legId: '1', pairingId: 'p-1', dep: new Date('2026-09-15T20:00:00Z'), arr: new Date('2026-09-15T23:45:00Z') },
      { legId: '2', pairingId: 'p-1', dep: new Date('2026-09-16T00:05:00Z'), arr: new Date('2026-09-16T03:00:00Z') },
    ]
    const other = [{ legId: '3', pairingId: 'p-2', dep: new Date('2026-09-16T05:00:00Z'), arr: new Date('2026-09-16T08:00:00Z') }]

    const duties = internals(service()).personDuties([...own, ...other], { defaults: LIMITS })

    expect(duties.map((duty) => duty.firstLegId)).toEqual(['1', '3'])
    // The rest between the two pairings is short and is still visible to the REST_SHORT check.
    expect((duties[1].start - duties[0].end) / HOUR).toBeLessThan(LIMITS.minRestHours)
  })
})

describe('AssignCrewService.autoAssign re-run', () => {
  it('replaces only live automatic rows, so a sick call keeps its history row', async () => {
    const flight = pairing([leg('1', '2026-09-15T01:00:00Z', '2026-09-15T07:00:00Z', { international: false, localLanguages: [] })])
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      pairing_leg_assignment: {
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    }
    const db = {
      crew: { findMany: jest.fn().mockResolvedValue([crew('captain-ok', 'captain')]) },
      pairing_leg_assignment: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (run: (client: typeof tx) => Promise<void>) => run(tx)),
    }
    const instance = new AssignCrewService(db as unknown as DbService)
    const loose = instance as unknown as { loadRun: unknown; check: unknown }
    loose.loadRun = jest.fn().mockResolvedValue({ run: { status: 'draft', base_airport: 'BKK' }, pairings: [flight], context: {} })
    loose.check = jest.fn().mockResolvedValue({})

    await instance.autoAssign(RUN, [])

    expect(tx.pairing_leg_assignment.deleteMany).toHaveBeenCalledWith({
      where: { pairing_id: { in: ['p-1'] }, assigned_by: 'auto', unassigned_at: null },
    })
  })
})

describe('AssignCrewService.scopeOf', () => {
  const service = new AssignCrewService({} as unknown as DbService)
  const pairings = ['p-1', 'p-2', 'p-3', 'p-4'].map((id) => ({ id })) as unknown as RunPairing[]

  it('is the pairings somebody is crewed on, so the rest raise nothing', () => {
    const scope = service.scopeOf(pairings, [{ pairing_id: 'p-1' }, { pairing_id: 'p-1' }, { pairing_id: 'p-3' }])
    expect([...scope].sort()).toEqual(['p-1', 'p-3'])
  })

  it('also counts the pairings just sent to auto-assign, even if nobody could be put on them', () => {
    const scope = service.scopeOf(pairings, [{ pairing_id: 'p-1' }], ['p-2'])
    expect([...scope].sort()).toEqual(['p-1', 'p-2'])
  })

  it('is the whole run while nobody is crewed, so an untouched run never looks ready to publish', () => {
    expect([...service.scopeOf(pairings, [])].sort()).toEqual(['p-1', 'p-2', 'p-3', 'p-4'])
  })
})
