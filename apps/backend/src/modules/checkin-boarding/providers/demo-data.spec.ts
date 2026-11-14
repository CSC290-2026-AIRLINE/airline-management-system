import { DEMO_PASSENGERS, demoDepartures } from './demo-data'

describe('demo data', () => {
  it('departures default to the next quarter hour at least 3 hours out', () => {
    const d = demoDepartures(new Date('2026-11-11T02:07:00Z'))
    expect(d.fy204.toISOString()).toBe('2026-11-11T05:15:00.000Z')
    expect(d.fy318.getTime() - d.fy204.getTime()).toBe(15 * 60_000)
  })

  it('an override wins', () => {
    expect(demoDepartures(new Date(), '2026-11-11T03:25:00Z').fy204.toISOString()).toBe('2026-11-11T03:25:00.000Z')
  })

  it('has the 14 prototype passengers with unique PNRs', () => {
    expect(new Set(DEMO_PASSENGERS.map((p) => p.pnr)).size).toBe(14)
  })
})
