import type { DbService } from '@backend/db/db.service'
import { SetupCrewService } from './setup-crew.service'

// The service only needs these two for types and the unique-violation check; the real modules are ESM.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/db/generated/prisma/client', () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }))

function member(id: string, role = 'captain') {
  return {
    id,
    first_name: `First${id}`,
    last_name: `Last${id}`,
    employee_number: `EMP-${id}`,
    role,
    base_airport: 'BKK',
    airport: { country: 'th' },
    fleet_aircraft_type: 'A320',
    languages: ['th'],
    date_of_birth: null,
    email: null,
    phone: null,
    licence_number: `LIC-${id}`,
    licence_expires_on: new Date('2030-01-01'),
    crew_certification: [],
  }
}

/** A leg someone is assigned to: 08:00 to 09:30 Bangkok time, landing in Tokyo (UTC+9) at 17:00 local. */
function assignment(crewId: string, legId: string, depUtc = '2026-09-17T01:00:00Z', arrUtc = '2026-09-17T08:00:00Z') {
  return {
    crew_id: crewId,
    pairing_leg_id: legId,
    pairing_leg: {
      pairing: { code: 'P-1', roster_run_pairing: { roster_run: { status: 'published' } } },
      flight: {
        flight_number: 'TX301',
        service_date: new Date('2026-09-17'),
        scheduled_dep_at: new Date(depUtc),
        scheduled_arr_at: new Date(arrUtc),
        route: {
          origin: 'BKK',
          destination: 'XTK',
          airport_route_originToairport: { timezone: 'Asia/Bangkok' },
          airport_route_destinationToairport: { timezone: 'Asia/Tokyo' },
        },
      },
    },
  }
}

/** Just enough of `DbService` for `listCrew`. The two assignment reads are told apart by whether the window has an upper bound. */
function setup(crew: ReturnType<typeof member>[], assignments: ReturnType<typeof assignment>[]) {
  const reads: { where: { pairing_leg: { flight: { scheduled_dep_at: { gte: Date; lte?: Date } } } } }[] = []
  const db = {
    crew: { findMany: jest.fn().mockResolvedValue(crew) },
    crew_setting: { findUnique: jest.fn().mockResolvedValue({ value: '100' }) },
    pairing_leg_assignment: {
      findMany: jest.fn((args: (typeof reads)[number]) => {
        reads.push(args)
        return Promise.resolve(assignments)
      }),
    },
  }
  return { db, reads, service: new SetupCrewService(db as unknown as DbService) }
}

describe('SetupCrewService.listCrew', () => {
  it('reads hours and duties once for everyone, however many crew there are', async () => {
    const people = ['a', 'b', 'c', 'd', 'e'].map((id) => member(id))
    const { service, db } = setup(people, [assignment('a', 'leg-1')])

    const result = await service.listCrew({})

    expect(result.crew).toHaveLength(5)
    expect(db.crew.findMany).toHaveBeenCalledTimes(1)
    // One read for hours flown and one for upcoming duties, not two per person.
    expect(db.pairing_leg_assignment.findMany).toHaveBeenCalledTimes(2)
  })

  it('only counts flights that have already left in the window, not duties still to come', async () => {
    const { service, reads } = setup([member('a')], [])

    await service.listCrew({})

    const bounded = reads.filter((read) => read.where.pairing_leg.flight.scheduled_dep_at.lte !== undefined)
    const upcoming = reads.filter((read) => read.where.pairing_leg.flight.scheduled_dep_at.lte === undefined)
    expect(bounded).toHaveLength(1)
    expect(upcoming).toHaveLength(1)
    const { gte, lte } = bounded[0].where.pairing_leg.flight.scheduled_dep_at
    expect(lte!.getTime() - gte.getTime()).toBe(28 * 86_400_000)
  })

  it('gives each person their own hours and duties', async () => {
    // 09:00 to 11:30 UTC is 2.5 h, and 01:00 to 08:00 UTC is 7 h.
    const { service } = setup(
      [member('a'), member('b')],
      [assignment('a', 'leg-1'), assignment('a', 'leg-2', '2026-09-18T09:00:00Z', '2026-09-18T11:30:00Z'), assignment('b', 'leg-3')],
    )

    const { crew } = await service.listCrew({})
    const byId = new Map(crew.map((row) => [row.id, row]))

    expect(byId.get('a')?.hours28d).toBe(9.5)
    expect(byId.get('a')?.upcomingDuties.map((duty) => duty.id)).toEqual(['leg-1', 'leg-2'])
    expect(byId.get('b')?.hours28d).toBe(7)
    expect(byId.get('b')?.upcomingDuties).toHaveLength(1)
  })

  it('prints each duty time on the clock of the airport it happens at', async () => {
    const { service } = setup([member('a')], [assignment('a', 'leg-1')])

    const { crew } = await service.listCrew({})

    expect(crew[0].upcomingDuties[0]).toMatchObject({ origin: 'BKK', departureLocal: '08:00', destination: 'XTK', arrivalLocal: '17:00' })
  })

  it('answers with no duties and 0 hours for someone with none', async () => {
    const { service } = setup([member('a')], [])

    const { crew } = await service.listCrew({})

    expect(crew[0]).toMatchObject({ hours28d: 0, upcomingDuties: [] })
  })
})
