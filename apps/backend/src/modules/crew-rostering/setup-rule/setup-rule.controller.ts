import { Body, Controller, Delete, Get, Param, Post, Put, UseFilters, UseGuards, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import { rosteringValidationPipe } from '@backend/modules/crew-rostering/dto/validation'
import { RosteringExceptionFilter } from '@backend/modules/crew-rostering/rostering-error'
import { StaffOnlyGuard } from '@backend/modules/crew-rostering/staff-only.guard'
import { CountryLanguageDto, CountryLimitDto, DefaultLimitsDto } from './dto/setup-rule.dto'
import {
  SetupRuleService,
  type CompanyRuleRow,
  type CountryLanguageRow,
  type CountryLimitRow,
  type CountryOptionRow,
  type DefaultLimitsRow,
  type LanguageOptionRow,
  type RuleSetRow,
} from './setup-rule.service'

/**
 * Feature 8 · Step 2 — legality rules.
 *
 * Two tab groups behind one router. Bodies are validated by the DTOs in `dto/`; a path's
 * country code is a plain segment the service looks up (and 404s when it is unknown).
 */
@Controller('crew-rostering/setup-rule')
@UseGuards(StaffOnlyGuard)
@UseFilters(RosteringExceptionFilter)
@UsePipes(rosteringValidationPipe)
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
  async updateDefaults(@Body() body: DefaultLimitsDto, @CurrentUser() user: { id: string }): Promise<DefaultLimitsRow> {
    return this.setupRuleService.updateDefaults(body, user?.id)
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
  async createCountryLimit(@Body() body: CountryLimitDto, @CurrentUser() user: { id: string }): Promise<CountryLimitRow> {
    return this.setupRuleService.createCountryLimit(body, user?.id)
  }

  @Put('country-limits/:countryCode')
  async updateCountryLimit(
    @Param('countryCode') countryCode: string,
    @Body() body: CountryLimitDto,
    @CurrentUser() user: { id: string },
  ): Promise<CountryLimitRow> {
    return this.setupRuleService.updateCountryLimit(countryCode.trim(), body, user?.id)
  }

  @Delete('country-limits/:countryCode')
  async deleteCountryLimit(@Param('countryCode') countryCode: string, @CurrentUser() user: { id: string }): Promise<void> {
    await this.setupRuleService.deleteCountryLimit(countryCode.trim(), user?.id)
  }

  @Get('country-languages')
  async listCountryLanguages(): Promise<CountryLanguageRow[]> {
    return this.setupRuleService.listCountryLanguages()
  }

  @Put('country-languages/:countryCode')
  async upsertCountryLanguages(
    @Param('countryCode') countryCode: string,
    @Body() body: CountryLanguageDto,
    @CurrentUser() user: { id: string },
  ): Promise<CountryLanguageRow> {
    return this.setupRuleService.upsertCountryLanguages(countryCode.trim(), body, user?.id)
  }

  @Delete('country-languages/:countryCode')
  async deleteCountryLanguages(@Param('countryCode') countryCode: string, @CurrentUser() user: { id: string }): Promise<void> {
    await this.setupRuleService.deleteCountryLanguages(countryCode.trim(), user?.id)
  }
}
