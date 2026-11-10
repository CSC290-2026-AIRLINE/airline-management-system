import type { Insurance, TierInfo } from './api/types'

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

export const BENEFIT_KEYS = Object.keys(BENEFIT_NAMES) as BenefitKey[]

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
  if (!tier.benefits.upgradeEligible) return null
  const above = tiers.filter((t) => t.rank > tier.rank && t.benefits.upgradeEligible).sort((a, b) => a.rank - b.rank)[0]
  return above ? `After ${above.name}` : 'First in line'
}

export interface BenefitLine {
  key: BenefitKey
  included: boolean
  value: string | null // short value; null when the benefit is a plain yes or no
}

export function benefitLines(tier: TierInfo, tiers: TierInfo[]): BenefitLine[] {
  const b = tier.benefits
  const upgrade = upgradeLabel(tier, tiers)
  return [
    { key: 'lounge', included: b.loungeGuests !== null, value: loungeLabel(b.loungeGuests) },
    { key: 'baggage', included: b.extraBaggageKg > 0, value: `+${b.extraBaggageKg} kg` },
    { key: 'checkIn', included: b.priorityCheckIn, value: null },
    { key: 'boarding', included: b.priorityBoarding, value: null },
    { key: 'upgrade', included: upgrade !== null, value: upgrade },
    { key: 'insurance', included: b.insurance.kind !== 'none', value: insuranceLabel(b.insurance) },
  ]
}

const lower = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`

// One line per benefit for the Welcome tier cards, e.g. "Lounge access · member + 1 guest".
export function benefitSentence(line: BenefitLine) {
  if (line.key === 'baggage') return `${line.value} free baggage`
  const name = BENEFIT_NAMES[line.key]
  return line.value ? `${name} · ${lower(line.value)}` : name
}

// The Dashboard benefits card, e.g. "Lounge access for you and 1 guest, +10 kg free baggage, priority check-in and
// boarding, and travel insurance included. Upgrades come after Platinum members."
export function benefitSummary(tier: TierInfo, tiers: TierInfo[]) {
  const b = tier.benefits
  const parts: string[] = []
  if (b.loungeGuests !== null)
    parts.push(
      b.loungeGuests === 0
        ? 'lounge access for you'
        : `lounge access for you and ${b.loungeGuests} guest${b.loungeGuests === 1 ? '' : 's'}`,
    )
  if (b.extraBaggageKg > 0) parts.push(`+${b.extraBaggageKg} kg free baggage`)
  if (b.priorityCheckIn && b.priorityBoarding) parts.push('priority check-in and boarding')
  else if (b.priorityCheckIn) parts.push('priority check-in')
  else if (b.priorityBoarding) parts.push('priority boarding')
  if (b.insurance.kind === 'included') parts.push('travel insurance included')
  if (b.insurance.kind === 'member_price') parts.push('travel insurance at the member price')
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}` : (parts[0] ?? '')
  const upgrade = upgradeLabel(tier, tiers)
  const upgradeText =
    upgrade === null
      ? ''
      : upgrade === 'First in line'
        ? ' You are first in line for upgrades.'
        : ` Upgrades come ${lower(upgrade)} members.`
  return `${list.charAt(0).toUpperCase()}${list.slice(1)}.${upgradeText}`
}

// What the next tier adds over the current one, e.g. "Adds a second lounge guest, +20 kg baggage, and you are first in
// line for upgrades."
export function nextTierAdds(current: TierInfo | null, next: TierInfo, tiers: TierInfo[]) {
  const c = current?.benefits
  const n = next.benefits
  const parts: string[] = []
  if (n.loungeGuests !== null && (c?.loungeGuests ?? null) !== n.loungeGuests)
    parts.push(
      c?.loungeGuests == null
        ? 'lounge access'
        : n.loungeGuests === 2
          ? 'a second lounge guest'
          : `lounge for ${loungeLabel(n.loungeGuests).toLowerCase()}`,
    )
  if (n.extraBaggageKg > (c?.extraBaggageKg ?? 0)) parts.push(`+${n.extraBaggageKg} kg baggage`)
  if (n.priorityCheckIn && !c?.priorityCheckIn) parts.push('priority check-in')
  if (n.priorityBoarding && !c?.priorityBoarding) parts.push('priority boarding')
  if (n.insurance.kind === 'included' && c?.insurance.kind !== 'included') parts.push('travel insurance included')
  if (n.insurance.kind === 'member_price' && (!c || c.insurance.kind === 'none')) parts.push('travel insurance at the member price')
  const upgrade = upgradeLabel(next, tiers)
  if (upgrade === 'First in line' && current) parts.push('you are first in line for upgrades')
  else if (upgrade && !current) parts.push('complimentary upgrades')
  if (parts.length === 0) return 'Keeps every benefit you have today.'
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}` : parts[0]
  return `Adds ${list}.`
}
