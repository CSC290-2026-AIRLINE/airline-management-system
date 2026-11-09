// Pure pricing and order-window rules for the customer checkout.
//
// These live outside the services on purpose: the same rules decide
// what the catalogue shows, what the checkout charges, and what the
// catering order counts, and they must not drift apart. Keeping them
// as plain functions means the rules can be unit-tested without a
// database (see order-pricing.spec.ts).
//
// The rules come from the Iteration-02 doc:
//   - a line records why its price is what it is (price_basis):
//     'standard', 'tier_benefit' or 'included';
//   - the two free benefits never stack on one line, so a line has
//     exactly one basis;
//   - premium meals are always charged, even for a tier holder;
//   - snacks, drinks and duty-free are always charged;
//   - a complimentary cabin includes one meal per passenger, so a meal
//     line on such a cabin costs 0;
//   - expires_at is the earlier of (created + payment hold) and the
//     cutoff, and the cutoff is the scheduled departure minus the
//     cabin's order window.

import type { F12MealService, F12ProductCategory } from './mapping'

export type F12PriceBasis = 'standard' | 'tier_benefit' | 'included'

export interface OrderLineInput {
  productId: string
  category: F12ProductCategory
  quantity: number
  priceAmount: number
  isPremium: boolean
}

export interface PricingContext {
  mealService: F12MealService
  includedPerPassenger: number
  hasTier: boolean
}

export interface PricedLine {
  productId: string
  category: F12ProductCategory
  quantity: number
  unitPriceAmount: number
  priceBasis: F12PriceBasis
  lineTotal: number
}

export interface PricedOrder {
  lines: PricedLine[]
  totalAmount: number
}

// Money is carried as a number on the wire and rounded to cents, so a
// repeated multiplication cannot produce a third decimal.
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

// Price one line and say why. The tier benefit wins over the
// complimentary allowance because it is the customer-specific one,
// and a premium meal is never free.
export function priceLine(line: OrderLineInput, ctx: PricingContext): PricedLine {
  const basis = priceBasisFor(line, ctx)
  const unitPriceAmount = basis === 'standard' ? roundMoney(line.priceAmount) : 0
  return {
    productId: line.productId,
    category: line.category,
    quantity: line.quantity,
    unitPriceAmount,
    priceBasis: basis,
    lineTotal: roundMoney(unitPriceAmount * line.quantity),
  }
}

export function priceBasisFor(line: OrderLineInput, ctx: PricingContext): F12PriceBasis {
  if (line.category !== 'meal') return 'standard'
  if (line.isPremium) return 'standard'
  if (ctx.hasTier) return 'tier_benefit'
  if (ctx.mealService === 'complimentary' && ctx.includedPerPassenger > 0) return 'included'
  return 'standard'
}

// Price a whole order. The total is the sum of the line totals, so it
// cannot disagree with the lines it was built from.
export function priceOrder(lines: OrderLineInput[], ctx: PricingContext): PricedOrder {
  const priced = lines.map((line) => priceLine(line, ctx))
  const totalAmount = roundMoney(priced.reduce((sum, line) => sum + line.lineTotal, 0))
  return { lines: priced, totalAmount }
}

// The cutoff is the scheduled departure minus the cabin's order
// window. It uses the scheduled departure, so a delay cannot reopen
// ordering.
export function cutoffAt(scheduledDeparture: Date, orderWindowHours: number): Date {
  return new Date(scheduledDeparture.getTime() - orderWindowHours * 60 * 60 * 1000)
}

// An unpaid order holds its stock until the earlier of its payment
// hold and the cutoff.
export function orderExpiresAt(createdAt: Date, paymentHoldMinutes: number, cutoff: Date): Date {
  const hold = new Date(createdAt.getTime() + paymentHoldMinutes * 60 * 1000)
  return hold.getTime() < cutoff.getTime() ? hold : cutoff
}

// Ordering is open until the cutoff. The job that generates the
// catering order runs at the same moment, so "now < cutoff" means
// ordering is still open.
export function isOrderWindowOpen(now: Date, cutoff: Date): boolean {
  return now.getTime() < cutoff.getTime()
}
