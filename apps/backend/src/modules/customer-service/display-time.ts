/**
 * Times in Feature 13's labels are shown in the airline's home time zone, so a case opened at 14:11 in Bangkok reads
 * 14:11, not the 07:11 it is stored as. Flight service dates are calendar dates and are not converted.
 */
export const DISPLAY_TIME_ZONE = 'Asia/Bangkok'

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: DISPLAY_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function parts(d: Date): Record<'weekday' | 'day' | 'month' | 'hour' | 'minute', string> {
  const out = { weekday: '', day: '', month: '', hour: '', minute: '' }
  for (const p of PARTS.formatToParts(d)) {
    if (p.type in out) out[p.type as keyof typeof out] = p.value
  }
  return out
}

/** `12 Nov 14:11`. */
export function shortDateTime(d: Date): string {
  const p = parts(d)
  return `${p.day} ${p.month} ${p.hour}:${p.minute}`
}

/** `14:11`. */
export function clockTime(d: Date): string {
  const p = parts(d)
  return `${p.hour}:${p.minute}`
}

/** `12 Nov`. */
export function dayMonth(d: Date): string {
  const p = parts(d)
  return `${p.day} ${p.month}`
}
