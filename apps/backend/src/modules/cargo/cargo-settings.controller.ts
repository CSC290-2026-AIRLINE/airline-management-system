import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import { CargoStaffGuard } from './guards/cargo-staff.guard'
import { IsNotEmpty, IsString } from 'class-validator'
import { CargoOperationsService } from './cargo-operations.service'
import { CargoSettingsService } from './cargo-settings.service'
import { CreateProhibitedItemDto } from './dto/create-prohibited-item.dto'
import { UpdateProhibitedItemDto } from './dto/update-prohibited-item.dto'
import { UpdateSettingsDto } from './dto/update-settings.dto'

class CreateHandlingConflictDto {
  @IsString()
  @IsNotEmpty()
  handling_class_a!: string

  @IsString()
  @IsNotEmpty()
  handling_class_b!: string

  @IsString()
  @IsNotEmpty()
  reason!: string
}

@Controller('staff/cargo')
@UseGuards(CargoStaffGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class CargoSettingsController {
  constructor(
    private readonly svc: CargoSettingsService,
    private readonly ops: CargoOperationsService,
  ) {}

  // ── Handling conflicts (stretch) ──────────────────────────────────

  @Get('handling-conflicts')
  listHandlingConflicts() {
    return this.ops.listHandlingConflicts()
  }

  @Post('handling-conflicts')
  addHandlingConflict(@Body() dto: CreateHandlingConflictDto) {
    return this.ops.addHandlingConflict(dto.handling_class_a, dto.handling_class_b, dto.reason)
  }

  // ── Prohibited Items ──────────────────────────────────────────────

  @Get('prohibited-items')
  listProhibitedItems() {
    return this.svc.listProhibitedItems()
  }

  @Post('prohibited-items')
  createProhibitedItem(@Body() dto: CreateProhibitedItemDto) {
    return this.svc.createProhibitedItem(dto)
  }

  @Put('prohibited-items/:id')
  updateProhibitedItem(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateProhibitedItemDto) {
    return this.svc.updateProhibitedItem(id, dto)
  }

  // ── Settings ──────────────────────────────────────────────────────

  @Get('settings')
  listSettings() {
    return this.svc.listSettings()
  }

  @Put('settings')
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.svc.updateSettings(dto)
  }
}
