import {
  benefitsFromRow,
  benefitsToRow,
  insuranceFromPrice,
  normaliseMultiplier,
  parseSettings,
  validateBenefits,
  validateSetting,
  validateTierRule,
} from './rules'
import { TierBenefits, TierRule } from './types'

const rules: TierRule[] = [
  { code: 'silver', name: 'Silver', rank: 1, minMiles: 15000, minFlights: 20, validMonths: 12 },
  { code: 'gold', name: 'Gold', rank: 2, minMiles: 40000, minFlights: 50, validMonths: 12 },
  { code: 'platinum', name: 'Platinum', rank: 3, minMiles: 80000, minFlights: 100, validMonths: 12 },
]

describe('parseSettings', () => {
  it('reads the stored text values', () => {
    expect(
      parseSettings([
        { key: 'miles_retention_months', value: '24' },
        { key: 'expiry_reminder_days', value: '14' },
        { key: 'award_cutoff_hours', value: '48' },
      ]),
    ).toEqual({ milesRetentionMonths: 24, expiryReminderDays: 14, awardCutoffHours: 48 })
  })

  it('falls back to the starting values for missing, unknown or unreadable rows', () => {
    expect(
      parseSettings([
        { key: 'miles_retention_months', value: 'abc' },
        { key: 'something_else', value: '5' },
      ]),
    ).toEqual({ milesRetentionMonths: 36, expiryReminderDays: 30, awardCutoffHours: 72 })
  })
})

describe('validateSetting', () => {
  it('accepts a whole number in range', () => {
    expect(validateSetting('award_cutoff_hours', 0)).toBeNull()
  })

  it.each([
    ['miles_retention_months', 6],
    ['expiry_reminder_days', 1.5],
    ['award_cutoff_hours', -1],
  ] as const)('refuses %s = %s', (key, value) => {
    expect(validateSetting(key, value)).not.toBeNull()
  })
})

describe('validateTierRule', () => {
  it('accepts thresholds between the neighbouring tiers', () => {
    expect(validateTierRule('gold', { minMiles: 45000, minFlights: 60, validMonths: 12 }, rules)).toBeNull()
  })

  it('refuses a threshold of 0', () => {
    expect(validateTierRule('silver', { minMiles: 0, minFlights: 20, validMonths: 12 }, rules)?.field).toBe('minMiles')
  })

  it('refuses gold easier than silver or harder than platinum', () => {
    expect(validateTierRule('gold', { minMiles: 15000, minFlights: 60, validMonths: 12 }, rules)?.field).toBe('minMiles')
    expect(validateTierRule('gold', { minMiles: 45000, minFlights: 100, validMonths: 12 }, rules)?.field).toBe('minFlights')
  })

  it('refuses a validity over 60 months', () => {
    expect(validateTierRule('platinum', { minMiles: 90000, minFlights: 120, validMonths: 61 }, rules)?.field).toBe('validMonths')
  })
})

describe('normaliseMultiplier', () => {
  it.each([
    ['1.5', '1.50'],
    ['0', '0.00'],
    ['12.25', '12.25'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseMultiplier(input)).toBe(expected)
  })

  it.each(['-1', '1.234', '100', 'x'])('refuses %s', (input) => {
    expect(normaliseMultiplier(input)).toBeNull()
  })
})

describe('tier benefits', () => {
  const gold: TierBenefits = {
    loungeGuests: 1,
    extraBaggageKg: 10,
    priorityCheckIn: true,
    priorityBoarding: true,
    upgradeEligible: true,
    insurance: { kind: 'included' },
  }

  it('maps insurance_price: NULL = not offered, 0 = included, above 0 = member price', () => {
    expect(insuranceFromPrice(null)).toEqual({ kind: 'none' })
    expect(insuranceFromPrice(0)).toEqual({ kind: 'included' })
    expect(insuranceFromPrice(450)).toEqual({ kind: 'member_price', priceThb: 450 })
  })

  it('round-trips through the row shape', () => {
    expect(benefitsFromRow(benefitsToRow(gold))).toEqual(gold)
    expect(benefitsToRow({ ...gold, insurance: { kind: 'none' } }).insurance_price).toBeNull()
  })

  it('validates guests, baggage and the member price', () => {
    expect(validateBenefits(gold)).toBeNull()
    expect(validateBenefits({ ...gold, loungeGuests: -1 })?.field).toBe('loungeGuests')
    expect(validateBenefits({ ...gold, extraBaggageKg: 2.25 })?.field).toBe('extraBaggageKg')
    expect(validateBenefits({ ...gold, extraBaggageKg: 0.1 })).toBeNull()
    expect(validateBenefits({ ...gold, insurance: { kind: 'member_price', priceThb: 0 } })?.field).toBe('insurance')
    expect(validateBenefits({ ...gold, insurance: { kind: 'member_price', priceThb: 199.99 } })).toBeNull()
  })
})
