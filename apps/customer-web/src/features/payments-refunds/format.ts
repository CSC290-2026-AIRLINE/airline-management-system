const money = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** `45.00`. */
export function formatAmount(amount: number): string {
  return money.format(amount)
}

/** `45.00 USD`. */
export function formatMoney(amount: number, currency = 'USD'): string {
  return `${money.format(amount)} ${currency}`
}

/** `11 Nov 2026`. */
export function formatDate(iso: string): string {
  return date.format(new Date(iso))
}
