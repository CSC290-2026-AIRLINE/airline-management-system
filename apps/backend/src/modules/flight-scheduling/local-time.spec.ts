import { formatLocal, localToUtc } from './local-time'

describe('localToUtc', () => {
  it('converts a normal local time', () => {
    expect(localToUtc('2026-11-02', '10:00', 'Asia/Bangkok')).toEqual({ utc: new Date('2026-11-02T03:00:00Z'), shifted: false })
  })

  it('handles zones ahead of UTC across the date line of UTC', () => {
    expect(localToUtc('2026-11-02', '00:30', 'Asia/Tokyo').utc).toEqual(new Date('2026-11-01T15:30:00Z'))
  })

  it('shifts a time inside the spring-forward gap by the gap length (New York, 8 March 2026)', () => {
    expect(localToUtc('2026-03-08', '02:30', 'America/New_York')).toEqual({ utc: new Date('2026-03-08T07:30:00Z'), shifted: true })
  })

  it('uses the first occurrence of a repeated hour (New York, 1 November 2026)', () => {
    expect(localToUtc('2026-11-01', '01:30', 'America/New_York')).toEqual({ utc: new Date('2026-11-01T05:30:00Z'), shifted: false })
  })

  it('handles the southern hemisphere gap (Sydney, 4 October 2026)', () => {
    expect(localToUtc('2026-10-04', '02:30', 'Australia/Sydney')).toEqual({ utc: new Date('2026-10-03T16:30:00Z'), shifted: true })
  })

  it('leaves times on either side of a transition untouched', () => {
    expect(localToUtc('2026-03-08', '01:59', 'America/New_York').shifted).toBe(false)
    expect(localToUtc('2026-03-08', '03:00', 'America/New_York')).toEqual({ utc: new Date('2026-03-08T07:00:00Z'), shifted: false })
  })
})

describe('formatLocal', () => {
  it('formats in the target zone and keeps midnight as 00', () => {
    expect(formatLocal(new Date('2026-11-02T03:00:00Z'), 'Asia/Bangkok')).toBe('2026-11-02T10:00')
    expect(formatLocal(new Date('2026-11-01T17:00:00Z'), 'Asia/Bangkok')).toBe('2026-11-02T00:00')
  })
})
