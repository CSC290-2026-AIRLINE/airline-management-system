import type { BiGroup, BiRun } from './api/bi'

/** Every rate shows one decimal (6.0%, not 6%), so rates on the same page line up. */
const percent = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
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

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** A short figure for chart labels and KPI cards: 2.3K, 722K, 1.2M. The one short style on every BI page. */
export function formatCompact(value: number): string {
  return compact.format(value)
}

export function formatThb(value: number | null, short = false): string {
  if (value === null) return '—'
  return `฿${short ? compact.format(value) : wholeNumber.format(value)}`
}

const day = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
const dayNoYear = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

/** en-GB writes September as "Sept"; every other month is three letters, so use "Sep". */
function shortMonth(text: string): string {
  return text.replace('Sept', 'Sep')
}

/** A calendar date (`2026-10-01`) as "01 Oct 2026", the style of the date filters. */
export function formatDate(iso: string): string {
  return shortMonth(day.format(new Date(`${iso}T00:00:00Z`)))
}

/** A date range as "01 Oct – 05 Nov 2026" (the year once when both ends share it). */
export function formatDateRange(from: string, to: string): string {
  if (!from && !to) return 'All dates'
  if (!from) return `Until ${formatDate(to)}`
  if (!to) return `From ${formatDate(from)}`
  if (from === to) return formatDate(from)
  const start = from.slice(0, 4) === to.slice(0, 4) ? shortMonth(dayNoYear.format(new Date(`${from}T00:00:00Z`))) : formatDate(from)
  return `${start} – ${formatDate(to)}`
}

/** A chart period label: "5 Oct" for a day or a week start, "Oct 2026" for a month. */
export function periodLabel(period: string, group: BiGroup): string {
  const date = new Date(`${period}T00:00:00Z`)
  return shortMonth(group === 'month' ? monthYear.format(date) : dayMonth.format(date))
}

/** The status pill text for the pages that read the BI copy. */
export function dataAsOf(latest: BiRun | null): string {
  return latest ? `Data as of ${formatDateTime(latest.data_as_of)}` : 'No data refreshed yet'
}
