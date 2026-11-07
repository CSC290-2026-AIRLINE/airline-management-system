import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { FlightSummary } from '../api/types.ts'
import { swapPlan } from './gate-swap.ts'

const flight = (id: string, gate: string | null) =>
  ({ id, gate: gate ? { id: gate, code: gate.toUpperCase() } : null }) as unknown as FlightSummary

test('swapPlan: two gated flights trade gates', () => {
  assert.deepEqual(swapPlan([flight('f1', 'a1'), flight('f2', 'a2')], 'a1'), [
    { flightId: 'f1', gateId: 'a2' },
    { flightId: 'f2', gateId: 'a1' },
  ])
})

test('swapPlan: three gated flights give no plan', () => {
  assert.deepEqual(swapPlan([flight('f1', 'a1'), flight('f2', 'a2'), flight('f3', 'a3')], 'a1'), [])
})

test('swapPlan: one gated flight gives no plan', () => {
  assert.deepEqual(swapPlan([flight('f1', 'a1'), flight('f2', null)], 'a1'), [])
})
