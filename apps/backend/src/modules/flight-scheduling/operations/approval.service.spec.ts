import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { ApprovalService } from './approval.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const ID = '00000000-0000-0000-0000-0000000000a1'
const NEW_ID = '00000000-0000-0000-0000-0000000000a2'
const ROUTE = '00000000-0000-0000-0000-0000000000b1'
const AIRCRAFT = '00000000-0000-0000-0000-0000000000c1'
const OTHER_AIRCRAFT = '00000000-0000-0000-0000-0000000000c2'
const FLIGHT = '00000000-0000-0000-0000-0000000000f1'
const STAFF = 'staff-1'
const NOW = new Date('2026-11-01T00:00:00Z')
const DEP = new Date('2026-11-02T03:00:00Z') // 10:00 local at Bangkok
const ARR = new Date('2026-11-02T05:00:00Z')
const min = (iso: string) => new Date(iso)

describe('ApprovalService', () => {
  const tx = {
    schedule_approval: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
    schedule_approval_offer: { createMany: jest.fn() },
    flight_setting: { findMany: jest.fn() },
    airport_approval_policy: { findUnique: jest.fn() },
    flight: { findMany: jest.fn() },
  }
  const db = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    route: { findUnique: jest.fn() },
    flight: { findUnique: jest.fn() },
    schedule_approval: { findMany: jest.fn(), findUnique: jest.fn() },
  }
  const service = new ApprovalService(db as never, { now: () => NOW })

  const request = (over: object = {}) => ({
    purpose: 'new_flight' as const,
    route_id: ROUTE,
    flight_number: 'ZZ101',
    service_date: new Date('2026-11-02T00:00:00Z'),
    aircraft_id: AIRCRAFT,
    dep_at: DEP,
    arr_at: ARR,
    ...over,
  })
  const route = (over: object = {}) => ({
    is_active: true,
    origin: 'BKK',
    airport_route_originToairport: { timezone: 'Asia/Bangkok', is_active: true },
    ...over,
  })

  beforeEach(() => {
    jest.resetAllMocks()
    db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx))
    db.route.findUnique.mockResolvedValue(route())
    db.schedule_approval.findUnique.mockResolvedValue({ id: ID, status: 'approved', schedule_approval_offer: [] })
    tx.schedule_approval.create.mockResolvedValue({ id: ID })
    tx.flight_setting.findMany.mockResolvedValue([]) // defaults: auto, no delay
    tx.airport_approval_policy.findUnique.mockResolvedValue(null)
    tx.flight.findMany.mockResolvedValue([])
  })

  describe('create', () => {
    it('saves a pending request with the origin airport as approver, and the simulated approver approves it', async () => {
      const result = await service.create(request(), STAFF)

      expect(tx.schedule_approval.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purpose: 'new_flight',
            approver_type: 'airport',
            approver_airport: 'BKK',
            requested_by: STAFF,
            requested_at: NOW,
            proposed_dep_at: DEP,
          }),
        }),
      )
      expect(tx.schedule_approval.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: expect.objectContaining({ status: 'approved', responded_by: null, responded_at: NOW }),
      })
      expect(result).toMatchObject({ id: ID, offers: [] })
    })

    it('offers other times when the policy refuses the requested one', async () => {
      tx.airport_approval_policy.findUnique.mockResolvedValue({
        curfew_start_local: new Date('1970-01-01T09:00:00Z'),
        curfew_end_local: new Date('1970-01-01T12:00:00Z'),
        max_departure_per_hour: null,
        offer_style: 'slots',
      })
      // 10:00 local is inside a 09:00 to 12:00 curfew read as local clock times
      await service.create(request(), STAFF)

      expect(tx.schedule_approval.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: expect.objectContaining({ status: 'alternative_offered', responded_by: null }),
      })
      expect(tx.schedule_approval_offer.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([expect.objectContaining({ approval_id: ID, kind: 'slot' })]),
      })
    })

    it('leaves the request pending when the approval mode is manual', async () => {
      tx.flight_setting.findMany.mockResolvedValue([{ key: 'approval_mode', value: 'manual' }])
      await service.create(request(), STAFF)
      expect(tx.schedule_approval.update).not.toHaveBeenCalled()
    })

    it('leaves the request pending when the approver answers after a delay', async () => {
      tx.flight_setting.findMany.mockResolvedValue([{ key: 'approval_response_delay_minutes', value: '30' }])
      await service.create(request(), STAFF)
      expect(tx.schedule_approval.update).not.toHaveBeenCalled()
    })

    it('ignores the flight being rescheduled when it counts the hour’s departures', async () => {
      db.flight.findUnique.mockResolvedValue({ flight_number: 'ZZ101', route_id: ROUTE, service_date: new Date('2026-11-02T00:00:00Z') })
      await service.create(request({ purpose: 'reschedule', flight_id: FLIGHT }), STAFF)
      expect(tx.flight.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { not: FLIGHT } }) }))
    })

    it.each([
      ['an unknown route', () => db.route.findUnique.mockResolvedValue(null)],
      ['an inactive route', () => db.route.findUnique.mockResolvedValue(route({ is_active: false }))],
      [
        'an inactive origin airport',
        () =>
          db.route.findUnique.mockResolvedValue(route({ airport_route_originToairport: { timezone: 'Asia/Bangkok', is_active: false } })),
      ],
    ])('rejects %s with 422', async (_name, arrange) => {
      arrange()
      await expect(service.create(request(), STAFF)).rejects.toThrow(UnprocessableEntityException)
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('requires service_date to be the local origin date of the departure', async () => {
      await expect(service.create(request({ service_date: new Date('2026-11-03T00:00:00Z') }), STAFF)).rejects.toThrow(
        /service_date must be 2026-11-02/,
      )
    })

    it('keeps the flight’s service date for a reschedule that moves to the next local day', async () => {
      db.flight.findUnique.mockResolvedValue({ flight_number: 'ZZ101', route_id: ROUTE, service_date: new Date('2026-11-02T00:00:00Z') })
      // 00:30 on 3 Nov at Bangkok, for the flight of 2 Nov.
      const late = { dep_at: min('2026-11-02T17:30:00Z'), arr_at: min('2026-11-02T19:00:00Z') }
      await service.create(request({ purpose: 'reschedule', flight_id: FLIGHT, ...late }), STAFF)
      expect(tx.schedule_approval.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ service_date: new Date('2026-11-02T00:00:00Z') }) }),
      )
      await expect(
        service.create(
          request({ purpose: 'reschedule', flight_id: FLIGHT, ...late, service_date: new Date('2026-11-03T00:00:00Z') }),
          STAFF,
        ),
      ).rejects.toThrow(/service_date must be 2026-11-02, the flight's service date/)
    })

    it('rejects a reschedule whose flight does not exist or does not match with 422', async () => {
      db.flight.findUnique.mockResolvedValue(null)
      await expect(service.create(request({ purpose: 'reschedule', flight_id: FLIGHT }), STAFF)).rejects.toThrow(
        UnprocessableEntityException,
      )
      db.flight.findUnique.mockResolvedValue({ flight_number: 'ZZ999', route_id: ROUTE, service_date: new Date('2026-11-02T00:00:00Z') })
      await expect(service.create(request({ purpose: 'reschedule', flight_id: FLIGHT }), STAFF)).rejects.toThrow(
        UnprocessableEntityException,
      )
    })

    it('maps a second live request for the same flight number and date to 409', async () => {
      tx.schedule_approval.create.mockRejectedValue({ code: 'P2002' })
      await expect(service.create(request(), STAFF)).rejects.toThrow(ConflictException)
    })
  })

  describe('respond', () => {
    beforeEach(() => tx.schedule_approval.updateMany.mockResolvedValue({ count: 1 }))

    it('approves a pending request as the responding staff member', async () => {
      await service.respond(ID, { answer: 'approve', note: 'ok' }, STAFF)
      expect(tx.schedule_approval.updateMany).toHaveBeenCalledWith({
        where: { id: ID, status: 'pending' },
        data: expect.objectContaining({ status: 'approved', responded_by: STAFF, responded_at: NOW, response_note: 'ok' }),
      })
    })

    it('records the reject reason', async () => {
      await service.respond(ID, { answer: 'reject', reject_reason: 'curfew' }, STAFF)
      expect(tx.schedule_approval.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'rejected', reject_reason: 'curfew' }) }),
      )
    })

    it('saves the offered times, a slot or a window each', async () => {
      const starts = min('2026-11-02T04:00:00Z')
      const ends = min('2026-11-02T05:00:00Z')
      await service.respond(
        ID,
        { answer: 'offer', offers: [{ starts_at: starts }, { starts_at: ends, ends_at: min('2026-11-02T06:00:00Z') }] },
        STAFF,
      )

      expect(tx.schedule_approval.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'alternative_offered' }) }),
      )
      expect(tx.schedule_approval_offer.createMany).toHaveBeenCalledWith({
        data: [
          { approval_id: ID, kind: 'slot', starts_at: starts },
          { approval_id: ID, kind: 'window', starts_at: ends, ends_at: min('2026-11-02T06:00:00Z') },
        ],
      })
    })

    it('refuses a request that is no longer pending with 409, and saves no offers', async () => {
      tx.schedule_approval.updateMany.mockResolvedValue({ count: 0 })
      await expect(service.respond(ID, { answer: 'offer', offers: [{ starts_at: DEP }] }, STAFF)).rejects.toThrow(ConflictException)
      expect(tx.schedule_approval_offer.createMany).not.toHaveBeenCalled()
    })

    it('returns 404 for an unknown approval', async () => {
      db.schedule_approval.findUnique.mockResolvedValue(null)
      await expect(service.respond(ID, { answer: 'approve' }, STAFF)).rejects.toThrow(NotFoundException)
    })
  })

  describe('revise', () => {
    const previous = (over: object = {}) => ({
      id: ID,
      status: 'alternative_offered',
      purpose: 'new_flight',
      flight_id: null,
      pattern_id: null,
      route_id: ROUTE,
      flight_number: 'ZZ101',
      service_date: new Date('2026-11-02T00:00:00Z'),
      aircraft_id: AIRCRAFT,
      approver_type: 'airport',
      approver_airport: 'BKK',
      approver_partner_airline: null,
      revision: 1,
      schedule_approval_offer: [{ kind: 'slot', starts_at: min('2026-11-02T04:00:00Z'), ends_at: null }],
      route: { origin: 'BKK', airport_route_originToairport: { timezone: 'Asia/Bangkok' } },
      ...over,
    })
    const revise = { dep_at: min('2026-11-02T04:00:00Z'), arr_at: min('2026-11-02T06:00:00Z') }

    beforeEach(() => {
      tx.schedule_approval.findUnique.mockResolvedValue(previous())
      tx.schedule_approval.create.mockResolvedValue({ id: NEW_ID })
      db.schedule_approval.findUnique.mockResolvedValue({ id: NEW_ID, status: 'approved', schedule_approval_offer: [] })
    })

    it('approves at once when an earlier offer covers the new time, and supersedes the offer', async () => {
      await service.revise(ID, revise, STAFF)

      expect(tx.schedule_approval.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: expect.objectContaining({ status: 'superseded' }),
      })
      expect(tx.schedule_approval.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'approved',
            covered_by_approval_id: ID,
            previous_approval_id: ID,
            revision: 2,
            proposed_dep_at: revise.dep_at,
            requested_by: STAFF,
          }),
        }),
      )
      expect(tx.flight_setting.findMany).not.toHaveBeenCalled() // no new answer is asked for
    })

    it('treats a time inside an offered window as covered, and its end as covered', async () => {
      tx.schedule_approval.findUnique.mockResolvedValue(
        previous({
          schedule_approval_offer: [{ kind: 'window', starts_at: min('2026-11-02T03:00:00Z'), ends_at: min('2026-11-02T04:00:00Z') }],
        }),
      )
      await service.revise(ID, revise, STAFF)
      expect(tx.schedule_approval.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'approved' }) }),
      )
    })

    it('asks the approver again when no offer covers the new time', async () => {
      await service.revise(ID, { ...revise, dep_at: min('2026-11-02T04:30:00Z') }, STAFF)

      expect(tx.schedule_approval.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ covered_by_approval_id: ID }) }),
      )
      expect(tx.flight_setting.findMany).toHaveBeenCalled()
    })

    it('asks again when the aircraft changes, even for an offered time', async () => {
      await service.revise(ID, { ...revise, aircraft_id: OTHER_AIRCRAFT }, STAFF)
      expect(tx.schedule_approval.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ aircraft_id: OTHER_AIRCRAFT }) }),
      )
      expect(tx.schedule_approval.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ status: 'approved' }) }),
      )
    })

    it('moves a new flight’s service date when the offered time is on the next local day', async () => {
      // 06:00 on 3 Nov at Bangkok.
      const next = min('2026-11-02T23:00:00Z')
      tx.schedule_approval.findUnique.mockResolvedValue(
        previous({ schedule_approval_offer: [{ kind: 'slot', starts_at: next, ends_at: null }] }),
      )
      await service.revise(ID, { dep_at: next, arr_at: min('2026-11-03T01:00:00Z') }, STAFF)
      expect(tx.schedule_approval.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ service_date: new Date('2026-11-03T00:00:00Z'), status: 'approved' }),
        }),
      )
    })

    it('keeps a reschedule’s service date when the new time is on the next local day', async () => {
      const next = min('2026-11-02T23:00:00Z')
      tx.schedule_approval.findUnique.mockResolvedValue(
        previous({ purpose: 'reschedule', flight_id: FLIGHT, schedule_approval_offer: [{ kind: 'slot', starts_at: next, ends_at: null }] }),
      )
      await service.revise(ID, { dep_at: next, arr_at: min('2026-11-03T01:00:00Z') }, STAFF)
      expect(tx.schedule_approval.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ service_date: new Date('2026-11-02T00:00:00Z') }) }),
      )
    })

    it('revises a rejected request as a new pending one, and leaves the rejected one as it is', async () => {
      tx.schedule_approval.findUnique.mockResolvedValue(previous({ status: 'rejected', schedule_approval_offer: [] }))
      await service.revise(ID, revise, STAFF)
      expect(tx.schedule_approval.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'superseded' }) }),
      )
      expect(tx.flight_setting.findMany).toHaveBeenCalled()
    })

    it.each(['pending', 'approved', 'consumed', 'superseded', 'expired'])('refuses to revise a %s request with 409', async (status) => {
      tx.schedule_approval.findUnique.mockResolvedValue(previous({ status }))
      await expect(service.revise(ID, revise, STAFF)).rejects.toThrow(ConflictException)
      expect(tx.schedule_approval.create).not.toHaveBeenCalled()
    })

    it('returns 404 for an unknown approval', async () => {
      tx.schedule_approval.findUnique.mockResolvedValue(null)
      await expect(service.revise(ID, revise, STAFF)).rejects.toThrow(NotFoundException)
    })
  })

  describe('list and get', () => {
    it('lists newest first and renames the offers', async () => {
      db.schedule_approval.findMany.mockResolvedValue([{ id: ID, schedule_approval_offer: [{ kind: 'slot' }] }])
      await expect(service.list({ status: 'pending', limit: '5' })).resolves.toEqual([{ id: ID, offers: [{ kind: 'slot' }] }])
      expect(db.schedule_approval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'pending' }, take: 5, orderBy: [{ requested_at: 'desc' }, { id: 'asc' }] }),
      )
    })

    it('rejects an unknown status filter with 400', async () => {
      await expect(service.list({ status: 'open' })).rejects.toThrow(BadRequestException)
    })

    it('returns 404 for an unknown or malformed id', async () => {
      await expect(service.get('not-a-uuid')).rejects.toThrow(NotFoundException)
      db.schedule_approval.findUnique.mockResolvedValue(null)
      await expect(service.get(ID)).rejects.toThrow(NotFoundException)
    })
  })
})
