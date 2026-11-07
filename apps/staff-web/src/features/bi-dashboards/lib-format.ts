const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })
const count = new Intl.NumberFormat('en-US')
const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export function formatPercent(value: number | null): string {
  return value === null ? '—' : percent.format(value)
}

export function formatCount(value: number): string {
  return count.format(value)
}

export function formatMoney(value: number | null): string {
  return value === null ? '—' : money.format(value)
}

export function formatDateTime(iso: string | null): string {
  return iso === null ? '—' : dateTime.format(new Date(iso))
}
