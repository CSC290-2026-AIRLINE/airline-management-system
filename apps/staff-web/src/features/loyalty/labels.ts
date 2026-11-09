import type { CabinCode, FlightStatus, Insurance, TierBenefits, TierRule, TransactionType } from './api/types'

// Wording shared by the Feature 11 staff pages.

export const TYPE_LABEL: Record<TransactionType, string> = {
  earn: 'Earned',
  redeem: 'Spent',
  redeem_reversal: 'Returned',
  expire: 'Expired',
  adjust: 'Adjusted',
}

export const CABINS: { code: CabinCode; name: string }[] = [
  { code: 'economy', name: 'Economy' },
  { code: 'premium_economy', name: 'Premium Economy' },
  { code: 'business', name: 'Business' },
  { code: 'first', name: 'First' },
]

export const STATUS_LABEL: Record<FlightStatus, string> = {
  scheduled: 'Scheduled',
  delayed: 'Delayed',
  cancelled: 'Cancelled',
  departed: 'Departed',
}

export function loungeLabel(guests: number | null) {
  if (guests === null) return 'No access'
  if (guests === 0) return 'Member only'
  return `Member + ${guests} guest${guests === 1 ? '' : 's'}`
}

export function insuranceLabel(insurance: Insurance) {
  switch (insurance.kind) {
    case 'none':
      return 'Not offered'
    case 'included':
      return 'Included'
    case 'member_price':
      return `THB ${insurance.priceThb} member price`
    default: {
      const unreachable: never = insurance
      return unreachable
    }
  }
}

// Upgrades go to higher tiers first, so each tier waits for the one above it that also gets upgrades.
export function upgradeLabel(code: TierRule['code'], tiers: TierRule[], benefits: Record<TierRule['code'], TierBenefits>) {
  const rank = tiers.find((t) => t.code === code)?.rank ?? 0
  if (!benefits[code].complimentaryUpgrade) return 'No'
  const above = tiers.filter((t) => t.rank > rank && benefits[t.code].complimentaryUpgrade).sort((a, b) => a.rank - b.rank)[0]
  return above ? `Yes, after ${above.name}` : 'Yes, first'
}

export const yesNo = (value: boolean) => (value ? 'Yes' : 'No')
