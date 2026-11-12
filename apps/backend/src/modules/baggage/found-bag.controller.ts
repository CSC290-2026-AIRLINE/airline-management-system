import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import type { ValidationError } from '@nestjs/common'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import type { FoundBag, FoundBagListItem } from './common/found-bag.types'
import type { BagTrackingHistory } from './common/bag-location.types'
import { BagTrackingService } from './bag-tracking.service'
import { RecordMoveDto } from './dto/record-move.dto'
import { CompleteFoundBagDetailsDto } from './dto/complete-found-bag-details.dto'
import { FoundBagLifecycleService, type DiversionResult, type UnclaimedSweepResult } from './found-bag-lifecycle.service'
import { ListFoundBagsQuery } from './dto/list-found-bags.query'
import { RecordFoundBagDto } from './dto/record-found-bag.dto'
import { BaggageStaffGuard, CurrentBaggageStaff, baggageAuditActor, type BaggageStaff } from './guards/baggage-staff.guard'
import { FoundBagService } from './found-bag.service'
import { BagMatchingService } from './bag-matching.service'

function toValidationError(errors: ValidationError[]): FoundBagError {
  const tagError = errors.some((e) => e.property === 'tagNumber')
  const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}))

  return new FoundBagError(tagError ? FOUND_BAG_ERROR_CODES.INVALID_TAG : FOUND_BAG_ERROR_CODES.INVALID_FOUND_BAG, messages.join('; '))
}

function flightNotFound(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.FLIGHT_NOT_DIVERTED, 'Flight not found')
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
    private readonly lifecycle: FoundBagLifecycleService,
    private readonly matching: BagMatchingService,
  ) {}

  @Post()
  @HttpCode(201)
  record(@CurrentBaggageStaff() staff: BaggageStaff, @Body() dto: RecordFoundBagDto): Promise<FoundBag> {
    return this.service.record({ ...dto, staffId: staff.staffId })
  }

  /** Add a held found bag for every tagged bag in the hold of a diverted flight. Safe to call again. */
  @Post('diversions/:flightId')
  @HttpCode(201)
  async recordDiversion(
    @CurrentBaggageStaff() staff: BaggageStaff,
    @Param('flightId', new ParseUUIDPipe({ exceptionFactory: flightNotFound })) flightId: string,
  ): Promise<DiversionResult> {
    const result = await this.lifecycle.recordDiversion(flightId, baggageAuditActor(staff))
    await this.matching.suggestForFoundBags(result.created.map((bag) => bag.id))
    return result
  }

  /** Mark held bags past unclaimed_after_days with no confirmed match as unclaimed. */
  @Post('unclaimed-sweep')
  @HttpCode(200)
  markUnclaimed(@CurrentBaggageStaff() staff: BaggageStaff): Promise<UnclaimedSweepResult> {
    return this.lifecycle.markUnclaimed(baggageAuditActor(staff))
  }

  @Get()
  list(@Query() query: ListFoundBagsQuery): Promise<FoundBagListItem[]> {
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

  /** Add the type and colour of a diverted-flight bag after staff check it. */
  @Patch(':id')
  async completeDetails(
    @CurrentBaggageStaff() staff: BaggageStaff,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string,
    @Body() dto: CompleteFoundBagDetailsDto,
  ): Promise<FoundBag> {
    const bag = await this.lifecycle.completeDetails(staff.staffId, id, dto)
    // The type and colour can now give possible matches.
    await this.matching.suggestForFoundBags([bag.id])
    return bag
  }

  /** The diverted-flight bag stayed on board and flew on to its destination. */
  @Post(':id/continue-with-flight')
  @HttpCode(200)
  continueWithFlight(
    @CurrentBaggageStaff() staff: BaggageStaff,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string,
  ): Promise<FoundBag> {
    return this.lifecycle.continueWithFlight(staff.staffId, id)
  }
}
