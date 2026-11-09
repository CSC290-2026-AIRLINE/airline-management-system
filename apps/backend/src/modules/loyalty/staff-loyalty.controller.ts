import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import type { TierBenefits, TierRule } from './domain/types'
import { AdjustmentDto, EarnRuleDto, MemberSearchDto, SettingDto, TierBenefitsDto, TierRuleDto } from './dto/requests'
import type {
  EarnRuleDto as EarnRuleRow,
  JobRunResultDto,
  LoyaltySettingsDto,
  MemberDetailDto,
  MemberListItemDto,
  TierInfoDto,
} from './dto/responses'
import { LoyaltyStaff, LoyaltyStaffGuard, type LoyaltyStaffPrincipal } from './guards/loyalty-staff.guard'
import { LoyaltyError, memberNotFound, toLoyaltyValidationError } from './loyalty-error'
import { LoyaltyJobsService, isJobName } from './loyalty-jobs.service'
import { LoyaltyRulesService } from './loyalty-rules.service'
import { LoyaltyStaffService } from './loyalty-staff.service'

const memberId = new ParseUUIDPipe({ exceptionFactory: memberNotFound })
const fareClassId = new ParseUUIDPipe({
  exceptionFactory: () => new LoyaltyError(HttpStatus.NOT_FOUND, 'FARE_CLASS_NOT_FOUND', 'No fare class with that id.'),
})

/** `/api/staff/loyalty/*`: Member Lookup and Loyalty Rules. Loyalty staff only (see `LoyaltyStaffGuard`). */
@Controller('staff/loyalty')
@UseGuards(LoyaltyStaffGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: toLoyaltyValidationError }))
export class StaffLoyaltyController {
  constructor(
    private readonly staff: LoyaltyStaffService,
    private readonly rules: LoyaltyRulesService,
    private readonly jobs: LoyaltyJobsService,
  ) {}

  @Get('members')
  search(@Query() query: MemberSearchDto): Promise<MemberListItemDto[]> {
    return this.staff.search(query.q)
  }

  @Get('members/:id')
  member(@Param('id', memberId) id: string): Promise<MemberDetailDto> {
    return this.staff.detail(id)
  }

  /** Add (positive) or remove (negative) miles. Logged in the feature 15 audit log; returns the updated member. */
  @Post('members/:id/adjustments')
  @HttpCode(201)
  adjust(
    @LoyaltyStaff() who: LoyaltyStaffPrincipal,
    @Param('id', memberId) id: string,
    @Body() dto: AdjustmentDto,
  ): Promise<MemberDetailDto> {
    return this.staff.adjust(who, id, dto.miles, dto.reason)
  }

  @Get('tier-rules')
  tierRules(): Promise<TierRule[]> {
    return this.rules.tierRules()
  }

  @Put('tier-rules/:code')
  updateTierRule(@LoyaltyStaff() who: LoyaltyStaffPrincipal, @Param('code') code: string, @Body() dto: TierRuleDto): Promise<TierRule> {
    return this.rules.updateTierRule(who, code, dto)
  }

  @Get('earn-rules')
  earnRules(): Promise<EarnRuleRow[]> {
    return this.rules.earnRules()
  }

  @Put('earn-rules/:fareClassId')
  setEarnRule(
    @LoyaltyStaff() who: LoyaltyStaffPrincipal,
    @Param('fareClassId', fareClassId) id: string,
    @Body() dto: EarnRuleDto,
  ): Promise<EarnRuleRow> {
    return this.rules.setEarnRule(who, id, dto.multiplier)
  }

  @Get('settings')
  settings(): Promise<LoyaltySettingsDto> {
    return this.rules.settings()
  }

  @Put('settings/:key')
  updateSetting(
    @LoyaltyStaff() who: LoyaltyStaffPrincipal,
    @Param('key') key: string,
    @Body() dto: SettingDto,
  ): Promise<LoyaltySettingsDto> {
    return this.rules.updateSetting(who, key, dto.value)
  }

  @Get('tier-benefits')
  tierBenefits(): Promise<TierInfoDto[]> {
    return this.rules.tiers()
  }

  @Put('tier-benefits/:code')
  updateTierBenefits(
    @LoyaltyStaff() who: LoyaltyStaffPrincipal,
    @Param('code') code: string,
    @Body() dto: TierBenefitsDto,
  ): Promise<TierBenefits> {
    const insurance: TierBenefits['insurance'] =
      dto.insurance.kind === 'member_price' ? { kind: 'member_price', priceThb: dto.insurance.priceThb ?? 0 } : { kind: dto.insurance.kind }
    return this.rules.updateTierBenefits(who, code, { ...dto, insurance })
  }

  /**
   * Runs one background job now, at the current simulated time, for demos and tests: `earn`, `tier` or `expire`.
   * `return-to-cash` and `upgrade` answer 501 until feature 3b ships `setAwardSeats` and `upgradeCoupon`.
   */
  @Post('jobs/:name/run')
  @HttpCode(200)
  runJob(@Param('name') name: string): Promise<JobRunResultDto> {
    if (!isJobName(name)) throw new LoyaltyError(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', `No loyalty job named "${name}".`)
    return this.jobs.run(name)
  }
}
