import { decide, type SimulatorPolicy } from './approval-simulator'

const TZ = 'Asia/Bangkok' // UTC+7, no DST
const at = (iso: string) => new Date(iso)
const NONE: SimulatorPolicy = { curfewStartMin: null, curfewEndMin: null, maxPerHour: null, offerStyle: 'slots' }
const iso = (d: Date) => d.toISOString().slice(0, 16)

describe('decide (simulated approver)', () => {
  it('approves when there is no curfew and no cap', () => {
    expect(decide(NONE, at('2026-11-02T03:00:00Z'), TZ, [])).toEqual({ status: 'approved' })
  })

  describe('curfew', () => {
    // 23:00 to 06:00 local wraps midnight. 23:30 local is 16:30Z.
    const curfew = { ...NONE, curfewStartMin: 23 * 60, curfewEndMin: 6 * 60 }

    it('approves a departure outside the curfew, and at its end', () => {
      expect(decide(curfew, at('2026-11-02T03:00:00Z'), TZ, []).status).toBe('approved') // 10:00 local
      expect(decide(curfew, at('2026-11-02T23:00:00Z'), TZ, []).status).toBe('approved') // 06:00 local, the end is not in the curfew
    })

    it('offers the next three free times as slots, 15 minutes apart', () => {
      const d = decide(curfew, at('2026-11-02T16:30:00Z'), TZ, [])
      expect(d).toMatchObject({ status: 'alternative_offered', note: expect.stringContaining('curfew 23:00-06:00') })
      if (d.status !== 'alternative_offered') throw new Error('expected an offer')
      expect(d.offers.map((o) => [iso(o.starts_at), o.ends_at])).toEqual([
        ['2026-11-02T23:00', undefined], // 06:00 local
        ['2026-11-02T23:15', undefined],
        ['2026-11-02T23:30', undefined],
      ])
    })

    it('offers one window of up to four hours when the policy says window', () => {
      const d = decide({ ...curfew, offerStyle: 'window' }, at('2026-11-02T16:30:00Z'), TZ, [])
      if (d.status !== 'alternative_offered') throw new Error('expected an offer')
      expect(d.offers).toHaveLength(1)
      expect([iso(d.offers[0].starts_at), iso(d.offers[0].ends_at as Date)]).toEqual(['2026-11-02T23:00', '2026-11-03T02:45'])
    })
  })

  describe('hourly cap', () => {
    const capped = { ...NONE, maxPerHour: 2 }
    // 10:10 local is 03:10Z; two other departures already leave in the 10:00 local hour.
    const others = [at('2026-11-02T03:00:00Z'), at('2026-11-02T03:20:00Z')]

    it('approves while the hour has room', () => {
      expect(decide(capped, at('2026-11-02T03:10:00Z'), TZ, [others[0]]).status).toBe('approved')
    })

    it('offers the first hour that has room once the hour is full', () => {
      const d = decide(capped, at('2026-11-02T03:10:00Z'), TZ, others)
      if (d.status !== 'alternative_offered') throw new Error('expected an offer')
      expect(d.note).toContain('already has 2 departures')
      expect(iso(d.offers[0].starts_at)).toBe('2026-11-02T04:00') // 11:00 local
    })
  })

  it('rejects as no_slot_available when no time in the next 24 hours is free', () => {
    const allDay = { ...NONE, curfewStartMin: 0, curfewEndMin: 23 * 60 + 59 }
    expect(decide(allDay, at('2026-11-02T05:00:00Z'), TZ, [])).toMatchObject({ status: 'rejected', reason: 'no_slot_available' })
  })
})
