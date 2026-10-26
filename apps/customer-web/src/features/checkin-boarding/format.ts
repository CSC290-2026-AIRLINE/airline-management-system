// Every time is shown in Bangkok local time, the airline's base.
const BANGKOK = 'Asia/Bangkok'

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: BANGKOK })
const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: BANGKOK,
})
const day = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: BANGKOK })
const baht = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatTime(iso: string): string {
  return time.format(new Date(iso))
}

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

export function formatDay(value: string): string {
  return day.format(new Date(value))
}

export function formatBaht(amount: number): string {
  return baht.format(amount)
}
