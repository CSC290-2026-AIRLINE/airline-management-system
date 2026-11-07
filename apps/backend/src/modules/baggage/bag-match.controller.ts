import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import type { ValidationError } from '@nestjs/common'
import type { BagMatch } from './common/bag-match.types'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { ListBagMatchesQuery } from './dto/list-bag-matches.query'
import { LinkBagMatchDto } from './dto/link-bag-match.dto'
import { ConfirmBagMatchDto, RejectBagMatchDto } from './dto/review-bag-match.dto'
import { BaggageStaffGuard, CurrentBaggageStaff, type BaggageStaff } from './guards/baggage-staff.guard'
import { BagMatchReviewService } from './bag-match-review.service'

function toValidationError(errors: ValidationError[]): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_MATCH, errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; '))
}

function notFound(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.MATCH_NOT_FOUND, 'Match not found')
}

/** `/api/staff/bag-matches`: Match review. Staff check suggested matches, link bags by hand, and confirm or reject. Staff only. */
@Controller('staff/bag-matches')
@UseGuards(BaggageStaffGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: toValidationError }))
export class BagMatchController {
  constructor(private readonly review: BagMatchReviewService) {}

  /** Open matches first, strong on top. */
  @Get()
  list(@Query() query: ListBagMatchesQuery): Promise<BagMatch[]> {
    return this.review.list(query)
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string): Promise<BagMatch> {
    return this.review.getById(id)
  }

  /** Link a found bag to a case by hand. */
  @Post()
  @HttpCode(201)
  link(@CurrentBaggageStaff() staff: BaggageStaff, @Body() dto: LinkBagMatchDto): Promise<BagMatch> {
    return this.review.link({ ...dto, staffId: staff.staffId })
  }

  /** Confirm the owner: the case and the bag become matched, and the other open matches of both are rejected. */
  @Post(':id/confirm')
  @HttpCode(200)
  confirm(
    @CurrentBaggageStaff() staff: BaggageStaff,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string,
    @Body() dto: ConfirmBagMatchDto,
  ): Promise<BagMatch> {
    return this.review.confirm({ staffId: staff.staffId, matchId: id, note: dto.note })
  }

  /** Not the same bag. */
  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentBaggageStaff() staff: BaggageStaff,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string,
    @Body() dto: RejectBagMatchDto,
  ): Promise<BagMatch> {
    return this.review.reject({ staffId: staff.staffId, matchId: id, note: dto.note })
  }
}
