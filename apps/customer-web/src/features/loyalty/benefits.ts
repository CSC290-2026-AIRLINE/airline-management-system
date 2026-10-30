import type { Insurance, TierBenefits, TierInfo } from './api/types'

// Wording for tier benefits, shared by the Join, Welcome, Dashboard and Benefits pages.

export const BENEFIT_NAMES = {
  lounge: 'Lounge access',
  baggage: 'Extra free baggage',
  checkIn: 'Priority check-in lane',
  boarding: 'Priority boarding',
  upgrade: 'Complimentary upgrade',
  insurance: 'Travel insurance',
} as const

export type BenefitKey = keyof typeof BENEFIT_NAMES

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
      return 'Member price'
    default: {
      const unreachable: never = insurance
      return unreachable
    }
  }
}

// Upgrades go to higher tiers first, so each tier waits for the one above it.
export function upgradeLabel(tier: TierInfo, tiers: TierInfo[]) {
  if (!tier.benefits.complimentaryUpgrade) return null
  const above = tiers.filter((t) => t.rank > tier.rank && t.benefits.complimentaryUpgrade).sort((a, b) => a.rank - b.rank)[0]
  return above ? `After ${above.name}` : 'First in line'
}

export interface BenefitLine {
  key: BenefitKey
  included: boolean
  value: string | null // short value; null when the benefit has no detail beyond yes or no
}

export function benefitLines(tier: TierInfo, tiers: TierInfo[]): BenefitLine[] {
  const b: TierBenefits = tier.benefits
  const upgrade = upgradeLabel(tier, tiers)
  return [
    { key: 'lounge', included: b.loungeGuests !== null, value: loungeLabel(b.loungeGuests) },
    { key: 'baggage', included: b.bonusBaggageKg > 0, value: `+${b.bonusBaggageKg} kg` },
    { key: 'checkIn', included: b.priorityCheckIn, value: null },
    { key: 'boarding', included: b.priorityBoarding, value: null },
    { key: 'upgrade', included: upgrade !== null, value: upgrade },
    { key: 'insurance', included: b.insurance.kind !== 'none', value: insuranceLabel(b.insurance) },
  ]
}

// One line per benefit for the Welcome tier cards, e.g. "Lounge access · member only".
export function benefitSentence(line: BenefitLine) {
  if (line.key === 'baggage') return `${line.value} free baggage`
  const name = BENEFIT_NAMES[line.key]
  return line.value ? `${name} · ${line.value.charAt(0).toLowerCase()}${line.value.slice(1)}` : name
}
