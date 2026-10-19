// Clock test: SIMULATION_NOW_ISO env override is honored when set and
// parseable, otherwise the real wall clock is used.

import { SystemClock } from './clock'

describe('SystemClock', () => {
  const original = process.env.SIMULATION_NOW_ISO
  afterEach(() => {
    if (original === undefined) delete process.env.SIMULATION_NOW_ISO
    else process.env.SIMULATION_NOW_ISO = original
  })

  it('returns the override when SIMULATION_NOW_ISO is set', () => {
    process.env.SIMULATION_NOW_ISO = '2026-10-08T09:00:00Z'
    const clock = new SystemClock()
    expect(clock.now().toISOString()).toBe('2026-10-08T09:00:00.000Z')
  })

  it('falls back to the wall clock when SIMULATION_NOW_ISO is malformed', () => {
    process.env.SIMULATION_NOW_ISO = 'not a date'
    const clock = new SystemClock()
    const a = clock.now()
    const b = new Date()
    expect(Math.abs(a.getTime() - b.getTime())).toBeLessThan(2000)
  })
})
