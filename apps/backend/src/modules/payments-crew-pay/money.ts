/**
 * Money helpers. Every amount is NUMERIC(12,2) in the base currency, and all arithmetic here is on whole cents so that
 * 0.1 + 0.2 never shows up on a receipt. Prisma hands NUMERIC columns over as Decimal objects (or strings in JSON);
 * `toCents` accepts either.
 */
export type DecimalLike = { toString(): string } | string | number

export function toCents(value: DecimalLike | null | undefined): number {
  if (value === null || value === undefined) return 0
  const text = typeof value === 'number' ? value.toFixed(2) : value.toString()
  const [whole, fraction = ''] = text.trim().split('.')
  const negative = whole.startsWith('-')
  const cents = Math.abs(Number(whole)) * 100 + Number((fraction + '00').slice(0, 2))
  return negative ? -cents : cents
}

/** Cents back to the "12.34" string Prisma accepts for a Decimal column and the API returns. */
export function fromCents(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(Math.round(cents))
  return `${negative ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** Digits after the decimal point that each currency uses at Stripe. Anything not listed uses 2. */
const CURRENCY_EXPONENT: Record<string, number> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  MGA: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
}

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENT[currency.toUpperCase()] ?? 2
}

/**
 * The provider's integer amount for an amount in cents, by the currency's exponent (USD 2, JPY 0), never a fixed ×100.
 * Only the Stripe provider calls this.
 */
export function toMinorUnits(cents: number, currency: string): number {
  const exponent = currencyExponent(currency)
  if (exponent === 2) return cents
  if (exponent > 2) return cents * 10 ** (exponent - 2)
  return Math.round(cents / 10 ** (2 - exponent))
}

export function fromMinorUnits(minor: number, currency: string): number {
  const exponent = currencyExponent(currency)
  if (exponent === 2) return minor
  if (exponent > 2) return Math.round(minor / 10 ** (exponent - 2))
  return minor * 10 ** (2 - exponent)
}

/**
 * Splits a refund between the voucher and the card in proportion to how the payment was paid. The voucher share is
 * rounded down, so any rounding remainder goes to the card.
 */
export function splitProRata(refundCents: number, voucherCents: number, totalCents: number): { voucher: number; card: number } {
  if (totalCents <= 0 || voucherCents <= 0) return { voucher: 0, card: refundCents }
  const voucher = Math.floor((refundCents * voucherCents) / totalCents)
  return { voucher, card: refundCents - voucher }
}

/**
 * Spreads `amountCents` over lines in order, never above each line's room. Returns null when the lines cannot hold it.
 */
export function allocate<T extends { room: number }>(lines: T[], amountCents: number): { line: T; amount: number }[] | null {
  let left = amountCents
  const out: { line: T; amount: number }[] = []
  for (const line of lines) {
    if (left <= 0) break
    const take = Math.min(line.room, left)
    if (take > 0) {
      out.push({ line, amount: take })
      left -= take
    }
  }
  return left > 0 ? null : out
}
