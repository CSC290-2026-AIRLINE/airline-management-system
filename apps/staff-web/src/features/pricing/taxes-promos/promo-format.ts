import type { PromoCode, PromoKind } from '../api'

export type PromoStatus = 'active' | 'not_started' | 'expired' | 'used_up' | 'inactive'

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const FULL_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const COUNT = new Intl.NumberFormat('en-US')
const AMOUNT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

// valid_to is exclusive in the backend; staff read the last day the code still works.
function lastValidDay(promo: PromoCode): Date {
  return new Date(new Date(promo.valid_to).getTime() - 1)
}

// Same order as checkPromo on the backend. Until the simulation clock has an API, "now" is the real time.
export function promoStatus(promo: PromoCode, now: Date): PromoStatus {
  if (!promo.is_active) return 'inactive'
  if (now < new Date(promo.valid_from)) return 'not_started'
  if (now >= new Date(promo.valid_to)) return 'expired'
  if (promo.max_uses !== null && promo.used_count >= promo.max_uses) return 'used_up'
  return 'active'
}

export function statusLabel(status: PromoStatus): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'not_started':
      return 'Not started'
    case 'expired':
      return 'Expired'
    case 'used_up':
      return 'Used up'
    case 'inactive':
      return 'Inactive'
    default: {
      const unknown: never = status
      return unknown
    }
  }
}

export function kindLabel(kind: PromoKind): string {
  switch (kind) {
    case 'promo':
      return 'Promo'
    case 'corporate':
      return 'Corporate'
    default: {
      const unknown: never = kind
      return unknown
    }
  }
}

// "10%" or "500 USD".
export function discountText(promo: PromoCode, currency: string): string {
  return promo.discount_pct !== null
    ? `${AMOUNT.format(Number(promo.discount_pct))}%`
    : `${AMOUNT.format(Number(promo.discount_amount))} ${currency}`.trim()
}

// "1 Jun – 31 Oct 2026", with both years only when they differ.
export function validText(promo: PromoCode): string {
  const from = new Date(promo.valid_from)
  const to = lastValidDay(promo)
  const start = from.getFullYear() === to.getFullYear() ? DAY_MONTH.format(from) : FULL_DATE.format(from)
  return `${start} – ${FULL_DATE.format(to)}`
}

// "412 / 1,000" or "87 / ∞".
export function usesText(promo: PromoCode): string {
  return `${COUNT.format(promo.used_count)} / ${promo.max_uses === null ? '∞' : COUNT.format(promo.max_uses)}`
}
