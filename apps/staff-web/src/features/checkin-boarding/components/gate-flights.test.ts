// Run inside apps/staff-web: node --test "src/features/checkin-boarding/**/*.test.ts"
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flightOfGate, flightsWithoutGate } from './gate-flights.ts'
import type { FlightSummary, GateInfo } from '../api/types.ts'

function gate(id: string, code: string, flight: { id: string; flightNumber: string } | null): GateInfo {
  return {
    id,
    code,
    airportCode: 'BKK',
    isActive: true,
    flight: flight ? { ...flight, depAt: '2026-11-11T03:25:00.000Z' } : null,
  }
}

function flight(
  id: string,
  flightNumber: string,
  depAt: string,
  status: string,
  gate: { id: string; code: string } | null = null,
  originCode = 'BKK',
): FlightSummary {
  return {
    id,
    flightNumber,
    serviceDate: '2026-11-11',
    depAt,
    status,
    origin: { code: originCode, city: 'Bangkok', country: 'TH' },
    destination: { code: 'NRT', city: 'Tokyo', country: 'JP' },
    gate,
    boardingAt: '2026-11-11T02:45:00.000Z',
  }
}

test('a gate with a flight shows that flight', () => {
  const gates = [gate('g-a1', 'A1', { id: 'flt-204', flightNumber: 'FY 204' })]
  assert.equal(flightOfGate(gates, { gateId: 'g-a1', flightId: 'flt-204' }, 'g-a1'), 'flt-204')
})

test('a free gate that is not the one on screen shows no flight', () => {
  const gates = [gate('g-a1', 'A1', { id: 'flt-204', flightNumber: 'FY 204' }), gate('g-a2', 'A2', null)]
  assert.equal(flightOfGate(gates, { gateId: 'g-a1', flightId: 'flt-204' }, 'g-a2'), null)
})

test('the gate on screen keeps its flight when the gate was closed', () => {
  const gates = [gate('g-a1', 'A1', null)]
  assert.equal(flightOfGate(gates, { gateId: 'g-a1', flightId: 'flt-204' }, 'g-a1'), 'flt-204')
})

test('after a move the free gate shows no flight', () => {
  const gates = [gate('g-a1', 'A1', null), gate('g-a3', 'A3', { id: 'flt-204', flightNumber: 'FY 204' })]
  assert.equal(flightOfGate(gates, { gateId: 'g-a3', flightId: 'flt-204' }, 'g-a1'), null)
})

test('without a gate picked a free gate shows no flight', () => {
  const gates = [gate('g-a2', 'A2', null)]
  assert.equal(flightOfGate(gates, null, 'g-a2'), null)
})

test('only the scheduled and delayed flights of the airport may get their first gate', () => {
  const flights = [
    flight('f-scheduled', 'FY 1', '2026-11-11T09:00:00.000Z', 'scheduled'),
    flight('f-delayed', 'FY 2', '2026-11-11T08:00:00.000Z', 'delayed'),
    flight('f-cancelled', 'FY 3', '2026-11-11T07:00:00.000Z', 'cancelled'),
    flight('f-departed', 'FY 4', '2026-11-11T06:00:00.000Z', 'departed'),
    flight('f-with-gate', 'FY 5', '2026-11-11T05:00:00.000Z', 'scheduled', { id: 'g-a1', code: 'A1' }),
    flight('f-other-airport', 'FY 6', '2026-11-11T04:00:00.000Z', 'scheduled', null, 'ICN'),
  ]
  assert.deepEqual(
    flightsWithoutGate(flights, 'BKK').map((item) => item.id),
    ['f-delayed', 'f-scheduled'],
  )
})

test('the flights that may get a gate are the earliest first', () => {
  const flights = [
    flight('f-late', 'FY 1', '2026-11-11T09:00:00.000Z', 'scheduled'),
    flight('f-early', 'FY 2', '2026-11-11T07:00:00.000Z', 'scheduled'),
  ]
  assert.deepEqual(
    flightsWithoutGate(flights, 'BKK').map((item) => item.id),
    ['f-early', 'f-late'],
  )
})
