import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { availabilityChecks } from './availability.ts'

describe('availabilityChecks', () => {
  it('gives one Passed line when nothing failed and nothing was left unchecked', () => {
    const checks = availabilityChecks({ violations: [], pending: [] })
    assert.equal(checks.length, 1)
    assert.equal(checks[0].label, 'Passed')
  })

  it('gives one Failed line per broken rule, with the rule’s own text', () => {
    const checks = availabilityChecks({
      violations: [
        { kind: 'turnaround_short', detail: 'BKK needs 60 minutes, 45 given: short by 15 minutes' },
        { kind: 'congestion_exceeded', detail: 'BKK allows 1 movements per hour' },
      ],
      pending: [],
    })
    assert.deepEqual(checks, [
      { label: 'Failed', text: 'BKK needs 60 minutes, 45 given: short by 15 minutes' },
      { label: 'Failed', text: 'BKK allows 1 movements per hour' },
    ])
  })

  it('treats a gate that could not run as Failed, so an incomplete check is never shown as a pass', () => {
    const checks = availabilityChecks({ violations: [], pending: ['range: not available'] })
    assert.deepEqual(checks, [{ label: 'Failed', text: 'Could not be checked: range: not available' }])
  })

  it('lists broken rules before the gates that could not run', () => {
    const checks = availabilityChecks({ violations: [{ kind: 'aircraft_position', detail: 'overlap' }], pending: ['x'] })
    assert.deepEqual(
      checks.map((c) => c.text),
      ['overlap', 'Could not be checked: x'],
    )
  })
})
