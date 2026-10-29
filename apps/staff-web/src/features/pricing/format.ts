import type { Cabin } from './api'

export function formatMoney(amount: string | number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount))
}

export function cabinLabel(cabin: Cabin): string {
  switch (cabin) {
    case 'economy':
      return 'Economy'
    case 'premium_economy':
      return 'Premium economy'
    case 'business':
      return 'Business'
    case 'first':
      return 'First'
    default: {
      const unknown: never = cabin
      return unknown
    }
  }
}

export function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No'
}
