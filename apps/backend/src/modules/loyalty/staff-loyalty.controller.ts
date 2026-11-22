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
import {
  AdjustmentDto,
  AwardFlightsQueryDto,
  EarnRuleDto,
  LoungeVisitDto,
  MemberSearchDto,
  ReleaseAwardDto,
  SettingDto,
  TierBenefitsDto,
  TierRuleDto,
  UpdateAwardDto,
} from './dto/requests'
import type {
  AwardFlightDto,
  EarnRuleDto as EarnRuleRow,
  JobRunResultDto,
  LoungeResultDto,
  LoungeVisitDto as LoungeVisitRow,
  LoyaltySettingsDto,
  MemberDetailDto,
  MemberListItemDto,
  TierInfoDto,
} from './dto/responses'
import { LoyaltyStaff, LoyaltyStaffGuard, type LoyaltyStaffPrincipal } from './guards/loyalty-staff.guard'
import { LoyaltyAwardService } from './loyalty-award.service'
import { LoyaltyError, invalid, memberNotFound, toLoyaltyValidationError } from './loyalty-error'
import { LoyaltyJobsService, isJobName } from './loyalty-jobs.service'
import { LoyaltyLoungeService } from './loyalty-lounge.service'
import { LoyaltyRulesService } from './loyalty-rules.service'
import { LoyaltyStaffService } from './loyalty-staff.service'

const memberId = new ParseUUIDPipe({ exceptionFactory: memberNotFound })
const flightId = new ParseUUIDPipe({
  exceptionFactory: () => new LoyaltyError(HttpStatus.NOT_FOUND, 'FLIGHT_NOT_FOUND', 'No flight with that id.'),
})
const AWARD_CABINS = new Set(['economy', 'premium_economy', 'business', 'first'])

const fareClassId = new ParseUUIDPipe({
  exceptionFactory: () => new LoyaltyError(HttpStatus.NOT_FOUND, 'FARE_CLASS_NOT_FOUND', 'No fare class with that id.'),
})

/** `/api/staff/loyalty/*`: Member Lookup, Loyalty Rules, Award Release, the Lounge Desk and job runs. Loyalty staff only (see `LoyaltyStaffGuard`). */
@Controller('staff/loyalty')
@UseGuards(LoyaltyStaffGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: toLoyaltyValidationError }))
export class StaffLoyaltyController {
  constructor(
    private readonly staff: LoyaltyStaffService,
    private readonly rules: LoyaltyRulesService,
    private readonly jobs: LoyaltyJobsService,
    private readonly awards: LoyaltyAwardService,
    private readonly lounge: LoyaltyLoungeService,
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

  /** Award Release: flights in the window with their award seats per cabin. */
  @Get('awards')
  awardFlights(@Query() query: AwardFlightsQueryDto): Promise<AwardFlightDto[]> {
    return this.awards.listFlights(query.from ? new Date(query.from) : undefined, query.to ? new Date(query.to) : undefined)
  }

  /** Release award seats on a flight and cabin: writes the miles price and raises `award_limit` in one transaction. */
  @Post('awards')
  @HttpCode(201)
  releaseAward(@LoyaltyStaff() who: LoyaltyStaffPrincipal, @Body() dto: ReleaseAwardDto): Promise<AwardFlightDto> {
    return this.awards.release(who, dto.flightId, dto.cabin, dto.seats, dto.milesCost)
  }

  /** Change the seats set aside (not below the award seats already taken) or the miles price. */
  @Put('awards/:flightId/:cabin')
  updateAward(
    @LoyaltyStaff() who: LoyaltyStaffPrincipal,
    @Param('flightId', flightId) id: string,
    @Param('cabin') cabin: string,
    @Body() dto: UpdateAwardDto,
  ): Promise<AwardFlightDto> {
    if (!AWARD_CABINS.has(cabin)) throw invalid('cabin', 'Unknown cabin.')
    if (dto.seats === undefined && dto.milesCost === undefined) throw invalid('seats', 'Enter the seats or the miles per seat.')
    return this.awards.updateRelease(who, id, cabin, dto)
  }

  /**
   * Admits a member to the lounge by member number or booking reference. A refusal (tier, ticket, guests, one visit
   * per flight) answers 200 with the reason, so the desk can show it; 404 only when nothing matches.
   */
  @Post('lounge-visits')
  @HttpCode(200)
  admitToLounge(@LoyaltyStaff() who: LoyaltyStaffPrincipal, @Body() dto: LoungeVisitDto): Promise<LoungeResultDto> {
    return this.lounge.admit(who, dto.query, dto.guests)
  }

  /** Lounge visits on the current simulated day, newest first. */
  @Get('lounge-visits')
  loungeVisits(): Promise<LoungeVisitRow[]> {
    return this.lounge.visitsToday()
  }

  /**
   * Runs one background job now, at the current simulated time, for demos and tests: `earn`, `tier`, `expire`,
   * `return-to-cash` or `upgrade`.
   */
  @Post('jobs/:name/run')
  @HttpCode(200)
  runJob(@Param('name') name: string): Promise<JobRunResultDto> {
    if (!isJobName(name)) throw new LoyaltyError(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', `No loyalty job named "${name}".`)
    return this.jobs.run(name)
  }
}
