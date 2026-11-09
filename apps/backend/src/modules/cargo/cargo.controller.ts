import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UsePipes, ValidationPipe } from '@nestjs/common'
import { CargoService } from './cargo.service'
import { CreateCommodityTypeDto } from './dto/create-commodity-type.dto'
import { UpdateCommodityTypeDto } from './dto/update-commodity-type.dto'
import { CreateRateDto } from './dto/create-rate.dto'
import { UpdateRateDto } from './dto/update-rate.dto'

// TODO: replace with a proper StaffCargoGuard once staff role guards exist
@Controller('staff/cargo')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class CargoController {
  constructor(private readonly svc: CargoService) {}

  // ── Commodity Types ───────────────────────────────────────────────

  @Get('commodity-types')
  listCommodityTypes() {
    return this.svc.listCommodityTypes()
  }

  @Post('commodity-types')
  createCommodityType(@Body() dto: CreateCommodityTypeDto) {
    return this.svc.createCommodityType(dto)
  }

  @Put('commodity-types/:id')
  updateCommodityType(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateCommodityTypeDto) {
    return this.svc.updateCommodityType(id, dto)
  }

  // ── Rates ─────────────────────────────────────────────────────────

  @Get('rates')
  listRates() {
    return this.svc.listRates()
  }

  @Post('rates')
  createRate(@Body() dto: CreateRateDto) {
    return this.svc.createRate(dto)
  }

  @Put('rates/:id')
  updateRate(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateRateDto) {
    return this.svc.updateRate(id, dto)
  }
}
