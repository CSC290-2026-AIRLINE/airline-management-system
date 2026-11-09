import type { Cabin } from '../api/types'

const CABIN_LABELS: Record<Cabin, string> = {
  economy: 'Economy',
  premium_economy: 'Premium economy',
  business: 'Business',
  first: 'First',
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' }).format(amount)
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatCabin(cabin: Cabin): string {
  return CABIN_LABELS[cabin]
}
