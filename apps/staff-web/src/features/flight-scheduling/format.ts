export const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1)

const serviceDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
// "Sun 4 Oct" from a YYYY-MM-DD service date, which is a calendar day with no time zone.
export const formatServiceDate = (date: string) => serviceDay.format(new Date(`${date}T00:00:00Z`))

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
