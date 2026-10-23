import { BadGatewayException, BadRequestException, ConflictException } from '@nestjs/common'
import { type AircraftDirectory, PendingAircraftDirectory } from './aircraft-directory'
import { AircraftFeasibilityService, assertGatesPass, type FeasibilityCandidate } from './aircraft-feasibility.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

// Test-only codes (ZZ*) and ids; no real reference data.
const AIRCRAFT = '00000000-0000-0000-0000-0000000000a1'
const at = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00Z`)

const candidate = (over: Partial<FeasibilityCandidate> = {}): FeasibilityCandidate => ({
  flightId: null,
  flightNumber: 'ZZ101',
  origin: 'ZZB',
  destination: 'ZZC',
  scheduledDepAt: at('09:00'),
  depAt: at('09:00'),
  arrAt: at('11:00'),
  distanceKm: 800,
  ...over,
})

const flightRow = (id: string, origin: string, destination: string, dep: string, arr: string, actualDestination: string | null = null) => ({
  id,
  flight_number: id,
  scheduled_dep_at: at(dep),
  dep_at: at(dep),
  arr_at: at(arr),
  actual_destination: actualDestination,
  route: { origin, destination },
})

describe('AircraftFeasibilityService.checkAircraftFeasibility', () => {
  const db = { flight: { findMany: jest.fn() }, airport: { findMany: jest.fn() } }
  const directory: jest.Mocked<AircraftDirectory> = { connected: true, availability: jest.fn(), typeFacts: jest.fn() }
  const service = new AircraftFeasibilityService(db as never, directory)

  // findMany is called three times: previous, next, overlapping.
  const neighbours = (previous: object[] = [], next: object[] = [], overlapping: object[] = []) =>
    db.flight.findMany.mockResolvedValueOnce(previous).mockResolvedValueOnce(next).mockResolvedValueOnce(overlapping)

  beforeEach(() => {
    jest.resetAllMocks()
    directory.availability.mockResolvedValue({ kind: 'available' })
    directory.typeFacts.mockResolvedValue({ maxRangeKm: 3000, minTurnaroundMinutes: 40 })
    db.airport.findMany.mockResolvedValue([
      { iata_code: 'ZZB', min_turnaround_min: 60 },
      { iata_code: 'ZZC', min_turnaround_min: 30 },
    ])
  })

  it('is feasible when every gate passes', async () => {
    neighbours([flightRow('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00')], [flightRow('ZZ102', 'ZZC', 'ZZA', '12:00', '14:00')])

    await expect(service.checkAircraftFeasibility(AIRCRAFT, candidate())).resolves.toEqual({
      status: 'feasible',
      violations: [],
      pending: [],
    })
  })

  it('reports Feature 9 unavailability with its own rule', async () => {
    neighbours()
    directory.availability.mockResolvedValue({
      kind: 'unavailable',
      rule: 'in_maintenance',
      detail: 'In maintenance 2026-11-01 to 2026-11-03',
    })

    const report = await service.checkAircraftFeasibility(AIRCRAFT, candidate())

    expect(report.status).toBe('not_feasible')
    expect(report.violations).toEqual([
      { kind: 'aircraft_unavailable', rule: 'in_maintenance', detail: 'In maintenance 2026-11-01 to 2026-11-03' },
    ])
  })

  it('reports a route longer than the aircraft range', async () => {
    neighbours()

    const report = await service.checkAircraftFeasibility(AIRCRAFT, candidate({ distanceKm: 3500 }))

    expect(report.violations).toEqual([expect.objectContaining({ kind: 'range_exceeded', distanceKm: 3500, maxRangeKm: 3000 })])
  })

  it('uses the larger of the airport and aircraft-type minimum turnaround', async () => {
    // Airport ZZC needs 30, the type needs 40: a 35-minute gap before the next flight is short by 5.
    neighbours([], [flightRow('ZZ102', 'ZZC', 'ZZA', '11:35', '13:00')])

    const report = await service.checkAircraftFeasibility(AIRCRAFT, candidate())

    expect(report.violations).toEqual([
      expect.objectContaining({ kind: 'turnaround_short', airport: 'ZZC', requiredMinutes: 40, shortByMinutes: 5 }),
    ])
  })

  it('treats a diverted previous flight as ending at its actual destination', async () => {
    neighbours([flightRow('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00', 'ZZD')])

    const report = await service.checkAircraftFeasibility(AIRCRAFT, candidate())

    expect(report.violations).toEqual([expect.objectContaining({ rule: 'previous_ends_elsewhere', actualAirport: 'ZZD' })])
  })

  it('reports an overlapping flight once, even when it is also the nearest neighbour', async () => {
    const overlapping = flightRow('ZZ099', 'ZZB', 'ZZC', '08:30', '10:30')
    neighbours([overlapping], [], [overlapping])

    const report = await service.checkAircraftFeasibility(AIRCRAFT, candidate())

    expect(report.violations).toEqual([expect.objectContaining({ rule: 'overlap', otherFlightNumber: 'ZZ099' })])
  })

  it('leaves out cancelled flights and the candidate itself when loading neighbours', async () => {
    neighbours()
    const ownId = '00000000-0000-0000-0000-0000000000f1'

    await service.checkAircraftFeasibility(AIRCRAFT, candidate({ flightId: ownId }))

    for (const [args] of db.flight.findMany.mock.calls as [{ where: object }][]) {
      expect(args.where).toMatchObject({ aircraft_id: AIRCRAFT, status: { not: 'cancelled' }, id: { not: ownId } })
    }
  })

  it('is incomplete, not feasible, while Feature 9 is not connected', async () => {
    const pendingService = new AircraftFeasibilityService(db as never, new PendingAircraftDirectory())
    neighbours()

    const report = await pendingService.checkAircraftFeasibility(AIRCRAFT, candidate())

    expect(report.status).toBe('incomplete')
    expect(report.violations).toEqual([])
    expect(report.pending).toHaveLength(3)
  })

  it('still reports failures found without Feature 9, as not feasible', async () => {
    const pendingService = new AircraftFeasibilityService(db as never, new PendingAircraftDirectory())
    neighbours([flightRow('ZZ100', 'ZZA', 'ZZB', '06:00', '08:30')]) // 30 min at ZZB, airport needs 60

    const report = await pendingService.checkAircraftFeasibility(AIRCRAFT, candidate())

    expect(report.status).toBe('not_feasible')
    expect(report.violations).toEqual([expect.objectContaining({ kind: 'turnaround_short', requiredMinutes: 60 })])
  })

  it('rejects a malformed aircraft id', async () => {
    await expect(service.checkAircraftFeasibility('not-a-uuid', candidate())).rejects.toThrow(BadRequestException)
    expect(db.flight.findMany).not.toHaveBeenCalled()
  })

  it('rejects an arrival that is not after the departure', async () => {
    await expect(service.checkAircraftFeasibility(AIRCRAFT, candidate({ arrAt: at('09:00') }))).rejects.toThrow(BadRequestException)
  })

  it('reads through the caller transaction when one is passed', async () => {
    const tx = { flight: { findMany: jest.fn().mockResolvedValue([]) }, airport: { findMany: jest.fn().mockResolvedValue([]) } }

    await service.checkAircraftFeasibility(AIRCRAFT, candidate(), tx as never)

    expect(tx.flight.findMany).toHaveBeenCalledTimes(3)
    expect(tx.airport.findMany).toHaveBeenCalled()
    expect(db.flight.findMany).not.toHaveBeenCalled()
  })

  it('exposes the same larger-of turnaround rule for the cascade check', async () => {
    const resolve = await service.turnaroundResolver(db as never, AIRCRAFT, ['ZZB', 'ZZC'])
    expect([resolve('ZZB'), resolve('ZZC'), resolve('ZZX')]).toEqual([60, 40, 40])
  })
})

describe('assertGatesPass', () => {
  it('passes only a feasible report', () => {
    expect(() => assertGatesPass({ status: 'feasible', violations: [], pending: [] }, 'x')).not.toThrow()
  })

  it('refuses a failed gate with 409 and the failing rules', () => {
    const violations = [{ kind: 'range_exceeded' as const, distanceKm: 9, maxRangeKm: 1, detail: 'too far' }]
    expect(() => assertGatesPass({ status: 'not_feasible', violations, pending: [] }, 'Cannot fly')).toThrow(ConflictException)
  })

  it('refuses an incomplete report with 502: a gate Feature 9 could not answer is not a pass', () => {
    expect(() => assertGatesPass({ status: 'incomplete', violations: [], pending: ['availability'] }, 'x')).toThrow(BadGatewayException)
  })
})
