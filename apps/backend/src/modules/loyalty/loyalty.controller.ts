import { Controller, Get, HttpCode, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import { Public } from '@backend/auth/decorators/public.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import type { StatementFilter } from './domain/ledger-view'
import { AwardSearchQueryDto, StatementQueryDto } from './dto/requests'
import type {
  AwardRouteDto,
  AwardSearchDto,
  BenefitUseDto,
  MemberSummaryDto,
  RedemptionRowDto,
  StatementRowDto,
  TierInfoDto,
} from './dto/responses'
import { LoyaltyAwardService } from './loyalty-award.service'
import { toLoyaltyValidationError } from './loyalty-error'
import { LoyaltyMemberService } from './loyalty-member.service'
import { LoyaltyRulesService } from './loyalty-rules.service'

/** A bare date as `to` means through the end of that day (UTC). */
function toFilter(q: StatementQueryDto): StatementFilter {
  const to = q.to ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(q.to) ? `${q.to}T23:59:59.999Z` : q.to) : undefined
  return { type: q.type, from: q.from ? new Date(q.from) : undefined, to }
}

/** `/api/loyalty/*`: the customer's own membership. Signed-in customers only, except the public tier table. */
@Controller('loyalty')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: toLoyaltyValidationError }))
export class LoyaltyController {
  constructor(
    private readonly members: LoyaltyMemberService,
    private readonly rules: LoyaltyRulesService,
    private readonly awards: LoyaltyAwardService,
  ) {}

  /** The tier table with each tier's benefits, for the Join page and the dashboard. */
  @Public()
  @Get('tier-benefits')
  tierBenefits(): Promise<TierInfoDto[]> {
    return this.rules.tiers()
  }

  @Post('members')
  @HttpCode(201)
  join(@CurrentUser() user: AuthenticatedUser): Promise<MemberSummaryDto> {
    return this.members.join(user.id)
  }

  @Get('members/me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<MemberSummaryDto> {
    return this.members.me(user.id)
  }

  @Get('members/me/transactions')
  statement(@CurrentUser() user: AuthenticatedUser, @Query() query: StatementQueryDto): Promise<StatementRowDto[]> {
    return this.members.statement(user.id, toFilter(query))
  }

  @Get('members/me/benefits')
  benefits(@CurrentUser() user: AuthenticatedUser): Promise<BenefitUseDto[]> {
    return this.members.benefits(user.id)
  }

  @Get('redemptions')
  redemptions(@CurrentUser() user: AuthenticatedUser): Promise<RedemptionRowDto[]> {
    return this.members.redemptions(user.id)
  }

  /** Routes with open flights ahead, for Flight Search with miles. */
  @Get('award-routes')
  awardRoutes(): Promise<AwardRouteDto[]> {
    return this.awards.routes()
  }

  /** Flights on a route and date with their award cabins (miles cost, seats left) and whether the balance covers them. */
  @Get('award-flights')
  awardFlights(@CurrentUser() user: AuthenticatedUser, @Query() query: AwardSearchQueryDto): Promise<AwardSearchDto> {
    return this.awards.search(user.id, query)
  }
}
