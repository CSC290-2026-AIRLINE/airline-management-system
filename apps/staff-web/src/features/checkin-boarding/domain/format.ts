// Display helpers for the staff screens. Every time is shown in Bangkok local time, the airline's base.
const BANGKOK = 'Asia/Bangkok'

const baht = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: BANGKOK })
const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: BANGKOK })
const clock = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: BANGKOK,
})

export function formatBaht(amount: number): string {
  return baht.format(amount)
}

/** 'premium_economy' reads as 'Premium economy' on the staff screens. */
export function formatCabin(cabin: string): string {
  const text = cabin.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatTime(iso: string): string {
  return time.format(new Date(iso))
}

export function formatDate(iso: string): string {
  return date.format(new Date(iso))
}

/** The simulation clock in the staff sidebar: "Mon 12 Oct 2026, 09:52", Bangkok time. */
export function formatClock(when: Date): string {
  const part = (type: string) => clock.formatToParts(when).find((p) => p.type === type)?.value ?? ''
  return `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}, ${part('hour')}:${part('minute')}`
}
