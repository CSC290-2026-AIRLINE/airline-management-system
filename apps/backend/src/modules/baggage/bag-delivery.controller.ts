import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import type { ValidationError } from '@nestjs/common'
import type { BagDelivery, BagDeliveryDetail } from './common/bag-delivery.types'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { HandOverBagDto, RecordDeliveryChoiceDto, SetDeliveryStatusDto } from './dto/bag-delivery.dto'
import { ListBagDeliveriesQuery } from './dto/list-bag-deliveries.query'
import { BaggageStaffGuard, CurrentBaggageStaff, type BaggageStaff } from './guards/baggage-staff.guard'
import { BagDeliveryService } from './bag-delivery.service'

function toValidationError(errors: ValidationError[]): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_DELIVERY, errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; '))
}

function notFound(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.DELIVERY_NOT_FOUND, 'Delivery not found')
}

/**
 * `/api/staff/bag-deliveries`: Deliveries. Confirmed bags on their way back to their owners, and the ownership check at
 * handover. Staff only.
 */
@Controller('staff/bag-deliveries')
@UseGuards(BaggageStaffGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: toValidationError }))
export class BagDeliveryController {
  constructor(private readonly deliveries: BagDeliveryService) {}

  /** Bags to send first, delivered last. */
  @Get()
  list(@Query() query: ListBagDeliveriesQuery): Promise<BagDelivery[]> {
    return this.deliveries.list(query)
  }

  /** One delivery with its ownership checks, newest first. */
  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string): Promise<BagDeliveryDetail> {
    return this.deliveries.getById(id)
  }

  /** Records how the passenger wants the bag back, until it is in transit (ALREADY_SENT after that). */
  @Put(':id/choice')
  recordChoice(
    @CurrentBaggageStaff() staff: BaggageStaff,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string,
    @Body() dto: RecordDeliveryChoiceDto,
  ): Promise<BagDeliveryDetail> {
    return this.deliveries.recordChoice({ ...dto, staffId: staff.staffId, userId: staff.id, deliveryId: id })
  }

  /** In transit or ready for pickup. Delivered is set by a handover. */
  @Post(':id/status')
  @HttpCode(200)
  setStatus(
    @CurrentBaggageStaff() staff: BaggageStaff,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string,
    @Body() dto: SetDeliveryStatusDto,
  ): Promise<BagDeliveryDetail> {
    return this.deliveries.setStatus({ ...dto, staffId: staff.staffId, deliveryId: id })
  }

  /** Checks the person collecting the bag against the case, then hands it over. A failed check answers OWNERSHIP_NOT_VERIFIED. */
  @Post(':id/hand-over')
  @HttpCode(200)
  handOver(
    @CurrentBaggageStaff() staff: BaggageStaff,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: notFound })) id: string,
    @Body() dto: HandOverBagDto,
  ): Promise<BagDeliveryDetail> {
    const { representativeName, note, documentChecked, ...identity } = dto
    return this.deliveries.handOver({
      staffId: staff.staffId,
      userId: staff.id,
      deliveryId: id,
      identity,
      documentChecked,
      representativeName,
      note,
    })
  }
}
