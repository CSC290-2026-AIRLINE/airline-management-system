import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import type { ValidationError } from '@nestjs/common'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import type { FoundBag } from './common/found-bag.types'
import type { BagTrackingHistory } from './common/bag-location.types'
import { BagTrackingService } from './bag-tracking.service'
import { RecordMoveDto } from './dto/record-move.dto'
import { ListFoundBagsQuery } from './dto/list-found-bags.query'
import { RecordFoundBagDto } from './dto/record-found-bag.dto'
import { BaggageStaffGuard, CurrentBaggageStaff, type BaggageStaff } from './guards/baggage-staff.guard'
import { FoundBagService } from './found-bag.service'

function toValidationError(errors: ValidationError[]): FoundBagError {
  const tagError = errors.some((e) => e.property === 'tagNumber')
  const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}))

  return new FoundBagError(tagError ? FOUND_BAG_ERROR_CODES.INVALID_TAG : FOUND_BAG_ERROR_CODES.INVALID_FOUND_BAG, messages.join('; '))
}

function notFound(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.FOUND_BAG_NOT_FOUND, 'Found bag not found')
}

/** `/api/staff/found-bags`: the baggage desk records and looks up bags found at an airport. Staff only. */
@Controller('staff/found-bags')
@UseGuards(BaggageStaffGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: toValidationError }))
export class FoundBagController {
  constructor(
    private readonly service: FoundBagService,
    private readonly tracking: BagTrackingService,
  ) {}

  @Post()
  @HttpCode(201)
  record(@CurrentBaggageStaff() staff: BaggageStaff, @Body() dto: RecordFoundBagDto): Promise<FoundBag> {
    return this.service.record({ ...dto, staffId: staff.staffId })
  }

  @Get()
  list(@Query() query: ListFoundBagsQuery): Promise<FoundBag[]> {
    return this.service.list(query)
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string): Promise<FoundBag> {
    return this.service.getById(id)
  }

  /** Where the bag has been, oldest first, and where it is now. */
  @Get(':id/locations')
  history(@Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string): Promise<BagTrackingHistory> {
    return this.tracking.getHistory(id)
  }

  /** Record held, sent or arrived for the bag. */
  @Post(':id/locations')
  @HttpCode(201)
  recordMove(
    @CurrentBaggageStaff() staff: BaggageStaff,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string,
    @Body() dto: RecordMoveDto,
  ): Promise<BagTrackingHistory> {
    return this.tracking.recordMove({ ...dto, foundBagId: id, staffId: staff.staffId })
  }
}
