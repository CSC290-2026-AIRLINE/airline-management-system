// Run inside apps/staff-web: node --test "src/features/checkin-boarding/**/*.test.ts"
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SeatMap, SeatMapSeat } from '../api/types.ts'
import { formatBaht } from '../domain/format.ts'
import { mrzLine, seatOptions } from './counter-steps.ts'

const seat = (over: Partial<SeatMapSeat>): SeatMapSeat => ({
  code: '8A',
  row: 8,
  letter: 'A',
  cabin: 'premium_economy',
  type: 'standard',
  status: 'free',
  fee: 0,
  ...over,
})

const map: SeatMap = {
  flightId: 'f1',
  rows: [
    { row: 1, exitRow: false, seats: [seat({ code: '1A', row: 1, cabin: 'business', type: 'business' })] },
    {
      row: 8,
      exitRow: false,
      seats: [seat({}), seat({ code: '8B', letter: 'B', status: 'taken' }), seat({ code: '8C', letter: 'C', status: 'blocked' })],
    },
    { row: 9, exitRow: true, seats: [seat({ code: '9A', row: 9, type: 'exit', fee: 450 })] },
  ],
}

test('seatOptions: the free seats of the cabin of the passenger, a paid seat with its fee', () => {
  assert.deepEqual(seatOptions(map, 'premium_economy'), [
    { code: '8A', label: '8A' },
    { code: '9A', label: `9A · exit row · ${formatBaht(450)}` },
  ])
  assert.deepEqual(seatOptions(map, 'first'), [])
})

test('mrzLine: spaces go and the letters are capitals, as on the passport', () => {
  assert.equal(mrzLine(' p<utoeriksson<<anna  maria '), 'P<UTOERIKSSON<<ANNAMARIA')
})
