// Time zone maths on the built-in Intl, so no date library is needed.
const DAY_MS = 24 * 60 * 60 * 1000

const formatters = new Map<string, Intl.DateTimeFormat>()
const formatter = (timeZone: string) => {
  let f = formatters.get(timeZone)
  if (!f) {
    // h23 keeps midnight as 00 instead of 24.
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, f)
  }
  return f
}

const localParts = (utcMs: number, timeZone: string) => {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  )
  return { y: +parts.year, mo: +parts.month, d: +parts.day, h: +parts.hour, mi: +parts.minute, s: +parts.second }
}

// Minutes to add to UTC to get local time in `timeZone` at that instant.
export function offsetMinutes(timeZone: string, utcMs: number): number {
  const { y, mo, d, h, mi, s } = localParts(utcMs, timeZone)
  return (Date.UTC(y, mo - 1, d, h, mi, s) - Math.floor(utcMs / 1000) * 1000) / 60000
}

// Local wall-clock time (YYYY-MM-DD + HH:MM) in `timeZone` to a UTC instant.
// DST gap (the local time does not exist): shifted forward by the gap, `shifted` is true.
// DST overlap (the local time happens twice): the first occurrence is used.
export function localToUtc(date: string, time: string, timeZone: string): { utc: Date; shifted: boolean } {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)

  // The offsets a day either side bracket any transition near the requested time.
  const before = offsetMinutes(timeZone, guess - DAY_MS)
  const after = offsetMinutes(timeZone, guess + DAY_MS)
  const valid = [before, after].filter((offset) => offsetMinutes(timeZone, guess - offset * 60000) === offset)

  if (valid.length === 0) return { utc: new Date(guess - before * 60000), shifted: true }
  // The largest offset gives the earliest instant, which is the first occurrence in an overlap.
  return { utc: new Date(guess - Math.max(...valid) * 60000), shifted: false }
}

// UTC instant to local 'YYYY-MM-DDTHH:mm' in `timeZone`.
export function formatLocal(utc: Date, timeZone: string): string {
  const { y, mo, d, h, mi } = localParts(utc.getTime(), timeZone)
  const p = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${p(y, 4)}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}`
}
