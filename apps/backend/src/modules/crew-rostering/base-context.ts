import { NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'

/** A country that asks for more rest or less duty than the company baseline. */
export interface CountryRule {
  minRestHours: number
  maxDutyHours: number
}

/** What building pairings and assigning crew both read before they judge a flight: the settings, the country rules and the airports. */
export interface BaseContext {
  /** A `crew_setting` value as a number, or the fallback when it is missing or not a number. */
  read: (key: string, fallback: number) => number
  countryRules: Map<string, CountryRule>
  /** IATA code to the lower-case country code, as stored. */
  airportCountry: Map<string, string>
  /** Duty days are cut at local midnight in the base's time zone. */
  timeZone: string
}

/** Reads the shared context for one base, in one round of queries. */
export async function loadBaseContext(db: DbService, base: string): Promise<BaseContext> {
  const [settings, countryRules, airports] = await Promise.all([
    db.crew_setting.findMany({ select: { key: true, value: true } }),
    db.country_legality_rule.findMany({ select: { country_code: true, min_rest_hours: true, max_duty_hours: true } }),
    db.airport.findMany({ select: { iata_code: true, country: true, timezone: true } }),
  ])

  const baseAirport = airports.find((airport) => airport.iata_code === base)
  if (!baseAirport) throw new NotFoundException(`Base ${base} was not found`)

  const setting = new Map(settings.map((row) => [row.key, Number.parseFloat(row.value)]))

  return {
    read: (key, fallback) => {
      const value = setting.get(key)
      return value !== undefined && Number.isFinite(value) ? value : fallback
    },
    countryRules: new Map(
      countryRules.map((rule) => [
        rule.country_code,
        { minRestHours: Number(rule.min_rest_hours), maxDutyHours: Number(rule.max_duty_hours) },
      ]),
    ),
    airportCountry: new Map(airports.map((airport) => [airport.iata_code, airport.country.toLowerCase()])),
    timeZone: baseAirport.timezone,
  }
}
