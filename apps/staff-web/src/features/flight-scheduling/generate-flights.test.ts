import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  approvalBody,
  approvalOutcome,
  checkOutcome,
  chunks,
  confirmBody,
  confirmOutcome,
  errorText,
  gateCheckBody,
  moveTo,
  type PlanFlight,
} from './generate-flights.ts'
import type { ApprovalRow } from './types'

const BKK = 'Asia/Bangkok'
const flight: PlanFlight = {
  routeId: 'r1',
  patternId: 'p1',
  flight: 'FL101',
  date: '2026-11-10',
  aircraft: 'a1',
  depAt: '2026-11-10T03:00:00.000Z', // 10:00 at Bangkok
  arrAt: '2026-11-10T04:15:00.000Z',
}
const approval = (over: Partial<ApprovalRow> = {}) => ({ status: 'approved', response_note: null, offers: [], ...over }) as ApprovalRow

describe('generate flights helpers', () => {
  it('chunks a list into calls of at most 50', () => {
    assert.deepEqual(chunks([1, 2, 3], 2), [[1, 2], [3]])
    assert.equal(
      chunks(Array.from({ length: 120 }, (_, i) => i))
        .map((c) => c.length)
        .join(),
      '50,50,20',
    )
    assert.deepEqual(chunks([]), [])
  })

  it('reads an error that is a string, a Nest body with one message or several, or nothing', () => {
    assert.equal(errorText('Flight not found'), 'Flight not found')
    assert.equal(errorText({ message: 'A gate failed' }), 'A gate failed')
    assert.equal(errorText({ message: ['a', 'b'] }), 'a; b')
    assert.equal(errorText(undefined), 'Failed')
  })

  describe('gate check', () => {
    it('sends the route, flight number, aircraft and the UTC times', () => {
      assert.deepEqual(gateCheckBody([flight]), {
        flights: [{ route_id: 'r1', flight_number: 'FL101', aircraft_id: 'a1', dep_at: flight.depAt, arr_at: flight.arrAt }],
      })
    })

    it('shows Passed for a feasible flight', () => {
      assert.equal(checkOutcome({ index: 0, flight_number: 'FL101', status: 200, feasible: true }).check, 'passed')
    })

    it('shows the exact rules that failed, such as how many minutes the turnaround is short', () => {
      const r = checkOutcome({
        index: 0,
        flight_number: 'FL101',
        status: 200,
        feasible: false,
        violations: [{ detail: 'BKK needs 60 minutes, 45 given: short by 15 minutes' }, { detail: 'range exceeded' }],
      })
      assert.deepEqual(r, { check: 'failed', text: 'BKK needs 60 minutes, 45 given: short by 15 minutes; range exceeded' })
    })

    it('never shows a check that could not run as a pass', () => {
      const r = checkOutcome({
        index: 0,
        flight_number: 'FL101',
        status: 200,
        feasible: false,
        violations: [],
        pending: ['range: not available'],
      })
      assert.deepEqual(r, { check: 'failed', text: 'Could not be checked: range: not available' })
    })

    it('shows why a flight could not be checked at all, such as an inactive route', () => {
      assert.deepEqual(
        checkOutcome({ index: 0, flight_number: 'FL101', status: 422, error: { message: 'Route is unknown or not active' } }),
        {
          check: 'failed',
          text: 'Route is unknown or not active',
        },
      )
    })
  })

  describe('approval', () => {
    it('asks for a new flight with the pattern, and leaves the pattern out for a one-off flight', () => {
      assert.deepEqual(approvalBody(flight), {
        purpose: 'new_flight',
        route_id: 'r1',
        pattern_id: 'p1',
        flight_number: 'FL101',
        service_date: '2026-11-10',
        aircraft_id: 'a1',
        dep_at: flight.depAt,
        arr_at: flight.arrAt,
      })
      assert.equal('pattern_id' in approvalBody({ ...flight, patternId: null }), false)
    })

    it('maps each approval status to what the row shows', () => {
      assert.equal(approvalOutcome(approval({ status: 'approved' }), BKK).approval, 'approved')
      assert.equal(approvalOutcome(approval({ status: 'pending' }), BKK).approval, 'pending')
      assert.equal(
        approvalOutcome(approval({ status: 'rejected', response_note: 'Not approved: curfew' }), BKK).answer,
        'Not approved: curfew',
      )
      assert.equal(approvalOutcome(approval({ status: 'consumed' }), BKK).approval, 'none')
    })

    it('lists offered slots as local times and says what was offered', () => {
      const offers = [
        { kind: 'slot' as const, starts_at: '2026-11-10T22:00:00Z', ends_at: null },
        { kind: 'slot' as const, starts_at: '2026-11-10T22:15:00Z', ends_at: null },
      ]
      assert.deepEqual(approvalOutcome(approval({ status: 'alternative_offered', response_note: 'Not approved: curfew', offers }), BKK), {
        approval: 'offered',
        answer: 'Not approved: curfew. Offered: 05:00, 05:15',
        slots: ['05:00', '05:15'],
      })
    })

    it('offers a window as its start, and says the window', () => {
      const offers = [{ kind: 'window' as const, starts_at: '2026-11-10T23:00:00Z', ends_at: '2026-11-11T02:45:00Z' }]
      const r = approvalOutcome(approval({ status: 'alternative_offered', offers }), BKK)
      assert.deepEqual(r.slots, ['06:00'])
      assert.equal(r.answer, 'Offered: 06:00 to 09:45')
    })

    it('moves a flight to another local departure time and keeps its length', () => {
      assert.deepEqual(moveTo(flight, '12:30', BKK), { depAt: '2026-11-10T05:30:00.000Z', arrAt: '2026-11-10T06:45:00.000Z' })
    })
  })

  describe('confirm', () => {
    it('sends each flight with its approval and the times it was approved for', () => {
      assert.deepEqual(confirmBody([{ ...flight, approvalId: 'ap1' }]), {
        flights: [
          {
            approval_id: 'ap1',
            route_id: 'r1',
            pattern_id: 'p1',
            flight_number: 'FL101',
            service_date: '2026-11-10',
            aircraft_id: 'a1',
            scheduled_dep_at: flight.depAt,
            scheduled_arr_at: flight.arrAt,
          },
        ],
      })
    })

    it('counts 201 as saved and shows the error of anything else', () => {
      assert.deepEqual(confirmOutcome({ index: 0, approval_id: 'a', flight_number: 'FL101', status: 201 }), { saved: true, text: '' })
      assert.deepEqual(
        confirmOutcome({ index: 0, approval_id: 'a', flight_number: 'FL101', status: 409, error: { message: 'A gate failed' } }),
        {
          saved: false,
          text: 'A gate failed',
        },
      )
    })
  })
})
