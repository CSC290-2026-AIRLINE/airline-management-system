import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planDates } from './plan-dates.ts'

// 2026-11-02 is a Monday. Weekdays are ISO: 1 = Monday ... 7 = Sunday.
describe('planDates', () => {
  it('lists the dates in the range that fall on the chosen weekdays', () => {
    assert.deepEqual(planDates('2026-11-02', '2026-11-08', [1, 3]), ['2026-11-02', '2026-11-04'])
  })

  it('includes both ends of the range', () => {
    assert.deepEqual(planDates('2026-11-02', '2026-11-02', [1]), ['2026-11-02'])
    assert.deepEqual(planDates('2026-11-08', '2026-11-08', [7]), ['2026-11-08'])
  })

  it('repeats weekly across a longer range, in date order', () => {
    assert.deepEqual(planDates('2026-11-02', '2026-11-16', [1]), ['2026-11-02', '2026-11-09', '2026-11-16'])
  })

  it('returns nothing for no weekdays, a range that ends before it starts, or a date that does not exist', () => {
    assert.deepEqual(planDates('2026-11-02', '2026-11-08', []), [])
    assert.deepEqual(planDates('2026-11-08', '2026-11-02', [1, 2, 3, 4, 5, 6, 7]), [])
    assert.deepEqual(planDates('not-a-date', '2026-11-08', [1]), [])
  })

  it('counts every day when all seven weekdays are chosen', () => {
    assert.equal(planDates('2026-11-01', '2026-11-30', [1, 2, 3, 4, 5, 6, 7]).length, 30)
  })

  it('stops at about ten years so a typo cannot hang the page', () => {
    assert.ok(planDates('2000-01-01', '2999-12-31', [1, 2, 3, 4, 5, 6, 7]).length <= 3660)
  })
})
