import type { DbService } from '@backend/db/db.service'
import { AircraftSeatMapAdapter, aircraftSeatMap } from './aircraft-seat-map.adapter'
import { demoAircraftLayout, demoCabinSummaries } from '../seats/demo-layout'
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('AircraftSeatMapAdapter', () => {
  const canonical = {
    cabins: [
      {
        cabin_class: 'economy',
        first_row: 10,
        last_row: 13,
        columns: ['A', 'B', 'C', 'D'],
        aisle_after: ['B'],
        skip_rows: [11],
        row_types: { extra_legroom: [10], exit_row: [12] },
        blocked_seats: ['13D'],
      },
    ],
  }
  it('expands the stored aircraft layout with its skipped rows, blocked seats, types, aisles and capacity', () => {
    const map = aircraftSeatMap(canonical, 'type-one')
    expect(map.aircraftTypeId).toBe('type-one')
    expect(map.rows.map((row) => row.row)).toEqual([10, 12, 13])
    expect(map.cabins).toEqual([{ cabin: 'economy', capacity: 11 }])
    expect(map.rows[0].seats[2]).toMatchObject({ seatCode: '10C', type: 'extra_legroom', aisleBefore: true })
    expect(map.rows[1].seats[0].type).toBe('exit')
    expect(map.rows[2].seats[3].blocked).toBe(true)
  })
  it('reads existing demo layouts from the database without changing their sellable capacity', () => {
    expect(aircraftSeatMap(demoAircraftLayout(), 'demo').cabins).toEqual(demoCabinSummaries())
  })
  it('supports the older flat layout already stored on local demo aircraft', () => {
    const map = aircraftSeatMap(
      { rows: 30, columns: ['A', 'B', 'C', 'D', 'E', 'F'], exitRows: [12], extraLegroomRows: [1, 2, 3] },
      'old-demo',
    )
    expect(map.cabins).toEqual([{ cabin: 'economy', capacity: 180 }])
    expect(map.rows[0].seats[0].type).toBe('extra_legroom')
    expect(map.rows[11].seats[0].type).toBe('exit')
    expect(map.rows[0].seats[3].aisleBefore).toBe(true)
  })
  it.each([
    {},
    { cabins: [] },
    { cabins: [{ ...canonical.cabins[0], last_row: 1000 }] },
    { cabins: [{ ...canonical.cabins[0], columns: ['A', 'A'] }] },
    { cabins: [{ ...canonical.cabins[0], blocked_seats: ['99Z'] }] },
    { cabins: [canonical.cabins[0], canonical.cabins[0]] },
  ])('rejects malformed layouts instead of selling a generic seat map', (layout) => {
    expect(() => aircraftSeatMap(layout, 'type')).toThrow('aircraft seat layout is unavailable')
  })
  it('uses the flight’s assigned aircraft type, not a fixed layout', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({ aircraft: { deleted_at: null, aircraft_type: { id: 'type-real', deleted_at: null, layout: canonical } } })
    const adapter = new AircraftSeatMapAdapter({ flight: { findUnique } } as unknown as DbService)
    expect((await adapter.getSeatMap('flight')).aircraftTypeId).toBe('type-real')
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'flight' } }))
    findUnique.mockResolvedValueOnce(null)
    await expect(adapter.getSeatMap('missing')).rejects.toThrow('Flight not found')
  })
  it('replays an aircraft change using the type recorded in the event even after a later aircraft change', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'event-type', layout: canonical })
    const flight = { findUnique: jest.fn() }
    const adapter = new AircraftSeatMapAdapter({ aircraft_type: { findUnique }, flight } as unknown as DbService)
    expect((await adapter.getSeatMap('flight', 'event-type')).aircraftTypeId).toBe('event-type')
    expect(flight.findUnique).not.toHaveBeenCalled()
  })
})
