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

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value).toLowerCase()
}

export function formatThb(value: number | null, compact = false): string {
  if (value === null) return '—'
  return `฿${compact ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value) : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)}`
}
