import { type AircraftLeg, checkAircraftFeasibility, findDelayCascade, findPositionBreaks } from './aircraft-feasibility'

// Test-only airport codes (ZZ*) so nothing here reads as real reference data.
const at = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00Z`)

function leg(
  flightNumber: string,
  origin: string,
  destination: string,
  dep: string,
  arr: string,
  id: string | null = flightNumber,
): AircraftLeg {
  return { flightId: id, flightNumber, origin, destination, scheduledDepAt: at(dep), depAt: at(dep), arrAt: at(arr) }
}

const turnaround60 = () => 60

describe('checkAircraftFeasibility', () => {
  it('is feasible when both neighbours connect with enough ground time', () => {
    const previous = leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00')
    const next = leg('ZZ102', 'ZZC', 'ZZA', '13:00', '15:00')
    const candidate = leg('ZZ101', 'ZZB', 'ZZC', '09:00', '11:00', null)

    expect(checkAircraftFeasibility(candidate, [next, previous], turnaround60)).toEqual({ feasible: true, violations: [] })
  })

  it('is feasible with no other flights', () => {
    expect(checkAircraftFeasibility(leg('ZZ101', 'ZZB', 'ZZC', '09:00', '11:00', null), [], turnaround60).feasible).toBe(true)
  })

  it('accepts a gap exactly equal to the required turnaround', () => {
    const previous = leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00')
    const candidate = leg('ZZ101', 'ZZB', 'ZZC', '09:00', '11:00', null)

    expect(checkAircraftFeasibility(candidate, [previous], turnaround60).feasible).toBe(true)
  })

  it('reports an overlap with the flight it overlaps', () => {
    const other = leg('ZZ100', 'ZZB', 'ZZC', '08:30', '10:30')
    const candidate = leg('ZZ101', 'ZZB', 'ZZC', '09:00', '11:00', null)

    const result = checkAircraftFeasibility(candidate, [other], turnaround60)

    expect(result.feasible).toBe(false)
    expect(result.violations).toEqual([expect.objectContaining({ kind: 'aircraft_position', rule: 'overlap', otherFlightNumber: 'ZZ100' })])
  })

  it('reports a short turnaround after the previous flight, with the minutes short', () => {
    const previous = leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:15')
    const candidate = leg('ZZ101', 'ZZB', 'ZZC', '09:00', '11:00', null)

    const [violation] = checkAircraftFeasibility(candidate, [previous], turnaround60).violations

    expect(violation).toMatchObject({
      kind: 'turnaround_short',
      side: 'previous',
      airport: 'ZZB',
      gapMinutes: 45,
      requiredMinutes: 60,
      shortByMinutes: 15,
    })
    expect(violation.detail).toContain('short by 15 min')
  })

  it('reports a short turnaround before the next flight at the candidate destination', () => {
    const next = leg('ZZ102', 'ZZC', 'ZZA', '11:30', '13:30')
    const candidate = leg('ZZ101', 'ZZB', 'ZZC', '09:00', '11:00', null)

    const [violation] = checkAircraftFeasibility(candidate, [next], turnaround60).violations

    expect(violation).toMatchObject({ kind: 'turnaround_short', side: 'next', airport: 'ZZC', gapMinutes: 30, shortByMinutes: 30 })
  })

  it('uses the turnaround required at the airport where the aircraft is on the ground', () => {
    const previous = leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00')
    const candidate = leg('ZZ101', 'ZZB', 'ZZC', '09:00', '11:00', null)
    const resolver = jest.fn((airport: string) => (airport === 'ZZB' ? 90 : 30))

    const [violation] = checkAircraftFeasibility(candidate, [previous], resolver).violations

    expect(resolver).toHaveBeenCalledWith('ZZB')
    expect(violation).toMatchObject({ requiredMinutes: 90, shortByMinutes: 30 })
  })

  it('reports a previous flight that ends at another airport, and skips its turnaround', () => {
    const previous = leg('ZZ100', 'ZZA', 'ZZD', '06:00', '08:59')
    const candidate = leg('ZZ101', 'ZZB', 'ZZC', '09:00', '11:00', null)

    const result = checkAircraftFeasibility(candidate, [previous], turnaround60)

    expect(result.violations).toEqual([
      expect.objectContaining({ rule: 'previous_ends_elsewhere', expectedAirport: 'ZZB', actualAirport: 'ZZD' }),
    ])
  })

  it('reports a next flight that starts somewhere else', () => {
    const next = leg('ZZ102', 'ZZD', 'ZZA', '14:00', '16:00')
    const candidate = leg('ZZ101', 'ZZB', 'ZZC', '09:00', '11:00', null)

    expect(checkAircraftFeasibility(candidate, [next], turnaround60).violations).toEqual([
      expect.objectContaining({ rule: 'next_starts_elsewhere', expectedAirport: 'ZZC', actualAirport: 'ZZD' }),
    ])
  })

  it('treats a diverted previous flight as ending at its diversion airport', () => {
    // The caller passes destination = actual_destination for a diverted flight.
    const divertedPrevious = leg('ZZ100', 'ZZA', 'ZZE', '06:00', '08:00')
    const candidate = leg('ZZ101', 'ZZB', 'ZZC', '09:00', '11:00', null)

    expect(checkAircraftFeasibility(candidate, [divertedPrevious], turnaround60).violations[0]).toMatchObject({
      rule: 'previous_ends_elsewhere',
      actualAirport: 'ZZE',
    })
  })

  it('picks the nearest neighbours by scheduled departure, not every flight of the day', () => {
    const early = leg('ZZ090', 'ZZX', 'ZZY', '01:00', '02:00') // ends elsewhere, but is not the previous flight
    const previous = leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00')
    const candidate = leg('ZZ101', 'ZZB', 'ZZC', '09:00', '11:00', null)

    expect(checkAircraftFeasibility(candidate, [early, previous], turnaround60).feasible).toBe(true)
  })

  it('uses current times for the gap, so a delayed previous flight can break the turnaround', () => {
    const delayedPrevious: AircraftLeg = { ...leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00'), depAt: at('06:40'), arrAt: at('08:40') }
    const candidate = leg('ZZ101', 'ZZB', 'ZZC', '09:00', '11:00', null)

    expect(checkAircraftFeasibility(candidate, [delayedPrevious], turnaround60).violations[0]).toMatchObject({
      kind: 'turnaround_short',
      gapMinutes: 20,
    })
  })

  it('reports a previous flight that is still in the air at departure as an overlap, not a negative turnaround', () => {
    // Delayed so far that it lands after the candidate has already left and come back.
    const delayedPrevious: AircraftLeg = { ...leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00'), depAt: at('11:30'), arrAt: at('13:30') }
    const candidate = leg('ZZ101', 'ZZB', 'ZZC', '09:00', '11:00', null)

    expect(checkAircraftFeasibility(candidate, [delayedPrevious], turnaround60).violations).toEqual([
      expect.objectContaining({ kind: 'aircraft_position', rule: 'overlap', otherFlightNumber: 'ZZ100' }),
    ])
  })
})

const delayedBy = (l: AircraftLeg, minutes: number): AircraftLeg => ({
  ...l,
  depAt: new Date(l.depAt.getTime() + minutes * 60_000),
  arrAt: new Date(l.arrAt.getTime() + minutes * 60_000),
})

describe('findDelayCascade', () => {
  it('returns nothing when the next flight still has its turnaround', () => {
    const chain = [delayedBy(leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00'), 30), leg('ZZ101', 'ZZB', 'ZZA', '09:30', '11:00')]

    expect(findDelayCascade(chain, 'ZZ100', turnaround60)).toEqual([])
  })

  it('reports a short turnaround on the next flight with the exact numbers', () => {
    const chain = [delayedBy(leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00'), 60), leg('ZZ101', 'ZZB', 'ZZA', '09:30', '11:00')]

    const [b] = findDelayCascade(chain, 'ZZ100', turnaround60)

    expect(b).toMatchObject({
      flightId: 'ZZ101',
      rule: 'turnaround_short',
      causeFlightNumber: 'ZZ100',
      airport: 'ZZB',
      gapMinutes: 30,
      requiredMinutes: 60,
      shortByMinutes: 30,
      previousArrivalProjected: false,
    })
    expect(b.detail).toContain('short by 30 min (needs 60')
  })

  it('reports an overlap when the next flight departs before the delayed one lands', () => {
    const chain = [delayedBy(leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00'), 120), leg('ZZ101', 'ZZB', 'ZZA', '09:30', '11:00')]

    expect(findDelayCascade(chain, 'ZZ100', turnaround60)[0]).toMatchObject({ rule: 'overlap', gapMinutes: -30, shortByMinutes: 90 })
  })

  it('carries a long delay past one gap to the flights behind it', () => {
    const chain = [
      delayedBy(leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00'), 180), // lands 11:00
      leg('ZZ101', 'ZZB', 'ZZA', '09:00', '10:00'), // ready 12:00, so lands 13:00 at the earliest
      leg('ZZ102', 'ZZA', 'ZZB', '11:30', '12:30'), // needs 14:00
      leg('ZZ103', 'ZZB', 'ZZA', '18:00', '19:00'), // still connects: the walk stops
    ]

    const breaks = findDelayCascade(chain, 'ZZ100', turnaround60)

    expect(breaks.map((b) => [b.flightNumber, b.rule, b.shortByMinutes, b.previousArrivalProjected])).toEqual([
      ['ZZ101', 'overlap', 180, false],
      ['ZZ102', 'overlap', 150, true],
    ])
    expect(breaks.every((b) => b.causeFlightId === 'ZZ100')).toBe(true)
  })

  it('only walks forward from the delayed flight', () => {
    const chain = [leg('ZZ099', 'ZZB', 'ZZA', '03:00', '05:30'), delayedBy(leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00'), 30)]

    expect(findDelayCascade(chain, 'ZZ100', turnaround60)).toEqual([])
  })

  it('stops where the chain changes airport, which is a position problem, not a delay', () => {
    const chain = [delayedBy(leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00'), 120), leg('ZZ101', 'ZZC', 'ZZA', '09:30', '11:00')]

    expect(findDelayCascade(chain, 'ZZ100', turnaround60)).toEqual([])
  })

  it('returns nothing for a flight that is not in the chain', () => {
    expect(findDelayCascade([leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00')], 'ZZ999', turnaround60)).toEqual([])
  })

  it('does not move any flight', () => {
    const chain = [delayedBy(leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00'), 120), leg('ZZ101', 'ZZB', 'ZZA', '09:30', '11:00')]
    const before = JSON.stringify(chain)

    findDelayCascade(chain, 'ZZ100', turnaround60)

    expect(JSON.stringify(chain)).toBe(before)
  })
})

describe('findPositionBreaks', () => {
  it('reports the flight after one that ends at another airport', () => {
    const chain = [leg('ZZ100', 'ZZA', 'ZZD', '06:00', '08:00'), leg('ZZ101', 'ZZB', 'ZZA', '09:30', '11:00')]

    expect(findPositionBreaks(chain)).toEqual([
      expect.objectContaining({
        flightId: 'ZZ101',
        violation: expect.objectContaining({ rule: 'previous_ends_elsewhere', actualAirport: 'ZZD' }),
      }),
    ])
  })

  it('ignores a connected chain and leaves time problems to the delay cascade', () => {
    const late = delayedBy(leg('ZZ100', 'ZZA', 'ZZB', '06:00', '08:00'), 120)
    expect(findPositionBreaks([late, leg('ZZ101', 'ZZB', 'ZZA', '09:30', '11:00')])).toEqual([])
  })
})
