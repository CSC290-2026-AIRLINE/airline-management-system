import { DEMO_LAYOUT } from '../providers/demo-data'
import { seatList } from './seat-list'

const codes = (seats: Array<{ code: string }>) => seats.map((seat) => seat.code)

describe('seatList', () => {
  it("expands feature 9's cabins: columns, row types, skipped rows and blocked seats", () => {
    const seats = seatList(
      {
        cabins: [
          { cabin_class: 'business', first_row: 1, last_row: 2, columns: ['A', 'C', 'D', 'F'] },
          { cabin_class: 'premium_economy', first_row: 3, last_row: 4, columns: ['A', 'B', 'C'], row_types: { extra_legroom: [3] } },
          {
            cabin_class: 'economy',
            first_row: 5,
            last_row: 8,
            columns: ['A', 'B'],
            skip_rows: [7],
            row_types: { exit_row: [6] },
            blocked_seats: ['8B'],
          },
        ],
      },
      {},
    )
    expect(codes(seats.filter((seat) => seat.cabin === 'business'))).toEqual(['1A', '1C', '1D', '1F', '2A', '2C', '2D', '2F'])
    expect(seats.find((seat) => seat.code === '1A')).toMatchObject({ row: 1, letter: 'A', type: 'business', blocked: false })
    expect(codes(seats.filter((seat) => seat.cabin === 'premium_economy'))).toEqual(['3A', '3B', '3C', '4A', '4B', '4C'])
    expect(seats.find((seat) => seat.code === '3B')?.type).toBe('front')
    expect(seats.find((seat) => seat.code === '4B')?.type).toBe('standard')
    expect(codes(seats.filter((seat) => seat.cabin === 'economy'))).toEqual(['5A', '5B', '6A', '6B', '8A', '8B'])
    expect(seats.find((seat) => seat.code === '6A')?.type).toBe('exit')
    expect(seats.find((seat) => seat.code === '8B')?.blocked).toBe(true)
  })

  it('splits a plain grid into the cabins the flight sells, front to back', () => {
    const seats = seatList({ rows: 30, seats_per_row: 6 }, { economy: 144, premium_economy: 24, business: 12 })
    expect(seats).toHaveLength(180)
    const rowsOf = (cabin: string) => [...new Set(seats.filter((seat) => seat.cabin === cabin).map((seat) => seat.row))]
    expect(rowsOf('business')).toEqual([1, 2])
    expect(rowsOf('premium_economy')).toEqual([3, 4, 5, 6])
    expect(rowsOf('economy')[0]).toBe(7)
    expect(rowsOf('economy')).toHaveLength(24)
    expect(seats.find((seat) => seat.code === '1A')?.type).toBe('business')
    expect(seats.find((seat) => seat.code === '3F')?.type).toBe('standard')
  })

  it('a plain grid with no inventory is one economy cabin', () => {
    const seats = seatList({ rows: 2, seats_per_row: 4 }, {})
    expect(codes(seats)).toEqual(['1A', '1B', '1C', '1D', '2A', '2B', '2C', '2D'])
    expect(seats.every((seat) => seat.cabin === 'economy' && seat.type === 'standard')).toBe(true)
  })

  it('a layout it cannot read has no seats', () => {
    expect(seatList(null, {})).toEqual([])
    expect(seatList({ cabins: 'no' }, { economy: 10 })).toEqual([])
    expect(seatList({ rows: 2_000_000, seats_per_row: 6 }, {})).toEqual([])
  })

  it('the demo aircraft has business, premium economy and economy seats', () => {
    const seats = seatList(DEMO_LAYOUT, {})
    expect(seats.find((seat) => seat.code === '2C')).toMatchObject({ cabin: 'business', type: 'business' })
    expect(seats.find((seat) => seat.code === '8D')).toMatchObject({ cabin: 'premium_economy', type: 'standard' })
    expect(seats.find((seat) => seat.code === '9F')?.cabin).toBe('premium_economy')
    expect(seats.find((seat) => seat.code === '4A')).toMatchObject({ cabin: 'economy', type: 'front' })
    expect(seats.find((seat) => seat.code === '12A')).toMatchObject({ cabin: 'economy', type: 'exit' })
    expect(seats.find((seat) => seat.code === '14A')).toMatchObject({ cabin: 'economy', type: 'standard' })
    expect(seats).toHaveLength(12 + 12 + 90)
  })
})
