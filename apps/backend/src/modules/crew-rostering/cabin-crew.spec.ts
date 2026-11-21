import { cabinCrewFor, countSeats } from './cabin-crew'

/** An A320-like layout: 2 business rows of 4, then economy rows 3-30 of 6 with row 13 skipped. */
const A320 = {
  cabins: [
    { cabin_class: 'business', first_row: 1, last_row: 2, columns: ['A', 'C', 'D', 'F'] },
    { cabin_class: 'economy', first_row: 3, last_row: 30, columns: ['A', 'B', 'C', 'D', 'E', 'F'], skip_rows: [13] },
  ],
}

describe('countSeats', () => {
  it('counts rows times columns per cabin, less the skipped rows', () => {
    // 2 × 4 + (28 − 1) × 6 = 8 + 162
    expect(countSeats(A320)).toBe(170)
  })

  it('counts an unreadable layout as no seats', () => {
    expect(countSeats(null)).toBe(0)
    expect(countSeats({})).toBe(0)
    expect(countSeats({ cabins: [{ first_row: 'x', last_row: 3, columns: ['A'] }] })).toBe(0)
  })
})

describe('cabinCrewFor', () => {
  it('rounds seats over seats_per_cabin_crew up', () => {
    expect(cabinCrewFor(A320, 50)).toBe(4)
    expect(cabinCrewFor(A320, 85)).toBe(2)
    expect(cabinCrewFor(A320, 170)).toBe(1)
  })

  it('needs at least one cabin crew member, even with no seats', () => {
    expect(cabinCrewFor(null, 50)).toBe(1)
  })

  it('falls back to 50 seats each when the setting is not above 0', () => {
    expect(cabinCrewFor(A320, 0)).toBe(4)
    expect(cabinCrewFor(A320, Number.NaN)).toBe(4)
  })
})
