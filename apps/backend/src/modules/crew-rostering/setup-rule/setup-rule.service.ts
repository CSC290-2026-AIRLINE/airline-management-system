import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { COUNTRY_CODES, countryName } from '../country-names'

/**
 * Feature 8 · Step 2 — legality rules.
 *
 * Owns three tables:
 *   · `crew_setting`    — the company-wide baseline, one key/value row per limit
 *   · `legality_rule`   — per-country overrides that may only tighten the baseline
 *   · `country_language`— which languages count as local at a destination
 *
 * The baseline keys are the column names the F8 design uses, so a rule and the
 * setting that overrides it are spelled the same way on both sides of the join.
 */

/** Keys in `crew_setting`, named exactly as in the F8 design. */
export const SETTING_KEYS = {
  minRestHours: 'min_rest_hours',
  maxDutyHours: 'max_duty_hours',
  maxFlightsPerDuty: 'max_flights_per_duty',
  maxPairingDays: 'max_pairing_days',
  maxFlightHours28d: 'max_flight_hours_28d',
  minLocalCrew: 'min_local_crew',
  minPolice: 'min_police_international',
} as const

/** Values used when a key has never been written, so a fresh install still renders. */
const SETTING_FALLBACKS: Record<string, string> = {
  [SETTING_KEYS.minRestHours]: '10',
  [SETTING_KEYS.maxDutyHours]: '13',
  [SETTING_KEYS.maxFlightsPerDuty]: '4',
  [SETTING_KEYS.maxPairingDays]: '3',
  [SETTING_KEYS.maxFlightHours28d]: '100',
  [SETTING_KEYS.minLocalCrew]: '1',
  [SETTING_KEYS.minPolice]: '2',
}

/**
 * Country name ↔ ISO code.
 *
 * The schema has `legality_rule.country_code` but no country table to resolve a
 * name from, and `airport.country` holds free-text names that cannot be keyed by
 * code. This map stands in until a migration adds one; every read and write of a
 * country rule goes through it, so swapping it for a table is a local change.
 */
/**
 * Company policies that sit above the legality limits.
 *
 * They are policy lines rather than limits — no numbers to store — so they are
 * described here and matched to the `rule_break.rule` codes that raise them.
 */
export const COMPANY_RULES = [
  { id: 'CR-01', code: 'POLICE_MIN', label: 'Every international leg carries the police complement required by the destination.' },
  { id: 'CR-02', code: 'POLICE_NO_SEAT', label: 'An assigned police officer must hold a seat on the leg, not a standby seat.' },
  { id: 'CR-03', code: 'NO_LOCAL_CREW', label: 'A destination with a declared local language carries at least one local speaker.' },
] as const

export interface DefaultLimitsRow {
  minRestHours: number
  maxDutyHours: number
  maxFlightsPerDuty: number
  maxPairingDays: number
  /** Flight hours permitted across the rolling 28-day window. */
  hoursCap28d: number
  /** Seats that must be filled by a locally-speaking crew member. */
  minLocalCrew: number
  /** Police officers required on an international leg. */
  minPolice: number
}

export interface CompanyRuleRow {
  id: string
  label: string
  code?: string
}

export interface CountryLimitRow {
  id: string
  country: string
  countryCode: string
  minRestHours: number
  maxDutyHours: number
  /** Pairings that would be re-checked if this rule changed. */
  affectedPairings: number
}

export interface CountryLanguageRow {
  id: string
  country: string
  countryCode: string
  /** Language codes, in the order the operator picked them. */
  languages: string[]
  /** Crew in the system who speak at least one of them. */
  speakingCrew: number
}

export interface RuleSetRow {
  defaults: DefaultLimitsRow
  companyRules: CompanyRuleRow[]
  countryLimits: CountryLimitRow[]
  countryLanguages: CountryLanguageRow[]
}

export interface CountryOptionRow {
  name: string
  code: string
}

export interface LanguageOptionRow {
  code: string
  name: string
}

export interface CountryLimitInput {
  country: string
  minRestHours: number
  maxDutyHours: number
}

export interface CountryLanguageInput {
  /** Optional: the URL already names the country. When given it has to name the same one. */
  country?: string
  languages: string[]
}

interface LegalityRuleDbRow {
  country_code: string
  min_rest_hours: { toString(): string } | number
  max_duty_hours: { toString(): string } | number
}

const LEGALITY_RULE_SELECT = { country_code: true, min_rest_hours: true, max_duty_hours: true } as const

/** Postgres `numeric` comes back as a string over the wire; normalise before comparing. */
function num(value: string | number | null | undefined, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

@Injectable()
export class SetupRuleService {
  constructor(private readonly db: DbService) {}

  /**
   * Everything the Rules page loads, in one response.
   *
   * The page edits two independent sets — limits and languages — and renders both
   * tabs from a single load, so they are assembled here rather than joined in the
   * client from four calls.
   */
  async getRuleSet(): Promise<RuleSetRow> {
    const [defaults, countryLimits, countryLanguages] = await Promise.all([
      this.getDefaults(),
      this.listCountryLimits(),
      this.listCountryLanguages(),
    ])
    return {
      defaults,
      companyRules: COMPANY_RULES.map((rule) => ({ id: rule.id, code: rule.code, label: rule.label })),
      countryLimits,
      countryLanguages,
    }
  }

  /** The company-wide baseline. Unset keys fall back to the design's defaults. */
  async getDefaults(): Promise<DefaultLimitsRow> {
    const settings = await this.db.crew_setting.findMany({
      where: { key: { in: Object.values(SETTING_KEYS) } },
      select: { key: true, value: true },
    })
    const byKey = new Map(settings.map((setting) => [setting.key, String(setting.value)]))

    const read = (key: string): number => {
      const raw = byKey.get(key)
      return raw === undefined ? num(SETTING_FALLBACKS[key], 0) : num(raw, num(SETTING_FALLBACKS[key], 0))
    }

    return {
      minRestHours: read(SETTING_KEYS.minRestHours),
      maxDutyHours: read(SETTING_KEYS.maxDutyHours),
      maxFlightsPerDuty: read(SETTING_KEYS.maxFlightsPerDuty),
      maxPairingDays: read(SETTING_KEYS.maxPairingDays),
      hoursCap28d: read(SETTING_KEYS.maxFlightHours28d),
      minLocalCrew: read(SETTING_KEYS.minLocalCrew),
      minPolice: read(SETTING_KEYS.minPolice),
    }
  }

  /**
   * Writes the baseline.
   *
   * One row per key rather than a single JSON blob, so a single limit can be audited
   * on its own. Updatable keys are validated together so a tightening rule can never
   * be saved that is looser than the current baseline.
   */
  async updateDefaults(input: DefaultLimitsRow, actorUserId?: string): Promise<DefaultLimitsRow> {
    const current = await this.getDefaults()
    const next: DefaultLimitsRow = {
      minRestHours: input.minRestHours ?? current.minRestHours,
      maxDutyHours: input.maxDutyHours ?? current.maxDutyHours,
      maxFlightsPerDuty: input.maxFlightsPerDuty ?? current.maxFlightsPerDuty,
      maxPairingDays: input.maxPairingDays ?? current.maxPairingDays,
      hoursCap28d: input.hoursCap28d ?? current.hoursCap28d,
      minLocalCrew: input.minLocalCrew ?? current.minLocalCrew,
      minPolice: input.minPolice ?? current.minPolice,
    }

    if (next.minRestHours > 24) throw new BadRequestException('minRestHours cannot exceed 24')
    if (next.maxDutyHours > 24) throw new BadRequestException('maxDutyHours cannot exceed 24')
    if (next.maxFlightsPerDuty < 1) throw new BadRequestException('maxFlightsPerDuty must be at least 1')
    if (next.maxPairingDays < 1) throw new BadRequestException('maxPairingDays must be at least 1')

    const values: Record<string, string> = {
      [SETTING_KEYS.minRestHours]: String(next.minRestHours),
      [SETTING_KEYS.maxDutyHours]: String(next.maxDutyHours),
      [SETTING_KEYS.maxFlightsPerDuty]: String(next.maxFlightsPerDuty),
      [SETTING_KEYS.maxPairingDays]: String(next.maxPairingDays),
      [SETTING_KEYS.maxFlightHours28d]: String(next.hoursCap28d),
      [SETTING_KEYS.minLocalCrew]: String(next.minLocalCrew),
      [SETTING_KEYS.minPolice]: String(next.minPolice),
    }

    // `crew_setting.updated_by` points at staff, while the signed-in caller is a user.
    const actor = actorUserId
      ? await this.db.staff.findFirst({ where: { user_id: actorUserId, deleted_at: null }, select: { id: true } })
      : null
    for (const [key, value] of Object.entries(values)) {
      await this.db.crew_setting.upsert({
        where: { key },
        update: { value, updated_at: new Date(), updated_by: actor?.id ?? null },
        create: { key, value, updated_by: actor?.id ?? null },
      })
    }

    return next
  }

  /**
   * Destinations an operator can pick: every country that has an active airport, plus any
   * country that already carries a rule or a language mapping, so an existing row can always
   * be edited. Codes are lower case, as stored; names come from `COUNTRY_CODES`, falling back
   * to the code for a country that table does not know.
   */
  async listCountries(): Promise<CountryOptionRow[]> {
    const [airports, rules, mappings] = await Promise.all([
      this.db.airport.findMany({ where: { is_active: true }, select: { country: true }, distinct: ['country'] }),
      this.db.country_legality_rule.findMany({ select: { country_code: true } }),
      this.db.country_language.findMany({ select: { country_code: true }, distinct: ['country_code'] }),
    ])
    const codes = new Set([
      ...airports.map((row) => row.country),
      ...rules.map((row) => row.country_code),
      ...mappings.map((row) => row.country_code),
    ])
    return [...codes].map((code) => ({ name: countryName(code), code })).sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Languages an operator can mark as local. Every code in `country_language` qualifies. */
  async listLanguages(): Promise<LanguageOptionRow[]> {
    const rows = await this.db.country_language.findMany({
      select: { language_code: true },
      distinct: ['language_code'],
      orderBy: { language_code: 'asc' },
    })
    return rows.map((row) => ({ code: row.language_code, name: row.language_code }))
  }

  async listCountryLimits(): Promise<CountryLimitRow[]> {
    const rows = (await this.db.country_legality_rule.findMany({
      select: LEGALITY_RULE_SELECT,
      orderBy: { country_code: 'asc' },
    })) as LegalityRuleDbRow[]
    return Promise.all(rows.map((row) => this.toCountryLimitRow(row)))
  }

  /**
   * Adds a destination rule.
   *
   * A country rule may only tighten the baseline: a country asking for *less* rest or
   * a *longer* duty day than the company allows is rejected rather than silently
   * written, because that is the one edit that would make the roster less legal.
   */
  async createCountryLimit(input: CountryLimitInput): Promise<CountryLimitRow> {
    const code = await this.resolveCountryCode(input.country)
    const existing = await this.db.country_legality_rule.findUnique({ where: { country_code: code }, select: { country_code: true } })
    if (existing) throw new BadRequestException(`${countryName(code)} already has a rule`)

    await this.assertTightens(input.minRestHours, input.maxDutyHours)
    await this.db.country_legality_rule.create({
      data: { country_code: code, min_rest_hours: input.minRestHours, max_duty_hours: input.maxDutyHours },
    })

    return this.toCountryLimitRow({ country_code: code, min_rest_hours: input.minRestHours, max_duty_hours: input.maxDutyHours })
  }

  async updateCountryLimit(countryCode: string, input: CountryLimitInput): Promise<CountryLimitRow> {
    const code = await this.resolveCountryCode(countryCode)
    await this.assertRuleExists(code)
    await this.assertTightens(input.minRestHours, input.maxDutyHours)

    await this.db.country_legality_rule.update({
      where: { country_code: code },
      data: { min_rest_hours: input.minRestHours, max_duty_hours: input.maxDutyHours },
    })
    return this.toCountryLimitRow({ country_code: code, min_rest_hours: input.minRestHours, max_duty_hours: input.maxDutyHours })
  }

  /** Removes the country override, which puts the destination back on the baseline. */
  async deleteCountryLimit(countryCode: string): Promise<void> {
    const code = await this.resolveCountryCode(countryCode)
    await this.assertRuleExists(code)
    await this.db.country_legality_rule.delete({ where: { country_code: code } })
  }

  async listCountryLanguages(): Promise<CountryLanguageRow[]> {
    const rows = await this.db.country_language.findMany({
      select: { country_code: true, language_code: true },
      orderBy: [{ country_code: 'asc' }, { language_code: 'asc' }],
    })
    const byCountry = new Map<string, string[]>()
    for (const row of rows) {
      const existing = byCountry.get(row.country_code)
      if (existing) existing.push(row.language_code)
      else byCountry.set(row.country_code, [row.language_code])
    }

    return Promise.all(
      [...byCountry.entries()].map(async ([code, languages]) => ({
        id: `CL-${code}`,
        country: countryName(code),
        countryCode: code,
        languages,
        speakingCrew: await this.countSpeakingCrew(languages),
      })),
    )
  }

  /**
   * Replaces the language set for a destination.
   *
   * `country_language` is keyed on the pair, so a removed language is a deleted row
   * and an added one is an insert. Done in a transaction because a half-written
   * mapping would report a local crew member the page does not have.
   */
  async upsertCountryLanguages(countryCode: string, input: CountryLanguageInput): Promise<CountryLanguageRow> {
    const code = await this.resolveCountryCode(countryCode)
    if (input.country && (await this.resolveCountryCode(input.country)) !== code) {
      throw new BadRequestException(`country ${input.country} does not match ${countryName(code)} in the URL`)
    }
    const wanted = [...new Set(input.languages.map((language) => language.toLowerCase()))]

    await this.db.$transaction(async (tx) => {
      await tx.country_language.deleteMany({ where: { country_code: code } })
      if (wanted.length > 0) {
        await tx.country_language.createMany({ data: wanted.map((languageCode) => ({ country_code: code, language_code: languageCode })) })
      }
    })

    return {
      id: `CL-${code}`,
      country: countryName(code),
      countryCode: code,
      languages: wanted,
      speakingCrew: await this.countSpeakingCrew(wanted),
    }
  }

  async deleteCountryLanguages(countryCode: string): Promise<void> {
    const code = await this.resolveCountryCode(countryCode)
    const { count } = await this.db.country_language.deleteMany({ where: { country_code: code } })
    if (count === 0) throw new NotFoundException(`${countryName(code)} has no language mapping`)
  }

  /** Accepts either an ISO code or a country name, so the form can send what it holds. */
  /** Accepts a name or a 2-letter code and returns the lower-case code the tables store. */
  private async resolveCountryCode(country: string): Promise<string> {
    const text = (country ?? '').trim()
    if (text === '') throw new BadRequestException('country is required')
    const byName = Object.entries(COUNTRY_CODES).find(([, name]) => name.toLowerCase() === text.toLowerCase())
    if (byName) return byName[0].toLowerCase()
    if (!/^[A-Za-z]{2}$/.test(text)) throw new BadRequestException(`${text} is not a supported destination`)

    const code = text.toLowerCase()
    if (COUNTRY_CODES[code.toUpperCase()]) return code
    // A country this file has no name for is still valid when one of our airports is there.
    const served = await this.db.airport.findFirst({ where: { country: code }, select: { iata_code: true } })
    if (!served) throw new BadRequestException(`${text} is not a supported destination`)
    return code
  }

  private async assertRuleExists(code: string): Promise<void> {
    const found = await this.db.country_legality_rule.findUnique({ where: { country_code: code }, select: { country_code: true } })
    if (!found) throw new NotFoundException(`${countryName(code)} has no rule`)
  }

  private async assertTightens(minRestHours: number, maxDutyHours: number): Promise<void> {
    if (minRestHours <= 0 || maxDutyHours <= 0) throw new BadRequestException('minRestHours and maxDutyHours must be above 0')
    const defaults = await this.getDefaults()
    if (minRestHours < defaults.minRestHours) {
      throw new BadRequestException(`minRestHours cannot be below the company minimum of ${defaults.minRestHours} h`)
    }
    if (maxDutyHours > defaults.maxDutyHours) {
      throw new BadRequestException(`maxDutyHours cannot be above the company maximum of ${defaults.maxDutyHours} h`)
    }
  }

  private async countSpeakingCrew(languages: string[]): Promise<number> {
    if (languages.length === 0) return 0
    return await this.db.crew.count({ where: { deleted_at: null, languages: { hasSome: languages } } })
  }

  /**
   * Pairings that touch this destination and are not yet published.
   *
   * Counted through the legs' destination airport rather than the origin, because a
   * tightening rule changes what an arrival into that country is allowed to look
   * like — which is the leg that already fails today.
   */
  private async countAffectedPairings(code: string): Promise<number> {
    return await this.db.pairing.count({
      where: {
        pairing_leg: { some: { flight: { route: { airport_route_destinationToairport: { country: code } } } } },
        OR: [{ roster_run_pairing: { is: null } }, { roster_run_pairing: { roster_run: { status: { not: 'published' } } } }],
      },
    })
  }

  private async toCountryLimitRow(row: LegalityRuleDbRow): Promise<CountryLimitRow> {
    const defaults = await this.getDefaults()
    return {
      id: `RL-${row.country_code}`,
      country: countryName(row.country_code),
      countryCode: row.country_code,
      minRestHours: num(Number(row.min_rest_hours), defaults.minRestHours),
      maxDutyHours: num(Number(row.max_duty_hours), defaults.maxDutyHours),
      affectedPairings: await this.countAffectedPairings(row.country_code),
    }
  }
}
