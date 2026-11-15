const money = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** `45.00`: the number alone, for a sentence that already says the currency or is in it. */
export function formatAmount(amount: number): string {
  return money.format(amount)
}

/** `45.00 USD`. */
export function formatMoney(amount: number, currency = 'USD'): string {
  return `${money.format(amount)} ${currency}`
}

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}
