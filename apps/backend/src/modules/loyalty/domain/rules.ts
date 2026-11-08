import { multiplierHundredths } from './earn'
import { DEFAULT_SETTINGS, Insurance, LoyaltySettings, SETTING_KEYS, SettingKey, TierBenefits, TierRule } from './types'

// Validation and mapping for the staff-editable rule tables. The database CHECKs say the same; checking here first gives
// the Loyalty Rules page a field-level message instead of a constraint error.

export type RuleRefusal = { field: string; message: string }

// --- Settings ---------------------------------------------------------------------------------------------------

const SETTING_FIELD: Record<SettingKey, keyof LoyaltySettings> = {
  miles_retention_months: 'milesRetentionMonths',
  expiry_reminder_days: 'expiryReminderDays',
  award_cutoff_hours: 'awardCutoffHours',
}

// Inclusive bounds. Retention under a year or a reminder longer than retention would make no sense to a member.
export const SETTING_BOUNDS: Record<SettingKey, { min: number; max: number }> = {
  miles_retention_months: { min: 12, max: 120 },
  expiry_reminder_days: { min: 1, max: 365 },
  award_cutoff_hours: { min: 0, max: 720 },
}

export function isSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(key)
}

export function settingField(key: SettingKey): keyof LoyaltySettings {
  return SETTING_FIELD[key]
}

// Rows of loyalty_setting as stored (TEXT) to typed settings. A missing or unreadable row falls back to the migration's
// starting value, so a job never stops on a bad setting.
export function parseSettings(rows: readonly { key: string; value: string }[]): LoyaltySettings {
  const settings: LoyaltySettings = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    if (!isSettingKey(row.key)) continue
    const value = Number(row.value)
    const { min, max } = SETTING_BOUNDS[row.key]
    if (Number.isInteger(value) && value >= min && value <= max) settings[SETTING_FIELD[row.key]] = value
  }
  return settings
}

export function validateSetting(key: SettingKey, value: number): RuleRefusal | null {
  const { min, max } = SETTING_BOUNDS[key]
  if (!Number.isInteger(value) || value < min || value > max) {
    return { field: SETTING_FIELD[key], message: `Enter a whole number from ${min} to ${max}.` }
  }
  return null
}

// --- Tier rules -------------------------------------------------------------------------------------------------

export type TierRulePatch = Pick<TierRule, 'minMiles' | 'minFlights' | 'validMonths'>

// Thresholds above 0 (a threshold of 0 would give the tier to everyone) and rising with rank on both paths, so a higher
// tier is never easier to reach than a lower one.
export function validateTierRule(code: string, patch: TierRulePatch, rules: readonly TierRule[]): RuleRefusal | null {
  const positive = (n: number) => Number.isInteger(n) && n > 0
  if (!positive(patch.minMiles)) return { field: 'minMiles', message: 'Miles must be a whole number above 0.' }
  if (!positive(patch.minFlights)) return { field: 'minFlights', message: 'Flights must be a whole number above 0.' }
  if (!positive(patch.validMonths) || patch.validMonths > 60) {
    return { field: 'validMonths', message: 'Validity must be from 1 to 60 months.' }
  }
  const current = rules.find((r) => r.code === code)
  if (!current) return null
  const below = rules.filter((r) => r.rank < current.rank).sort((a, b) => b.rank - a.rank)[0]
  const above = rules.filter((r) => r.rank > current.rank).sort((a, b) => a.rank - b.rank)[0]
  if (below && patch.minMiles <= below.minMiles)
    return { field: 'minMiles', message: `Must be more than ${below.name} (${below.minMiles}).` }
  if (above && patch.minMiles >= above.minMiles)
    return { field: 'minMiles', message: `Must be less than ${above.name} (${above.minMiles}).` }
  if (below && patch.minFlights <= below.minFlights) {
    return { field: 'minFlights', message: `Must be more than ${below.name} (${below.minFlights}).` }
  }
  if (above && patch.minFlights >= above.minFlights) {
    return { field: 'minFlights', message: `Must be less than ${above.name} (${above.minFlights}).` }
  }
  return null
}

// --- Earn rules -------------------------------------------------------------------------------------------------

// NUMERIC(4, 2), 0 to 99.99, normalised to two decimals ("1.5" -> "1.50"). null when the text is not a valid multiplier.
export function normaliseMultiplier(text: string): string | null {
  try {
    const hundredths = multiplierHundredths(text)
    return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`
  } catch {
    return null
  }
}

// --- Tier benefits ----------------------------------------------------------------------------------------------

export interface TierBenefitRow {
  lounge_guests: number | null
  extra_baggage_kg: number
  priority_checkin: boolean
  priority_boarding: boolean
  upgrade_eligible: boolean
  insurance_price: number | null
}

export function insuranceFromPrice(price: number | null): Insurance {
  if (price === null) return { kind: 'none' }
  if (price === 0) return { kind: 'included' }
  return { kind: 'member_price', priceThb: price }
}

export function priceFromInsurance(insurance: Insurance): number | null {
  switch (insurance.kind) {
    case 'none':
      return null
    case 'included':
      return 0
    case 'member_price':
      return insurance.priceThb
    default: {
      const unreachable: never = insurance
      return unreachable
    }
  }
}

export function benefitsFromRow(row: TierBenefitRow): TierBenefits {
  return {
    loungeGuests: row.lounge_guests,
    extraBaggageKg: row.extra_baggage_kg,
    priorityCheckIn: row.priority_checkin,
    priorityBoarding: row.priority_boarding,
    upgradeEligible: row.upgrade_eligible,
    insurance: insuranceFromPrice(row.insurance_price),
  }
}

export function benefitsToRow(benefits: TierBenefits): TierBenefitRow {
  return {
    lounge_guests: benefits.loungeGuests,
    extra_baggage_kg: benefits.extraBaggageKg,
    priority_checkin: benefits.priorityCheckIn,
    priority_boarding: benefits.priorityBoarding,
    upgrade_eligible: benefits.upgradeEligible,
    insurance_price: priceFromInsurance(benefits.insurance),
  }
}

// True when n has at most `places` decimals, allowing for binary floating point (0.1 * 10 is not exactly 1).
function hasDecimals(n: number, places: number): boolean {
  const scaled = n * 10 ** places
  return Math.abs(scaled - Math.round(scaled)) < 1e-6
}

export function validateBenefits(benefits: TierBenefits): RuleRefusal | null {
  const g = benefits.loungeGuests
  if (g !== null && (!Number.isInteger(g) || g < 0 || g > 9)) return { field: 'loungeGuests', message: 'Guests must be from 0 to 9.' }
  const kg = benefits.extraBaggageKg
  // NUMERIC(5, 1)
  if (!Number.isFinite(kg) || kg < 0 || kg > 9999.9 || !hasDecimals(kg, 1)) {
    return { field: 'extraBaggageKg', message: 'Baggage must be 0 or more, to one decimal place.' }
  }
  if (benefits.insurance.kind === 'member_price') {
    const p = benefits.insurance.priceThb
    // NUMERIC(12, 2), above 0 (0 means included)
    if (!Number.isFinite(p) || p <= 0 || p >= 1e10 || !hasDecimals(p, 2)) {
      return { field: 'insurance', message: 'The member price must be above 0, to two decimal places.' }
    }
  }
  return null
}
