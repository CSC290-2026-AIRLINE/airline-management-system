import { isoDate, localDay, localTime, shortName } from './crew-format'

describe('crew format helpers', () => {
  it('prints a person as first initial and last name', () => {
    expect(shortName({ first_name: 'Pim', last_name: 'Thongdee' })).toBe('P. Thongdee')
  })

  it('cuts a date at UTC for isoDate and at the zone for localDay', () => {
    const instant = new Date('2026-09-17T20:30:00Z')

    expect(isoDate(instant)).toBe('2026-09-17')
    expect(localDay(instant, 'Asia/Bangkok')).toBe('2026-09-18')
  })

  it('prints the wall clock of the zone it is asked about, not UTC', () => {
    expect(localTime(new Date('2026-09-17T01:00:00Z'), 'Asia/Bangkok')).toBe('08:00')
    expect(localTime(new Date('2026-09-17T08:00:00Z'), 'Asia/Tokyo')).toBe('17:00')
    // Midnight is 00:xx, never 24:xx.
    expect(localTime(new Date('2026-09-16T17:05:00Z'), 'Asia/Bangkok')).toBe('00:05')
  })
})
