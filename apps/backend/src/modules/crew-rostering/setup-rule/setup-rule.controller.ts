import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import {
  SetupRuleService,
  type CompanyRuleRow,
  type CountryLanguageInput,
  type CountryLanguageRow,
  type CountryLimitInput,
  type CountryLimitRow,
  type CountryOptionRow,
  type DefaultLimitsRow,
  type LanguageOptionRow,
  type RuleSetRow,
} from './setup-rule.service'

/**
 * Feature 8 · Step 2 — legality rules.
 *
 * Two tab groups behind one router. Parsing is inline rather than in a DTO folder,
 * as this feature requires, so the checks at the bottom are the whole validation
 * layer and they stay as strict as a DTO would be.
 */
@Controller('crew-rostering/setup-rule')
export class SetupRuleController {
  constructor(private readonly setupRuleService: SetupRuleService) {}

  /** One call for the whole page — both tabs load from this. */
  @Get()
  async getRuleSet(): Promise<RuleSetRow> {
    return this.setupRuleService.getRuleSet()
  }

  @Get('defaults')
  async getDefaults(): Promise<DefaultLimitsRow> {
    return this.setupRuleService.getDefaults()
  }

  @Put('defaults')
  async updateDefaults(@Body() body: unknown, @CurrentUser() user: { id: string }): Promise<DefaultLimitsRow> {
    return this.setupRuleService.updateDefaults(parseDefaults(asObject(body)), user?.id)
  }

  @Get('company-rules')
  async listCompanyRules(): Promise<CompanyRuleRow[]> {
    return (await this.setupRuleService.getRuleSet()).companyRules
  }

  @Get('countries')
  async listCountries(): Promise<CountryOptionRow[]> {
    return this.setupRuleService.listCountries()
  }

  @Get('languages')
  async listLanguages(): Promise<LanguageOptionRow[]> {
    return this.setupRuleService.listLanguages()
  }

  @Get('country-limits')
  async listCountryLimits(): Promise<CountryLimitRow[]> {
    return this.setupRuleService.listCountryLimits()
  }

  @Post('country-limits')
  async createCountryLimit(@Body() body: unknown): Promise<CountryLimitRow> {
    return this.setupRuleService.createCountryLimit(parseCountryLimit(asObject(body)))
  }

  @Put('country-limits/:countryCode')
  async updateCountryLimit(@Param('countryCode') countryCode: string, @Body() body: unknown): Promise<CountryLimitRow> {
    return this.setupRuleService.updateCountryLimit(requireText(countryCode, 'countryCode'), parseCountryLimit(asObject(body)))
  }

  @Delete('country-limits/:countryCode')
  async deleteCountryLimit(@Param('countryCode') countryCode: string): Promise<void> {
    await this.setupRuleService.deleteCountryLimit(requireText(countryCode, 'countryCode'))
  }

  @Get('country-languages')
  async listCountryLanguages(): Promise<CountryLanguageRow[]> {
    return this.setupRuleService.listCountryLanguages()
  }

  @Put('country-languages/:countryCode')
  async upsertCountryLanguages(@Param('countryCode') countryCode: string, @Body() body: unknown): Promise<CountryLanguageRow> {
    return this.setupRuleService.upsertCountryLanguages(requireText(countryCode, 'countryCode'), parseCountryLanguage(asObject(body)))
  }

  @Delete('country-languages/:countryCode')
  async deleteCountryLanguages(@Param('countryCode') countryCode: string): Promise<void> {
    await this.setupRuleService.deleteCountryLanguages(requireText(countryCode, 'countryCode'))
  }
}

/* ── input parsing ──────────────────────────────────────────────────────────
 * Inline rather than in a DTO folder, as this feature requires. */

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new BadRequestException('Request body must be a JSON object')
  return body as Record<string, unknown>
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new BadRequestException(`${field} is required`)
  return value.trim()
}

/** A finite, non-negative number. `NaN` from an empty input is rejected here, not compared later. */
function requireNumber(value: unknown, field: string): number {
  if (value === null || value === undefined || value === '') throw new BadRequestException(`${field} is required`)
  if (typeof value !== 'number' && typeof value !== 'string') throw new BadRequestException(`${field} must be a number`)
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  if (!Number.isFinite(parsed)) throw new BadRequestException(`${field} must be a number`)
  if (parsed < 0) throw new BadRequestException(`${field} cannot be negative`)
  return parsed
}

/** `country_language.language_code` is a 2-letter ISO 639-1 code in lower case. */
function requireLanguageCode(value: unknown, field: string): string {
  const code = requireText(value, field).toLowerCase()
  if (!/^[a-z]{2}$/.test(code)) throw new BadRequestException(`${field} must be a 2-letter language code`)
  return code
}

function parseDefaults(body: Record<string, unknown>): DefaultLimitsRow {
  return {
    minRestHours: requireNumber(body.minRestHours, 'minRestHours'),
    maxDutyHours: requireNumber(body.maxDutyHours, 'maxDutyHours'),
    maxFlightsPerDuty: requireNumber(body.maxFlightsPerDuty, 'maxFlightsPerDuty'),
    maxPairingDays: requireNumber(body.maxPairingDays, 'maxPairingDays'),
    hoursCap28d: requireNumber(body.hoursCap28d, 'hoursCap28d'),
    minLocalCrew: requireNumber(body.minLocalCrew, 'minLocalCrew'),
    minPolice: requireNumber(body.minPolice, 'minPolice'),
  }
}

function parseCountryLimit(body: Record<string, unknown>): CountryLimitInput {
  return {
    country: requireText(body.country, 'country'),
    minRestHours: requireNumber(body.minRestHours, 'minRestHours'),
    maxDutyHours: requireNumber(body.maxDutyHours, 'maxDutyHours'),
  }
}

function parseCountryLanguage(body: Record<string, unknown>): CountryLanguageInput {
  const languages = body.languages
  if (!Array.isArray(languages) || languages.length === 0) throw new BadRequestException('languages must list at least one code')
  return {
    country: typeof body.country === 'string' ? body.country.trim() : '',
    languages: languages.map((entry, index) => requireLanguageCode(entry, `languages[${index}]`)),
  }
}
