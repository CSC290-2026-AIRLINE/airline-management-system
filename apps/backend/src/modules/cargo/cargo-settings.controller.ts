import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UsePipes, ValidationPipe } from '@nestjs/common'
import { CargoSettingsService } from './cargo-settings.service'
import { CreateProhibitedItemDto } from './dto/create-prohibited-item.dto'
import { UpdateProhibitedItemDto } from './dto/update-prohibited-item.dto'
import { UpdateSettingsDto } from './dto/update-settings.dto'

// TODO: replace with a proper StaffCargoGuard once staff role guards exist
@Controller('staff/cargo')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class CargoSettingsController {
  constructor(private readonly svc: CargoSettingsService) {}

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
