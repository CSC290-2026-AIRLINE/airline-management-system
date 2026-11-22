import type { Insurance } from './types'

// Travel insurance rules (F11 doc, Tier benefits → Travel insurance). Pure, so the price rule is tested without a database.

export interface PaidInsurance {
  amount: number // the captured 'insurance' payment line (feature 5a)
  currency: string
}

export type PolicyTerms = { price: number; currency: string; source: 'included' | 'paid' } | null

/**
 * What a confirmed booking's policy costs, or null when it gets none:
 *   - the booker's tier includes insurance → price 0, in the base currency;
 *   - otherwise a captured insurance line (a Silver member who added it at the member price) → that amount, even if the
 *     tier lapsed between checkout and confirmation: the customer paid for cover, so they get it;
 *   - otherwise no policy.
 */
export function policyTerms(tierInsurance: Insurance | null, paid: PaidInsurance | null, baseCurrency: string): PolicyTerms {
  if (tierInsurance?.kind === 'included') return { price: 0, currency: baseCurrency, source: 'included' }
  if (paid && paid.amount > 0) return { price: paid.amount, currency: paid.currency, source: 'paid' }
  return null
}
