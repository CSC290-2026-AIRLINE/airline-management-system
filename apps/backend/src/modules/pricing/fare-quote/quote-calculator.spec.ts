import type { AppliedRule } from '../pricing-rule/pricing-rule.engine'
import { buildQuoteLines, feeCents, type QuotePromo, type QuoteTax } from './quote-calculator'

const rule = (id: string, group: AppliedRule['rule_group'], name: string, pct: number, before: number, after: number): AppliedRule => ({
  rule_id: id,
  rule_group: group,
  name,
  adjustment_pct: pct,
  amount_before: before,
  amount_after: after,
})

const H7 = rule('r1', 'urgency', 'H-7', 10, 100, 110)
const ALMOST_FULL = rule('r2', 'load', 'Almost full', 15, 110, 126.5)
const SAVE10: QuotePromo = { id: 'p1', code: 'SAVE10', discount_pct: 10, discount_amount: null }
const VAT: QuoteTax = { id: 't1', name: 'VAT', kind: 'tax', calc_type: 'pct', value: 7 }
const AIRPORT: QuoteTax = { id: 't2', name: 'Airport fee', kind: 'fee', calc_type: 'flat', value: 7 }

const amounts = (lines: { amountCents: number }[]) => lines.map((line) => line.amountCents)

describe('buildQuoteLines', () => {
  it('gives the worked example line by line: 100.00 → 110.00 → 126.50 → 113.85 → 121.82', () => {
    const { lines, totalCents } = buildQuoteLines({ baseCents: 10000, rules: [H7, ALMOST_FULL], promo: SAVE10, taxes: [VAT] })

    expect(lines).toEqual([
      { kind: 'base', label: 'Base fare', ratePct: null, amountCents: 10000, sourceId: null },
      { kind: 'rule', label: 'H-7 (urgency)', ratePct: 10, amountCents: 1000, sourceId: 'r1' },
      { kind: 'rule', label: 'Almost full (load)', ratePct: 15, amountCents: 1650, sourceId: 'r2' },
      { kind: 'promo', label: 'Promo SAVE10', ratePct: 10, amountCents: -1265, sourceId: 'p1' },
      { kind: 'tax', label: 'VAT', ratePct: 7, amountCents: 797, sourceId: 't1' }, // 7% of 113.85 = 7.9695, rounded up
    ])
    expect(totalCents).toBe(12182)
  })

  it("gives the guide's full example: 4,643.49", () => {
    const { totalCents } = buildQuoteLines({
      baseCents: 300000,
      rules: [rule('r1', 'urgency', 'Urgency', 10, 3000, 3300), rule('r2', 'load', 'Load', 15, 3300, 3795)],
      seatFee: { label: 'Exit row', cents: 30000 },
      promo: SAVE10,
      taxes: [VAT, { id: 't2', name: 'Airport fee', kind: 'fee', calc_type: 'flat', value: 700 }],
    })

    expect(totalCents).toBe(464349)
  })

  it('takes the promo on fare plus seat fee', () => {
    const { lines } = buildQuoteLines({
      baseCents: 10000,
      rules: [],
      seatFee: { label: 'Exit row', cents: 2000 },
      promo: SAVE10,
      taxes: [],
    })

    expect(lines.find((line) => line.kind === 'promo')?.amountCents).toBe(-1200)
  })

  it('takes every percentage tax on the same discounted subtotal, so they do not compound', () => {
    const { lines } = buildQuoteLines({
      baseCents: 10000,
      rules: [],
      promo: SAVE10,
      taxes: [VAT, { id: 't3', name: 'Second tax', kind: 'tax', calc_type: 'pct', value: 10 }],
    })

    expect(amounts(lines)).toEqual([10000, -1000, 630, 900]) // both on 90.00
  })

  it('caps a fixed promo at the subtotal, leaving taxes on zero and flat fees as they are', () => {
    const { lines, totalCents } = buildQuoteLines({
      baseCents: 10000,
      rules: [],
      promo: { id: 'p2', code: 'BIG', discount_pct: null, discount_amount: 500 },
      taxes: [VAT, AIRPORT],
    })

    expect(amounts(lines)).toEqual([10000, -10000, 0, 700])
    expect(totalCents).toBe(700)
  })

  it('stores no rate on a fixed promo or a flat tax', () => {
    const { lines } = buildQuoteLines({
      baseCents: 10000,
      rules: [],
      promo: { id: 'p2', code: 'FLAT', discount_pct: null, discount_amount: 5 },
      taxes: [AIRPORT],
    })

    expect(lines.filter((line) => line.kind !== 'base').map((line) => line.ratePct)).toEqual([null, null])
  })

  it('rounds half up on each line', () => {
    // 15% of 0.70 is exactly 0.105; floats would make this 0.10
    const { lines } = buildQuoteLines({ baseCents: 70, rules: [], promo: { ...SAVE10, discount_pct: 15 }, taxes: [] })

    expect(lines[1].amountCents).toBe(-11)
  })

  it('never writes a negative zero', () => {
    const { lines } = buildQuoteLines({ baseCents: 0, rules: [], promo: SAVE10, taxes: [] })

    expect(Object.is(lines[1].amountCents, 0)).toBe(true)
  })

  it('keeps a free seat as a line, and a discount rule as a negative line', () => {
    const { lines } = buildQuoteLines({
      baseCents: 10000,
      rules: [rule('r3', 'urgency', 'Early bird', -10, 100, 90)],
      seatFee: { label: 'Normal seat', cents: 0 },
      taxes: [],
    })

    expect(amounts(lines)).toEqual([10000, -1000, 0])
  })

  it('copies the kind of each tax row onto its line', () => {
    const { lines } = buildQuoteLines({
      baseCents: 100,
      rules: [],
      taxes: [{ id: 't4', name: 'Fuel', kind: 'surcharge', calc_type: 'flat', value: 1 }, AIRPORT, VAT],
    })

    expect(lines.slice(1).map((line) => line.kind)).toEqual(['surcharge', 'fee', 'tax'])
  })
})

describe('feeCents', () => {
  it('adds the flat fee and the percentage of the total', () => {
    expect(feeCents(12182, 20, 10)).toBe(3218) // 20.00 + 12.18
  })

  it('caps the fee at the total', () => {
    expect(feeCents(1000, 20, 10)).toBe(1000)
  })

  it('is zero with no fee set', () => {
    expect(feeCents(1000, 0, 0)).toBe(0)
  })
})
