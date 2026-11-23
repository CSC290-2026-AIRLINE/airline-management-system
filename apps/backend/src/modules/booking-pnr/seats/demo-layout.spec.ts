import { DEMO_CABINS, DEMO_ROW_COUNT, buildDemoRows, demoCabinCapacity, demoCabinSummaries } from './demo-layout'

describe('demo seat layout', () => {
  const rows = buildDemoRows()
  const seats = rows.flatMap((row) => row.seats)

  it('reports each cabin capacity as its sellable seat count', () => {
    const summaries = demoCabinSummaries()

    expect(summaries).toEqual([
      { cabin: 'first', capacity: 4 },
      { cabin: 'business', capacity: 18 },
      { cabin: 'premium_economy', capacity: 18 },
      { cabin: 'economy', capacity: 138 },
    ])

    for (const summary of summaries) {
      expect(seats.filter((seat) => seat.cabin === summary.cabin && !seat.blocked)).toHaveLength(summary.capacity)
      expect(demoCabinCapacity(summary.cabin)).toBe(summary.capacity)
    }
  })

  it('creates contiguous six-column rows with unique, valid seat codes', () => {
    expect(rows.map((row) => row.row)).toEqual(Array.from({ length: DEMO_ROW_COUNT }, (_, index) => index + 1))
    expect(rows).toHaveLength(DEMO_ROW_COUNT)
    expect(rows.every((row) => row.seats.length === 6)).toBe(true)
    expect(new Set(seats.map((seat) => seat.seatCode)).size).toBe(seats.length)
    expect(seats.every((seat) => /^[1-9][0-9]?[A-Z]$/.test(seat.seatCode))).toBe(true)
  })

  it('keeps the exit row and extra-legroom rows in their intended cabins', () => {
    const exitSeats = rows.find((row) => row.row === 12)?.seats ?? []
    expect(exitSeats).toHaveLength(6)
    expect(exitSeats.every((seat) => seat.cabin === 'economy' && seat.type === 'exit')).toBe(true)

    for (const rowNumber of [5, 6]) {
      const premiumSeats = rows.find((row) => row.row === rowNumber)?.seats ?? []
      expect(premiumSeats.every((seat) => seat.cabin === 'premium_economy' && seat.type === 'extra_legroom')).toBe(true)
    }
    expect(rows.find((row) => row.row === 7)?.seats.every((seat) => seat.type === 'standard')).toBe(true)
    for (const rowNumber of [8, 9, 10]) {
      expect(rows.find((row) => row.row === rowNumber)?.seats.every((seat) => seat.type === 'extra_legroom')).toBe(true)
    }
  })

  it('blocks the two unused first-cabin seats and gives every seat a capacity entry', () => {
    const blockedCodes = seats
      .filter((seat) => seat.blocked)
      .map((seat) => seat.seatCode)
      .sort()
    expect(blockedCodes).toEqual(['1E', '1F'])

    const cabinsWithCapacity = new Set(demoCabinSummaries().map((summary) => summary.cabin))
    expect(DEMO_CABINS.every((cabin) => cabinsWithCapacity.has(cabin.cabin))).toBe(true)
    expect(seats.every((seat) => cabinsWithCapacity.has(seat.cabin))).toBe(true)
  })
})
