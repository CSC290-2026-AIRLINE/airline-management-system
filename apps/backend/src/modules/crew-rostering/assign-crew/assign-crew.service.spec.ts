import type { DbService } from '@backend/db/db.service'
import { AssignCrewService, type Leg, type RuleLimitsRow, type RunPairing } from './assign-crew.service'
import type { SimulationClock } from '../../admin-console/simulation-clock'
import type { AuditService } from '../../admin-console/audit/audit.service'

// The services only need these for types; the real modules are ESM.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/db/generated/prisma/client', () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }))

const fakeClock = () => ({ now: () => new Date() })
const fakeAudit = () => ({
  resolveActor: jest.fn().mockResolvedValue({ type: 'staff', id: 'user-1', role: 'ops' }),
  write: jest.fn().mockResolvedValue({ id: 'a', seq: '1' }),
})

const RUN = '7c1b9d2e-3a44-4c1f-8f0a-5b6d7e8f9a00'
const HOUR = 3_600_000

const LIMITS: RuleLimitsRow = {
  minRestHours: 10,
  maxDutyHours: 14,
  maxFlightsPerDuty: 4,
  maxFlightHours28d: 100,
  minLocalCrew: 1,
  minPoliceInternational: 2,
  seatsPerCabinCrew: 50,
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
    cabinCrewRequired: 4,
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
    busy: Map<string, { legId: string; pairingId: string; dep: Date; arr: Date; blockDep: Date; blockArr: Date }[]>,
    options: { demoBreaks?: boolean; random?: () => number },
  ) => Record<'captain' | 'first_officer' | 'cabin_crew' | 'police', CrewRow[]>
  dutyDays: (legs: Leg[], limits: RuleLimitsRow) => Leg[][]
  personDuties: (
    legs: { legId: string; pairingId: string; dep: Date; arr: Date }[],
    context: { defaults: RuleLimitsRow },
  ) => { firstLegId: string; start: number; end: number }[]
}

function service() {
  return new AssignCrewService(
    {} as unknown as DbService,
    fakeClock() as unknown as SimulationClock,
    fakeAudit() as unknown as AuditService,
  )
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
        [
          {
            legId: 'other',
            pairingId: 'p-9',
            dep: new Date('2026-09-15T02:00:00Z'),
            arr: new Date('2026-09-15T06:00:00Z'),
            blockDep: new Date('2026-09-15T02:00:00Z'),
            blockArr: new Date('2026-09-15T06:00:00Z'),
          },
        ],
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

  it('keeps a person off a day trip that falls inside the days a multi-day pairing keeps them away', () => {
    // Out 2 Sep, back 4 Sep: no flight touches 3 Sep, and the night in Tokyo is far more than the 10 h rest either side.
    const away = new Map([
      [
        'captain-ok',
        [
          {
            legId: 'a-1',
            pairingId: 'p-9',
            dep: new Date('2026-09-02T01:00:00Z'),
            arr: new Date('2026-09-02T07:00:00Z'),
            blockDep: new Date('2026-09-02T01:00:00Z'),
            blockArr: new Date('2026-09-04T07:00:00Z'),
          },
          {
            legId: 'a-2',
            pairingId: 'p-9',
            dep: new Date('2026-09-04T01:00:00Z'),
            arr: new Date('2026-09-04T07:00:00Z'),
            blockDep: new Date('2026-09-02T01:00:00Z'),
            blockArr: new Date('2026-09-04T07:00:00Z'),
          },
        ],
      ],
    ])
    const dayTrip = pairing([
      leg('1', '2026-09-03T01:00:00Z', '2026-09-03T05:00:00Z'),
      leg('2', '2026-09-03T08:00:00Z', '2026-09-03T12:00:00Z'),
    ])

    const plan = internals(service()).planPairing(dayTrip, [crew('captain-ok', 'captain'), crew('captain-spare', 'captain')], away, {
      random: always,
    })

    expect(plan.captain.map((member) => member.id)).toEqual(['captain-spare'])
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

describe('AssignCrewService.evaluate pairing blocks', () => {
  const block = (legId: string, pairingId: string, dep: string, arr: string, blockDep: string, blockArr: string) => ({
    legId,
    pairingId,
    dep: new Date(dep),
    arr: new Date(arr),
    blockDep: new Date(blockDep),
    blockArr: new Date(blockArr),
  })
  const evaluate = (instance: AssignCrewService, ...args: unknown[]) =>
    (instance as unknown as { evaluate: (...a: unknown[]) => { rule: string; crewId: string | null }[] }).evaluate(...args)

  it('reports OVERLAP when a day trip falls inside the nights a multi-day pairing spends away', () => {
    const dayTrip = pairing([leg('1', '2026-09-03T01:00:00Z', '2026-09-03T05:00:00Z', { international: false, localLanguages: [] })])
    const captain = crew('c-1', 'captain')
    const busy = new Map([
      [
        'c-1',
        [
          block('1', 'p-1', '2026-09-03T01:00:00Z', '2026-09-03T05:00:00Z', '2026-09-03T01:00:00Z', '2026-09-03T05:00:00Z'),
          block('a-1', 'p-9', '2026-09-02T01:00:00Z', '2026-09-02T07:00:00Z', '2026-09-02T01:00:00Z', '2026-09-04T07:00:00Z'),
          block('a-2', 'p-9', '2026-09-04T01:00:00Z', '2026-09-04T07:00:00Z', '2026-09-02T01:00:00Z', '2026-09-04T07:00:00Z'),
        ],
      ],
    ])
    const context = { defaults: LIMITS, countryRules: new Map(), airportCountry: new Map(), countryLanguages: new Map(), timeZone: 'UTC' }

    const found = evaluate(
      service(),
      [dayTrip],
      [{ pairing_leg_id: '1', pairing_id: 'p-1', crew_id: 'c-1', role: 'captain', crew: captain }],
      busy,
      context,
    )

    expect(found.filter((item) => item.rule === 'OVERLAP' && item.crewId === 'c-1')).toHaveLength(1)
  })
})

describe('AssignCrewService.storeBreaks', () => {
  function setup() {
    const row = (id: string, pairingId: string) => ({
      id,
      pairing_id: pairingId,
      pairing_leg_id: `leg-${id}`,
      rule: 'REST_SHORT',
      crew_id: null,
      role: null,
      detail: 'x',
      resolved_at: null,
    })
    const tx = {
      rule_break: {
        findMany: jest.fn().mockResolvedValue([row('b-1', 'p-fixed'), row('b-2', 'p-left')]),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
        createMany: jest.fn(),
      },
    }
    const db = { $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) => run(tx)) }
    const instance = new AssignCrewService(
      db as unknown as DbService,
      fakeClock() as unknown as SimulationClock,
      fakeAudit() as unknown as AuditService,
    )
    const store = (draft: boolean) =>
      (instance as unknown as { storeBreaks: (...a: unknown[]) => Promise<void> }).storeBreaks('run-1', [], new Set(['p-fixed']), draft)
    return { tx, store }
  }

  it('closes a break as fixed only when its pairing is still judged; one whose pairing left the batch is deleted', async () => {
    const { tx, store } = setup()

    await store(true)

    expect(tx.rule_break.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['b-1'] } } }))
    expect(tx.rule_break.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['b-2'] } } })
  })

  it('still closes every break as fixed in a published run', async () => {
    const { tx, store } = setup()

    await store(false)

    expect(tx.rule_break.deleteMany).not.toHaveBeenCalled()
    expect(tx.rule_break.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['b-1', 'b-2'] } } }))
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

/** An auto-assign run over one domestic pairing, with the transaction and the audit writer recorded. */
function autoAssignSetup() {
  const flight = pairing([leg('1', '2026-09-15T01:00:00Z', '2026-09-15T07:00:00Z', { international: false, localLanguages: [] })])
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    pairing_leg_assignment: {
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    rule_break: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  }
  const db = {
    crew: { findMany: jest.fn().mockResolvedValue([crew('captain-ok', 'captain')]) },
    pairing_leg_assignment: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<void>) => run(tx)),
  }
  const audit = fakeAudit()
  const instance = new AssignCrewService(
    db as unknown as DbService,
    fakeClock() as unknown as SimulationClock,
    audit as unknown as AuditService,
  )
  const loose = instance as unknown as { loadRun: unknown; check: unknown }
  loose.loadRun = jest.fn().mockResolvedValue({ run: { status: 'draft', base_airport: 'BKK' }, pairings: [flight], context: {} })
  loose.check = jest.fn().mockResolvedValue({})
  return { instance, tx, audit }
}

describe('AssignCrewService.autoAssign re-run', () => {
  it('clears the re-crewed pairings\' open and fixed breaks, so the last round is not listed as "Fixed", and keeps overrides', async () => {
    const { instance, tx } = autoAssignSetup()

    await instance.autoAssign(RUN, [])

    expect(tx.rule_break.deleteMany).toHaveBeenCalledWith({
      where: { roster_run_id: RUN, pairing_id: { in: ['p-1'] }, OR: [{ resolved_at: null }, { resolution: 'fixed' }] },
    })
  })

  it('replaces only live automatic rows, so a sick call keeps its history row', async () => {
    const { instance, tx } = autoAssignSetup()

    await instance.autoAssign(RUN, [])

    expect(tx.pairing_leg_assignment.deleteMany).toHaveBeenCalledWith({
      where: { pairing_id: { in: ['p-1'] }, assigned_by: 'auto', unassigned_at: null },
    })
  })

  it('records the run in the audit log, in the same transaction, as the signed-in staff member', async () => {
    const { instance, tx, audit } = autoAssignSetup()

    await instance.autoAssign(RUN, [], {}, 'user-1')

    expect(audit.resolveActor).toHaveBeenCalledWith('user-1')
    expect(audit.write).toHaveBeenCalledTimes(1)
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceFeature: '8',
        action: 'update',
        entityType: 'roster_run',
        entityId: RUN,
        summary: 'Auto-assigned 1 seat on 1 pairing: P-1',
        before: { autoSeats: 3 },
        after: { autoSeats: 1, pairings: ['P-1'] },
      }),
      tx,
    )
  })
})

describe('AssignCrewService.scopeOf', () => {
  const service = new AssignCrewService(
    {} as unknown as DbService,
    fakeClock() as unknown as SimulationClock,
    fakeAudit() as unknown as AuditService,
  )
  const pairings = ['p-1', 'p-2', 'p-3', 'p-4'].map((id) => ({ id })) as unknown as RunPairing[]

  it('is the pairings somebody is crewed on, so the rest raise nothing', () => {
    const scope = service.scopeOf(pairings, [{ pairing_id: 'p-1' }, { pairing_id: 'p-1' }, { pairing_id: 'p-3' }])
    expect([...scope].sort()).toEqual(['p-1', 'p-3'])
  })

  it('leaves out a pairing nobody could be put on, the same as Fix & publish and publish do', () => {
    // p-2 was sent to auto-assign and came out empty: it goes to the next round, so it raises no breaks here either.
    const scope = service.scopeOf(pairings, [{ pairing_id: 'p-1' }])
    expect([...scope].sort()).toEqual(['p-1'])
  })

  it('is the whole run while nobody is crewed, so an untouched run never looks ready to publish', () => {
    expect([...service.scopeOf(pairings, [])].sort()).toEqual(['p-1', 'p-2', 'p-3', 'p-4'])
  })
})

describe('AssignCrewService not-crewed pairings', () => {
  const run = { id: RUN, base_airport: 'BKK', date_from: new Date('2026-11-20'), date_to: new Date('2026-11-21'), status: 'draft' }
  const a320 = { ...pairing([leg('1', '2026-11-20T01:00:00Z', '2026-11-20T03:00:00Z', { aircraftType: 'A320-200' })]) }
  const atr = {
    ...pairing([leg('2', '2026-11-20T04:00:00Z', '2026-11-20T06:00:00Z', { pairingId: 'p-2', aircraftType: 'ATR 72-600' })]),
    id: 'p-2',
    code: 'P-2',
  }
  const onA320 = [{ pairing_id: 'p-1', pairing_leg_id: '1', role: 'captain', crew: crew('captain-ok', 'captain') }]
  const toResult = (instance: AssignCrewService) =>
    (instance as unknown as { toResult: (...args: unknown[]) => { notCrewed: unknown[] } }).toResult.bind(instance)

  it('lists a pairing with nobody on it, and says why when no crew at the base flies its aircraft', () => {
    const result = toResult(service())(run, [a320, atr], onA320, [], new Set(['A320-200']))
    expect(result.notCrewed).toEqual([{ pairingId: 'p-2', code: 'P-2', reason: 'Nobody at BKK flies the ATR 72-600.' }])
  })

  it('lists nothing while nobody is crewed at all, since the whole run is then judged', () => {
    expect(toResult(service())(run, [a320, atr], [], [], new Set(['A320-200'])).notCrewed).toEqual([])
  })
})
