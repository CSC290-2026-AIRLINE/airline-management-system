import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { GateCheckService } from './gate-check.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const ROUTE = '00000000-0000-0000-0000-0000000000b1'
const AIRCRAFT = '00000000-0000-0000-0000-0000000000a1'
const FLIGHT = '00000000-0000-0000-0000-0000000000f1'
const at = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00Z`)

describe('GateCheckService', () => {
  const db = { route: { findUnique: jest.fn() }, flight: { findUnique: jest.fn() } }
  const feasibility = { checkAircraftFeasibility: jest.fn() }
  const service = new GateCheckService(db as never, feasibility as never)

  const route = (over: object = {}) => ({
    is_active: true,
    origin: 'ZZB',
    destination: 'ZZC',
    distance_km: 800,
    airport_route_originToairport: { is_active: true },
    airport_route_destinationToairport: { is_active: true },
    ...over,
  })
  const flight = (over: object = {}) => ({
    id: FLIGHT,
    flight_number: 'ZZ101',
    status: 'scheduled',
    aircraft_id: AIRCRAFT,
    dep_at: at('09:00'),
    arr_at: at('11:00'),
    actual_destination: null,
    route: { origin: 'ZZB', destination: 'ZZC', distance_km: 800 },
    ...over,
  })
  const proposed = (over: object = {}) => ({
    route_id: ROUTE,
    flight_number: 'ZZ101',
    aircraft_id: AIRCRAFT,
    dep_at: at('09:00'),
    arr_at: at('11:00'),
    ...over,
  })

  beforeEach(() => {
    jest.resetAllMocks()
    db.route.findUnique.mockResolvedValue(route())
    db.flight.findUnique.mockResolvedValue(flight())
    feasibility.checkAircraftFeasibility.mockResolvedValue({ status: 'feasible', violations: [], pending: [] })
  })

  describe('check', () => {
    it('runs the gates for an unsaved flight, with the congestion check, and reports it as feasible', async () => {
      const { results } = await service.check({ flights: [proposed()] })

      expect(results).toEqual([
        { index: 0, flight_number: 'ZZ101', status: 200, feasible: true, outcome: 'feasible', violations: [], pending: [] },
      ])
      expect(feasibility.checkAircraftFeasibility).toHaveBeenCalledWith(
        AIRCRAFT,
        expect.objectContaining({
          flightId: null,
          origin: 'ZZB',
          destination: 'ZZC',
          distanceKm: 800,
          depAt: at('09:00'),
          arrAt: at('11:00'),
        }),
        db,
        { congestion: true },
      )
    })

    it('returns the failing rules, and is not feasible, but still answers 200', async () => {
      feasibility.checkAircraftFeasibility.mockResolvedValue({
        status: 'not_feasible',
        violations: [{ kind: 'turnaround_short', detail: 'ZZB needs 60 minutes, 40 given' }],
        pending: [],
      })
      const { results } = await service.check({ flights: [proposed()] })
      expect(results[0]).toMatchObject({
        status: 200,
        feasible: false,
        outcome: 'not_feasible',
        violations: [{ kind: 'turnaround_short' }],
      })
    })

    it('reports an incomplete check as not feasible, with what could not be checked', async () => {
      feasibility.checkAircraftFeasibility.mockResolvedValue({ status: 'incomplete', violations: [], pending: ['range: not available'] })
      const { results } = await service.check({ flights: [proposed()] })
      expect(results[0]).toMatchObject({ feasible: false, outcome: 'incomplete', pending: ['range: not available'] })
    })

    it('gives each flight its own result, in order, and one that cannot be checked does not stop the rest', async () => {
      db.route.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(route({ is_active: false }))
        .mockResolvedValueOnce(route())

      const { results } = await service.check({
        flights: [proposed({ flight_number: 'ZZ1' }), proposed({ flight_number: 'ZZ2' }), proposed({ flight_number: 'ZZ3' })],
      })

      expect(results.map((r) => [r.index, r.flight_number, r.status])).toEqual([
        [0, 'ZZ1', 422],
        [1, 'ZZ2', 422],
        [2, 'ZZ3', 200],
      ])
      expect(feasibility.checkAircraftFeasibility).toHaveBeenCalledTimes(1)
    })

    it('does not accept an inactive airport at either end', async () => {
      db.route.findUnique.mockResolvedValueOnce(route({ airport_route_originToairport: { is_active: false } }))
      db.route.findUnique.mockResolvedValueOnce(route({ airport_route_destinationToairport: { is_active: false } }))
      const { results } = await service.check({ flights: [proposed(), proposed()] })
      expect(results.map((r) => r.status)).toEqual([422, 422])
    })

    it('does not hide an unexpected error', async () => {
      feasibility.checkAircraftFeasibility.mockRejectedValue(new Error('db down'))
      await expect(service.check({ flights: [proposed()] })).rejects.toThrow('db down')
    })
  })

  describe('availability', () => {
    it('checks the flight at the new departure, keeping its length and aircraft, and leaving itself out', async () => {
      const result = await service.availability(FLIGHT, '2026-11-02T12:00:00Z')

      expect(feasibility.checkAircraftFeasibility).toHaveBeenCalledWith(
        AIRCRAFT,
        expect.objectContaining({ flightId: FLIGHT, scheduledDepAt: at('12:00'), depAt: at('12:00'), arrAt: at('14:00') }),
        db,
        { congestion: true },
      )
      expect(result).toMatchObject({ flight_id: FLIGHT, dep_at: at('12:00'), arr_at: at('14:00'), feasible: true })
    })

    it('reports the failing rules for a time that does not work', async () => {
      feasibility.checkAircraftFeasibility.mockResolvedValue({
        status: 'not_feasible',
        violations: [{ kind: 'turnaround_short', detail: 'short by 15 minutes' }],
        pending: [],
      })
      await expect(service.availability(FLIGHT, '2026-11-02T12:00:00Z')).resolves.toMatchObject({
        feasible: false,
        violations: [{ detail: 'short by 15 minutes' }],
      })
    })

    it('uses the diverted destination when the flight has one', async () => {
      db.flight.findUnique.mockResolvedValue(flight({ actual_destination: 'ZZD' }))
      await service.availability(FLIGHT, '2026-11-02T12:00:00Z')
      expect(feasibility.checkAircraftFeasibility).toHaveBeenCalledWith(
        AIRCRAFT,
        expect.objectContaining({ destination: 'ZZD' }),
        db,
        expect.anything(),
      )
    })

    it.each([
      ['a missing dep_at', undefined],
      ['a time without an offset', '2026-11-02T12:00:00'],
      ['not a date', 'noon'],
    ])('rejects %s with 400', async (_n, dep) => {
      await expect(service.availability(FLIGHT, dep)).rejects.toThrow(BadRequestException)
    })

    it('returns 404 for an unknown or malformed flight id', async () => {
      await expect(service.availability('nope', '2026-11-02T12:00:00Z')).rejects.toThrow(NotFoundException)
      db.flight.findUnique.mockResolvedValue(null)
      await expect(service.availability(FLIGHT, '2026-11-02T12:00:00Z')).rejects.toThrow(NotFoundException)
    })

    it.each(['departed', 'arrived', 'cancelled', 'holding', 'diverted'])('refuses a %s flight with 409', async (status) => {
      db.flight.findUnique.mockResolvedValue(flight({ status }))
      await expect(service.availability(FLIGHT, '2026-11-02T12:00:00Z')).rejects.toThrow(ConflictException)
      expect(feasibility.checkAircraftFeasibility).not.toHaveBeenCalled()
    })
  })
})
