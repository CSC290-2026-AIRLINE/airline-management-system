import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { FlightOperationsService } from './flight-operations.service'
import { MissingScheduleApprovals } from './schedule-approvals'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('../settings.service', () => ({ SettingsService: class {} }))

const at = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00Z`)
const FLIGHT = '00000000-0000-0000-0000-0000000000f1'
const AIRCRAFT = '00000000-0000-0000-0000-0000000000a1'
const OTHER_AIRCRAFT = '00000000-0000-0000-0000-0000000000a2'
const APPROVAL = '00000000-0000-0000-0000-0000000000b1'
const STAFF = 'staff-1'
const NO_CHANGE = { opened: 0, updated: 0, superseded: 0 }
const SERVICE_DATE = new Date('2026-11-02T00:00:00Z')

const flightRow = (over: object = {}) => ({
  id: FLIGHT,
  flight_number: 'ZZ101',
  service_date: SERVICE_DATE,
  status: 'scheduled',
  aircraft_id: AIRCRAFT,
  scheduled_dep_at: at('09:00'),
  scheduled_arr_at: at('11:00'),
  dep_at: at('09:00'),
  arr_at: at('11:00'),
  actual_destination: null,
  route: { origin: 'ZZB', destination: 'ZZC', distance_km: 800 },
  ...over,
})

describe('FlightOperationsService', () => {
  const order: string[] = []
  const tx = {
    $executeRaw: jest.fn(),
    flight: { findUnique: jest.fn() },
    disruption_reason: { findUnique: jest.fn() },
    airport: { findUnique: jest.fn() },
  }
  const db = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => {
      const result = await fn(tx)
      order.push('commit')
      return result
    }),
    flight: { findUnique: jest.fn(), findMany: jest.fn() },
    flight_event: { findMany: jest.fn() },
    partner_airline: { findMany: jest.fn() },
  }
  const writer = { append: jest.fn() }
  const publisher = { publishCommitted: jest.fn(() => order.push('publish')) }
  const cascade = { refresh: jest.fn(), supersedeForFlight: jest.fn() }
  const feasibility = { checkAircraftFeasibility: jest.fn() }
  const settings = { get: jest.fn() }
  const approvals = { consume: jest.fn() }
  const clock = { now: jest.fn() }
  const service = new FlightOperationsService(
    db as never,
    writer as never,
    publisher as never,
    cascade as never,
    feasibility as never,
    settings as never,
    approvals,
    clock,
  )

  const withFlight = (over: object = {}) => tx.flight.findUnique.mockResolvedValue(flightRow(over))
  const appended = () => writer.append.mock.calls[0] as unknown[]

  beforeEach(() => {
    jest.clearAllMocks()
    order.length = 0
    clock.now.mockReturnValue(at('06:00'))
    withFlight()
    tx.disruption_reason.findUnique.mockResolvedValue({ is_active: true })
    writer.append.mockImplementation(() => {
      order.push('append')
      return Promise.resolve({ id: 'e1', type: 'x', seq: 7n, occurred_at: at('06:00') })
    })
    cascade.refresh.mockResolvedValue(NO_CHANGE)
    cascade.supersedeForFlight.mockResolvedValue(0)
    settings.get.mockResolvedValue({ holding_limit_minutes: 30, airline_code: null })
    approvals.consume.mockImplementation(() => new MissingScheduleApprovals().consume())
  })

  describe('transaction safety', () => {
    it('writes the event on the transaction client and publishes it only after the commit', async () => {
      await service.delay(FLIGHT, { reason_code: 'ZZWX', delay_minutes: 45 }, STAFF)

      expect(appended()[0]).toBe(tx)
      expect(order).toEqual(['append', 'commit', 'publish'])
      expect(publisher.publishCommitted).toHaveBeenCalledWith(['e1'])
    })

    it('publishes nothing when the transaction fails', async () => {
      cascade.refresh.mockRejectedValue(new Error('db down'))
      await expect(service.delay(FLIGHT, { reason_code: 'ZZWX', delay_minutes: 45 }, STAFF)).rejects.toThrow('db down')
      expect(publisher.publishCommitted).not.toHaveBeenCalled()
    })

    it('takes the aircraft lock, then the flight lock', async () => {
      await service.delay(FLIGHT, { reason_code: 'ZZWX', delay_minutes: 45 }, STAFF)
      expect(tx.$executeRaw).toHaveBeenCalledTimes(2)
    })

    it('rejects when the flight moved to another aircraft between the read and the lock', async () => {
      tx.flight.findUnique.mockResolvedValueOnce({ aircraft_id: OTHER_AIRCRAFT }).mockResolvedValue(flightRow())
      await expect(service.delay(FLIGHT, { reason_code: 'ZZWX', delay_minutes: 45 }, STAFF)).rejects.toThrow(/changed by someone else/)
    })
  })

  describe('batchDelay', () => {
    const CANCELLED = '00000000-0000-0000-0000-0000000000f2'
    const MISSING = '00000000-0000-0000-0000-0000000000f3'

    it('delays in departure order, and one failure or missing id never blocks the others', async () => {
      db.flight.findMany.mockResolvedValue([{ id: CANCELLED }, { id: FLIGHT }])
      tx.flight.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(flightRow({ id: where.id, status: where.id === CANCELLED ? 'cancelled' : 'scheduled' })),
      )

      const { results } = await service.batchDelay(
        { flight_ids: [FLIGHT, CANCELLED, MISSING], reason_code: 'ZZWX', delay_minutes: 45 },
        STAFF,
      )

      expect(results.map((r) => [r.flight_id, r.status])).toEqual([
        [MISSING, 404],
        [CANCELLED, 409],
        [FLIGHT, 200],
      ])
      expect(writer.append).toHaveBeenCalledTimes(1)
    })
  })

  describe('delay', () => {
    const input = { reason_code: 'ZZWX', delay_minutes: 45 }

    it('moves both times and starts a cascade walk from this flight', async () => {
      await service.delay(FLIGHT, input, STAFF)

      expect(appended()[2]).toMatchObject({ status: 'delayed', columns: { delay_minutes: 45, disruption_reason_code: 'ZZWX' } })
      expect(appended()[4]).toEqual({ dep_at: at('09:45'), arr_at: at('11:45') })
      expect(cascade.refresh).toHaveBeenCalledWith(tx, AIRCRAFT, { flightId: FLIGHT, eventId: 'e1', eventType: 'delayed' })
    })

    it('sets no business maximum on the delay', async () => {
      await service.delay(FLIGHT, { reason_code: 'ZZWX', delay_minutes: 3000 }, STAFF)
      expect(appended()[2]).toMatchObject({ columns: { delay_minutes: 3000 } })
    })

    it('rejects an unknown or inactive reason with 422', async () => {
      tx.disruption_reason.findUnique.mockResolvedValue({ is_active: false })
      await expect(service.delay(FLIGHT, input, STAFF)).rejects.toThrow(UnprocessableEntityException)
      expect(writer.append).not.toHaveBeenCalled()
    })

    it.each(['cancelled', 'departed', 'arrived', 'diverted', 'holding'])('rejects a %s flight with 409', async (status) => {
      withFlight({ status })
      await expect(service.delay(FLIGHT, input, STAFF)).rejects.toThrow(ConflictException)
    })

    it('rejects a flight that has already departed on the clock with 409', async () => {
      clock.now.mockReturnValue(at('09:00'))
      await expect(service.delay(FLIGHT, input, STAFF)).rejects.toThrow(/already departed/)
    })

    it('returns 404 for a missing flight and 400 for a malformed id', async () => {
      tx.flight.findUnique.mockResolvedValue(null)
      await expect(service.delay(FLIGHT, input, STAFF)).rejects.toThrow(NotFoundException)
      await expect(service.delay('nope', input, STAFF)).rejects.toThrow(BadRequestException)
    })
  })

  describe('divert', () => {
    beforeEach(() => tx.airport.findUnique.mockResolvedValue({ is_active: true }))
    const input = { reason_code: 'ZZWX', airport_code: 'ZZD' }

    it('sets the actual destination and re-checks the chain without starting a cascade', async () => {
      await service.divert(FLIGHT, input, STAFF)
      expect(appended()[4]).toEqual({ actual_destination: 'ZZD' })
      expect(cascade.refresh).toHaveBeenCalledWith(tx, AIRCRAFT, { flightId: FLIGHT, eventId: 'e1', eventType: 'diverted' })
    })

    it.each(['scheduled', 'delayed', 'holding', 'departed'])('is allowed from %s', async (status) => {
      withFlight({ status })
      await expect(service.divert(FLIGHT, input, STAFF)).resolves.toBeDefined()
    })

    it.each(['cancelled', 'arrived'])('rejects a %s flight with 409', async (status) => {
      withFlight({ status })
      await expect(service.divert(FLIGHT, input, STAFF)).rejects.toThrow(ConflictException)
    })

    it('rejects a flight that has already arrived on the clock', async () => {
      clock.now.mockReturnValue(at('11:00'))
      await expect(service.divert(FLIGHT, input, STAFF)).rejects.toThrow(/already arrived/)
    })

    it('rejects an unknown airport and the current destination with 422', async () => {
      tx.airport.findUnique.mockResolvedValue(null)
      await expect(service.divert(FLIGHT, input, STAFF)).rejects.toThrow(UnprocessableEntityException)
      await expect(service.divert(FLIGHT, { ...input, airport_code: 'ZZC' }, STAFF)).rejects.toThrow(UnprocessableEntityException)
    })
  })

  describe('cancel', () => {
    it('cancels with a refund and closes the flight’s own chain conflicts', async () => {
      await service.cancel(FLIGHT, { reason_code: 'ZZTX', resolution: 'refund' }, STAFF)

      expect(appended()[2]).toMatchObject({ status: 'cancelled', columns: { resolution: 'refund' } })
      expect(cascade.supersedeForFlight).toHaveBeenCalledWith(tx, FLIGHT)
      expect(cascade.refresh).toHaveBeenCalledWith(
        tx,
        AIRCRAFT,
        expect.objectContaining({ eventType: expect.not.stringMatching(/^delayed$/) }),
      )
    })

    it('blocks partner rebooking with 422 until partner_airline_route exists', async () => {
      await expect(
        service.cancel(FLIGHT, { reason_code: 'ZZTX', resolution: 'rebook_partner', partner_airline: 'ZP' }, STAFF),
      ).rejects.toThrow(/partner_airline_route/)
      expect(writer.append).not.toHaveBeenCalled()
    })

    it('rejects a flight that has already departed with 409', async () => {
      clock.now.mockReturnValue(at('09:30'))
      await expect(service.cancel(FLIGHT, { reason_code: 'ZZTX', resolution: 'refund' }, STAFF)).rejects.toThrow(ConflictException)
    })
  })

  describe('hold', () => {
    const input = { reason_code: 'ZZAT', hold_minutes: 20 }
    beforeEach(() => clock.now.mockReturnValue(at('10:00'))) // in the air: departed 09:00, due 11:00

    it('extends the arrival and sets holding, without starting a cascade', async () => {
      await service.hold(FLIGHT, input, STAFF)

      expect(appended()[2]).toMatchObject({ status: 'holding', columns: { hold_minutes: 20, disruption_reason_code: 'ZZAT' } })
      expect(appended()[4]).toEqual({ arr_at: at('11:20') })
      expect(cascade.refresh).toHaveBeenCalledWith(
        tx,
        AIRCRAFT,
        expect.objectContaining({ eventType: expect.not.stringMatching(/^delayed$/) }),
      )
    })

    it.each([
      ['before departure', '08:59'],
      ['after arrival', '11:00'],
    ])('rejects a flight that is not in the air (%s) with 409', async (_, now) => {
      clock.now.mockReturnValue(at(now))
      await expect(service.hold(FLIGHT, input, STAFF)).rejects.toThrow(/not in the air/)
    })

    it('proposes a diversion instead of recording a hold over the configured limit', async () => {
      await expect(service.hold(FLIGHT, { ...input, hold_minutes: 31 }, STAFF)).rejects.toMatchObject({
        response: expect.objectContaining({ rule: 'holding_limit_exceeded', proposal: 'divert', holding_limit_minutes: 30 }),
      })
      expect(writer.append).not.toHaveBeenCalled()
    })

    it('reads the limit from flight_setting rather than a fixed value', async () => {
      settings.get.mockResolvedValue({ holding_limit_minutes: 45, airline_code: null })
      await expect(service.hold(FLIGHT, { ...input, hold_minutes: 40 }, STAFF)).resolves.toBeDefined()
    })

    it('fails clearly when the holding limit is not configured', async () => {
      settings.get.mockResolvedValue({ holding_limit_minutes: null, airline_code: null })
      await expect(service.hold(FLIGHT, input, STAFF)).rejects.toThrow(InternalServerErrorException)
    })

    it.each(['holding', 'diverted', 'cancelled'])('rejects a %s flight with 409', async (status) => {
      withFlight({ status })
      await expect(service.hold(FLIGHT, input, STAFF)).rejects.toThrow(ConflictException)
    })

    it('ends a hold with hold_ended, status departed', async () => {
      withFlight({ status: 'holding' })
      await service.endHold(FLIGHT, undefined, STAFF)
      expect(appended()[2]).toMatchObject({ status: 'departed', columns: { type: 'hold_ended' } })
    })

    it('refuses to end a hold that is not running', async () => {
      await expect(service.endHold(FLIGHT, undefined, STAFF)).rejects.toThrow(ConflictException)
    })
  })

  describe('changeAircraft', () => {
    const input = { aircraft_id: OTHER_AIRCRAFT }

    it('locks both aircraft, gates the new one on the transaction, and re-checks both chains', async () => {
      feasibility.checkAircraftFeasibility.mockResolvedValue({ status: 'feasible', violations: [], pending: [] })

      const result = await service.changeAircraft(FLIGHT, input, STAFF)

      expect(tx.$executeRaw).toHaveBeenCalledTimes(3)
      expect(feasibility.checkAircraftFeasibility).toHaveBeenCalledWith(
        OTHER_AIRCRAFT,
        expect.objectContaining({ flightId: FLIGHT, distanceKm: 800 }),
        tx,
      )
      expect(appended()[4]).toEqual({ aircraft_id: OTHER_AIRCRAFT })
      expect(cascade.refresh.mock.calls.map((c: unknown[]) => c[1])).toEqual([AIRCRAFT, OTHER_AIRCRAFT])
      expect(result.warnings).toEqual([expect.stringContaining('seat capacity')])
    })

    it('refuses an aircraft that fails a gate, with the violations', async () => {
      const violations = [{ kind: 'turnaround_short', detail: 'short' }]
      feasibility.checkAircraftFeasibility.mockResolvedValue({ status: 'not_feasible', violations, pending: [] })

      await expect(service.changeAircraft(FLIGHT, input, STAFF)).rejects.toMatchObject({
        response: expect.objectContaining({ violations }),
      })
      expect(writer.append).not.toHaveBeenCalled()
    })

    it('refuses with 502 when Feature 9 could not answer every gate, and writes nothing', async () => {
      feasibility.checkAircraftFeasibility.mockResolvedValue({ status: 'incomplete', violations: [], pending: ['availability: pending'] })

      await expect(service.changeAircraft(FLIGHT, input, STAFF)).rejects.toMatchObject({ status: 502 })
      expect(writer.append).not.toHaveBeenCalled()
    })

    it('rejects the aircraft the flight already has, and a flight that has departed', async () => {
      await expect(service.changeAircraft(FLIGHT, { aircraft_id: AIRCRAFT }, STAFF)).rejects.toThrow(BadRequestException)
      withFlight({ status: 'departed' })
      await expect(service.changeAircraft(FLIGHT, input, STAFF)).rejects.toThrow(ConflictException)
    })

    it('maps the timetable exclusion constraint to 409', async () => {
      feasibility.checkAircraftFeasibility.mockResolvedValue({ status: 'feasible', violations: [], pending: [] })
      writer.append.mockRejectedValue(new Error('violates exclusion constraint "flight_timetable_no_aircraft_overlap"'))
      await expect(service.changeAircraft(FLIGHT, input, STAFF)).rejects.toThrow(ConflictException)
    })
  })

  describe('applyReschedule', () => {
    const input = { approval_id: APPROVAL, dep_at: at('13:00'), arr_at: at('15:00') }
    const reschedule = () => service.run(FLIGHT, (t, flight) => service.applyReschedule(t, flight, input, STAFF))

    beforeEach(() => feasibility.checkAircraftFeasibility.mockResolvedValue({ status: 'feasible', violations: [], pending: [] }))

    it('is blocked with 422 while schedule_approval is missing, and writes nothing', async () => {
      await expect(reschedule()).rejects.toThrow(UnprocessableEntityException)
      expect(writer.append).not.toHaveBeenCalled()
    })

    it('with an approval, moves the published and current times and leaves service_date alone', async () => {
      approvals.consume.mockResolvedValue({ ok: true })

      await reschedule()

      expect(approvals.consume).toHaveBeenCalledWith(tx, expect.objectContaining({ purpose: 'reschedule', serviceDate: SERVICE_DATE }))
      expect(appended()[4]).toEqual({
        scheduled_dep_at: at('13:00'),
        scheduled_arr_at: at('15:00'),
        dep_at: at('13:00'),
        arr_at: at('15:00'),
      })
    })

    it('refuses with 502 when Feature 9 could not answer every gate, before using the approval', async () => {
      feasibility.checkAircraftFeasibility.mockResolvedValue({ status: 'incomplete', violations: [], pending: ['range: pending'] })
      await expect(reschedule()).rejects.toMatchObject({ status: 502 })
      expect(approvals.consume).not.toHaveBeenCalled()
    })

    it('runs the gates first and does not use the approval when they fail', async () => {
      feasibility.checkAircraftFeasibility.mockResolvedValue({ status: 'not_feasible', violations: [{}], pending: [] })
      await expect(reschedule()).rejects.toThrow(ConflictException)
      expect(approvals.consume).not.toHaveBeenCalled()
    })
  })

  describe('listEvents', () => {
    it('returns the flight’s events in seq order with a numeric seq', async () => {
      db.flight.findUnique.mockResolvedValue({ id: FLIGHT })
      db.flight_event.findMany.mockResolvedValue([{ id: 'e1', seq: 3n }])

      await expect(service.listEvents(FLIGHT)).resolves.toEqual([{ id: 'e1', seq: 3 }])
      expect(db.flight_event.findMany).toHaveBeenCalledWith({ where: { flight_id: FLIGHT }, orderBy: { seq: 'asc' } })
    })

    it('returns 404 for an unknown flight', async () => {
      db.flight.findUnique.mockResolvedValue(null)
      await expect(service.listEvents(FLIGHT)).rejects.toThrow(NotFoundException)
    })
  })
})
