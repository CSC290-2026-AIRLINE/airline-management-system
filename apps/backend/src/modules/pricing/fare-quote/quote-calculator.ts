import { percentOfCents, type AppliedRule } from '../pricing-rule/pricing-rule.engine'

export type QuoteLineKind = 'base' | 'rule' | 'seat_fee' | 'promo' | 'tax' | 'surcharge' | 'fee'

// One priced step, in integer cents so the lines add up to the total exactly. The lines are the truth: the total is
// their sum, never a separate formula.
export interface QuoteLine {
  kind: QuoteLineKind
  label: string
  ratePct: number | null // set for rule, promo and percentage taxes
  amountCents: number // signed change this line made
  sourceId: string | null // pricing_rule, promo_code or tax_fee id
}

export interface QuoteTax {
  id: string
  name: string
  kind: string // tax, surcharge or fee, as on tax_fee
  calc_type: string // pct or flat
  value: number
}

export interface QuotePromo {
  id: string
  code: string
  discount_pct: number | null
  discount_amount: number | null
}

export interface QuoteInput {
  baseCents: number
  rules: AppliedRule[] // from applyRules, in group order
  seatFee?: { label: string; cents: number }
  promo?: QuotePromo
  taxes: QuoteTax[]
}

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

// Order from the schema review: base, rules, seat fee, promo, then taxes on the discounted subtotal. Each percentage is
// rounded half up on its own line and taxes do not compound: every one is taken on the same discounted subtotal.
export function buildQuoteLines({ baseCents, rules, seatFee, promo, taxes }: QuoteInput): { lines: QuoteLine[]; totalCents: number } {
  const lines: QuoteLine[] = [{ kind: 'base', label: 'Base fare', ratePct: null, amountCents: baseCents, sourceId: null }]

  for (const rule of rules) {
    lines.push({
      kind: 'rule',
      label: `${rule.name} (${rule.rule_group})`,
      ratePct: rule.adjustment_pct,
      amountCents: toCents(rule.amount_after) - toCents(rule.amount_before),
      sourceId: rule.rule_id,
    })
  }

  if (seatFee) {
    lines.push({ kind: 'seat_fee', label: seatFee.label, ratePct: null, amountCents: seatFee.cents, sourceId: null })
  }

  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0)

  let discountedCents = subtotalCents
  if (promo) {
    const offCents =
      promo.discount_pct !== null
        ? percentOfCents(subtotalCents, promo.discount_pct)
        : Math.min(toCents(promo.discount_amount ?? 0), subtotalCents) // a fixed promo never goes below zero
    discountedCents -= offCents
    lines.push({ kind: 'promo', label: `Promo ${promo.code}`, ratePct: promo.discount_pct, amountCents: 0 - offCents, sourceId: promo.id })
  }

  for (const tax of taxes) {
    const isPercent = tax.calc_type === 'pct'
    lines.push({
      kind: tax.kind as QuoteLineKind,
      label: tax.name,
      ratePct: isPercent ? tax.value : null,
      amountCents: isPercent ? percentOfCents(discountedCents, tax.value) : toCents(tax.value),
      sourceId: tax.id,
    })
  }

  return { lines, totalCents: lines.reduce((sum, line) => sum + line.amountCents, 0) }
}

// Fee = flat amount + percentage of the quote total, capped at the total, as the fare class form tells staff.
export function feeCents(totalCents: number, flat: number, pct: number): number {
  return Math.min(toCents(flat) + percentOfCents(totalCents, pct), totalCents)
}
