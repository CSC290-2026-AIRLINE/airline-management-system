import { ConflictException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { AssignCrewService } from '../assign-crew/assign-crew.service'
import { FixPublishService } from './fix-publish.service'

// The services only need these for types; the real modules are ESM.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/db/generated/prisma/client', () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }))

const RUN = '7c1b9d2e-3a44-4c1f-8f0a-5b6d7e8f9a00'

/** Just enough of `DbService` for `publish`, with the order of lock, re-check and writes recorded. */
function setupPublish(options: { locked?: { status: string }; open?: number; pairings?: number; flipped?: number } = {}) {
  const { locked = { status: 'draft' }, open = 0, pairings = 3, flipped = 1 } = options
  const calls: string[] = []
  const tx = {
    $queryRaw: jest.fn(() => {
      calls.push('lock')
      return Promise.resolve([locked])
    }),
    roster_run_pairing: { count: jest.fn().mockResolvedValue(pairings) },
    rule_break: { count: jest.fn().mockResolvedValue(open) },
    roster_run: { updateMany: jest.fn().mockResolvedValue({ count: flipped }) },
    audit_log: { create: jest.fn() },
  }
  const db = {
    roster_run: { findUnique: jest.fn().mockResolvedValue({ id: RUN, status: 'draft' }) },
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<void>) => run(tx)),
  }
  const assign = {
    check: jest.fn(() => {
      calls.push('check')
      return Promise.resolve()
    }),
  }
  const service = new FixPublishService(db as unknown as DbService, assign as unknown as AssignCrewService)
  jest
    .spyOn(service as unknown as { buildState: () => Promise<unknown> }, 'buildState')
    .mockResolvedValue({ rosterRun: { status: 'published' } })
  return { service, tx, calls }
}

describe('FixPublishService.publish', () => {
  it('locks the run, re-checks it under the lock, then flips it once', async () => {
    const { service, tx, calls } = setupPublish()

    await service.publish(RUN, 'user-1')

    expect(calls).toEqual(['lock', 'check'])
    expect(tx.roster_run.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: RUN, status: 'draft' } }))
    expect(tx.audit_log.create).toHaveBeenCalledTimes(1)
  })

  it('refuses while a break is open, and does not flip the run', async () => {
    const { service, tx } = setupPublish({ open: 2 })

    await expect(service.publish(RUN, 'user-1')).rejects.toThrow('ROSTER_HAS_BREAKS')
    expect(tx.roster_run.updateMany).not.toHaveBeenCalled()
  })

  it('finds a run published by someone else while it waited for the lock, and stops before re-checking', async () => {
    const { service, tx, calls } = setupPublish({ locked: { status: 'published' } })

    await expect(service.publish(RUN, 'user-1')).rejects.toThrow(ConflictException)
    expect(calls).toEqual(['lock'])
    expect(tx.audit_log.create).not.toHaveBeenCalled()
  })

  it('writes no second audit line when the guarded flip changes nothing', async () => {
    const { service, tx } = setupPublish({ flipped: 0 })

    await expect(service.publish(RUN, 'user-1')).rejects.toThrow('already published')
    expect(tx.audit_log.create).not.toHaveBeenCalled()
  })
})

/** The rules a cover has to pass, called directly: the page filters on role and presence, so only a direct swap reaches them. */
describe('FixPublishService cover rules', () => {
  const leg = {
    id: 'leg-1',
    pairingId: 'p-1',
    flightNumber: 'TX103',
    serviceDate: '2026-09-17',
    aircraftType: 'A320',
    dep: new Date('2026-09-17T04:30:00Z'),
    arr: new Date('2026-09-17T05:55:00Z'),
  }
  const limits = { minRestHours: 10, maxFlightHours28d: 100, reportMinutes: 60, releaseMinutes: 0 }
  const captainSeat = { mode: 'add', role: 'captain', scope: [leg], languages: [] }

  function member(overrides: Record<string, unknown> = {}) {
    return {
      id: 'crew-1',
      first_name: 'Test',
      last_name: 'Captain',
      role: 'captain',
      licence_expires_on: new Date('2030-01-01'),
      fleet_aircraft_type: 'A320',
      languages: [],
      crew_certification: [{ aircraft_type: 'A320', expires_on: new Date('2030-01-01') }],
      ...overrides,
    }
  }

  function judge(who: ReturnType<typeof member>, world: Record<string, unknown> = {}) {
    const service = new FixPublishService({} as DbService, {} as AssignCrewService)
    const candidateFor = (
      service as unknown as {
        candidateFor: (m: unknown, p: unknown, w: unknown) => { allowed: boolean; checks: { ok: boolean; reason?: string }[] }
      }
    ).candidateFor
    const fullWorld = { pairings: [], context: { defaults: limits }, busy: new Map(), assignments: [], removed: new Map(), ...world }
    return candidateFor.call(service, who, captainSeat, fullWorld)
  }

  const reasonOf = (result: ReturnType<typeof judge>) => result.checks.find((check) => !check.ok)?.reason

  it('allows a free, rated captain', () => {
    expect(judge(member()).allowed).toBe(true)
  })

  it('refuses someone whose role is not the seat', () => {
    const result = judge(member({ role: 'cabin_crew' }))

    expect(result.allowed).toBe(false)
    expect(reasonOf(result)).toContain('not')
  })

  it('refuses someone already crewed on the flight', () => {
    const result = judge(member(), {
      assignments: [{ id: 'a-1', legId: 'leg-1', crewId: 'crew-1', pairingId: 'p-1', role: 'first_officer' }],
    })

    expect(result.allowed).toBe(false)
    expect(reasonOf(result)).toContain('already crewed')
  })

  it('refuses the person who came off the seat', () => {
    const removed = new Map([['leg-1|captain', { crewId: 'crew-1', name: 'T. Captain', role: 'captain', reason: 'Sick: fever' }]])
    const result = judge(member(), { removed })

    expect(result.allowed).toBe(false)
    expect(reasonOf(result)).toContain('came off this seat')
  })
})
