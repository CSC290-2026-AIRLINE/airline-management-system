export const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1)

const serviceDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
// "Sun 4 Oct" from a service date, which is a calendar day with no time zone. The API sends it as "2026-11-10T00:00:00.000Z", so only the
// first ten characters count.
export const formatServiceDate = (date: string) => serviceDay.format(new Date(`${date.slice(0, 10)}T00:00:00Z`))

const localDateTime = (timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  })
// "Fri 2 Oct 09:30" in the given IANA time zone.
export const formatDateTime = (iso: string, timeZone: string) => localDateTime(timeZone).format(new Date(iso)).replace(',', '')

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Clock times as minutes since midnight and back, for HH:MM strings.
export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
export const clockOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

// The calendar date (YYYY-MM-DD) and clock time (HH:MM) of an instant in an IANA time zone.
export function localParts(iso: string, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

// A local date (YYYY-MM-DD) and time (HH:MM) in an IANA time zone as a UTC instant, "2026-11-10T03:00:00.000Z".
// ponytail: a local time that does not exist (a DST gap) or happens twice is not special-cased; the airports we fly to have no DST.
export function localToIso(date: string, time: string, timeZone: string) {
  const wall = Date.parse(`${date}T${time}:00Z`)
  const offset = (utc: number) => {
    const p = localParts(new Date(utc).toISOString(), timeZone)
    return Date.parse(`${p.date}T${p.time}:00Z`) - utc
  }
  return new Date(wall - offset(wall - offset(wall))).toISOString()
}
