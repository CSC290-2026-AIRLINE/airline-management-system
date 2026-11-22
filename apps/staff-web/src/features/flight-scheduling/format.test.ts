import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { capitalize, clockOf, formatDateTime, formatServiceDate, localParts, localToIso, minutesOf } from './format.ts'

describe('format', () => {
  it('capitalizes the first letter only', () => {
    assert.equal(capitalize('scheduled'), 'Scheduled')
    assert.equal(capitalize('in flight'), 'In flight')
  })

  describe('formatServiceDate', () => {
    it('writes a calendar date as weekday, day and month', () => {
      assert.equal(formatServiceDate('2026-11-10'), 'Tue 10 Nov')
    })

    it('reads only the date of the "2026-11-10T00:00:00.000Z" the API sends, so it never shows Invalid Date', () => {
      assert.equal(formatServiceDate('2026-11-10T00:00:00.000Z'), 'Tue 10 Nov')
    })

    it('does not move the day with the viewer’s time zone', () => {
      assert.equal(formatServiceDate('2026-11-10T00:00:00.000Z'), formatServiceDate('2026-11-10'))
    })
  })

  describe('formatDateTime', () => {
    it('writes an instant in the given time zone', () => {
      assert.equal(formatDateTime('2026-11-10T03:00:00Z', 'Asia/Bangkok'), 'Tue 10 Nov 10:00')
      assert.equal(formatDateTime('2026-11-10T03:00:00Z', 'UTC'), 'Tue 10 Nov 03:00')
    })

    it('lands on the next day when the zone is ahead of UTC', () => {
      assert.equal(formatDateTime('2026-11-10T20:00:00Z', 'Asia/Bangkok'), 'Wed 11 Nov 03:00')
    })
  })

  describe('minutesOf and clockOf', () => {
    it('turn HH:MM into minutes since midnight and back', () => {
      assert.equal(minutesOf('00:00'), 0)
      assert.equal(minutesOf('10:30'), 630)
      assert.equal(clockOf(630), '10:30')
      assert.equal(clockOf(5), '00:05')
    })

    it('wraps past midnight', () => {
      assert.equal(clockOf(minutesOf('23:30') + 75), '00:45')
    })
  })

  describe('localParts', () => {
    it('gives the local date and time of an instant', () => {
      assert.deepEqual(localParts('2026-11-10T03:00:00Z', 'Asia/Bangkok'), {
        date: '2026-11-10',
        time: '10:00',
      })
    })

    it('moves to the next local date when the zone is ahead of UTC', () => {
      assert.deepEqual(localParts('2026-11-10T20:00:00Z', 'Asia/Bangkok'), {
        date: '2026-11-11',
        time: '03:00',
      })
    })

    it('writes midnight as 00:00, not 24:00', () => {
      assert.deepEqual(localParts('2026-11-10T17:00:00Z', 'Asia/Bangkok'), {
        date: '2026-11-11',
        time: '00:00',
      })
    })

    it('can go back a day when the zone is behind UTC', () => {
      assert.deepEqual(localParts('2026-11-10T03:00:00Z', 'America/New_York'), {
        date: '2026-11-09',
        time: '22:00',
      })
    })
  })

  describe('localToIso', () => {
    it('turns a local time into a UTC instant', () => {
      assert.equal(localToIso('2026-11-10', '10:00', 'Asia/Bangkok'), '2026-11-10T03:00:00.000Z')
      assert.equal(localToIso('2026-11-10', '03:00', 'UTC'), '2026-11-10T03:00:00.000Z')
    })

    it('crosses the UTC date when the local time is early in the day', () => {
      assert.equal(localToIso('2026-11-11', '05:15', 'Asia/Bangkok'), '2026-11-10T22:15:00.000Z')
    })

    it('uses the zone’s offset at that date (New York, before and after the November change and in summer)', () => {
      assert.equal(localToIso('2026-11-10', '09:00', 'America/New_York'), '2026-11-10T14:00:00.000Z')
      assert.equal(localToIso('2026-10-20', '09:00', 'America/New_York'), '2026-10-20T13:00:00.000Z')
      assert.equal(localToIso('2026-07-10', '09:00', 'America/New_York'), '2026-07-10T13:00:00.000Z')
    })

    it('is the inverse of localParts', () => {
      for (const zone of ['Asia/Bangkok', 'UTC', 'America/New_York', 'Europe/London']) {
        for (const iso of [
          '2026-01-15T00:00:00.000Z',
          '2026-03-29T01:30:00.000Z',
          '2026-07-01T12:45:00.000Z',
          '2026-11-10T23:59:00.000Z',
        ]) {
          const { date, time } = localParts(iso, zone)
          assert.equal(localToIso(date, time, zone), iso, `${iso} in ${zone}`)
        }
      }
    })
  })
})
