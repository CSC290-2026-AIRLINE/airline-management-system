// TODO: read the simulation clock once Platform has an API for it. Until then this is the real time. Everything in
// quotes goes through this one function, so that change stays in one place.
export function simNow(): Date {
  return new Date()
}

// The calendar date of a moment in a timezone, as YYYY-MM-DD ('en-CA' writes dates in that order).
export function localDate(moment: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment)
}

// Whole calendar days between two YYYY-MM-DD dates, not hours ÷ 24: 23:30 to 00:30 the next day counts as one.
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}
