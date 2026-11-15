import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import { Public } from '@backend/auth/decorators/public.decorator'
import { CargoClaimsService } from './cargo-claims.service'
import { CargoCustomerService } from './cargo-customer.service'

class QuoteDto {
  @IsString()
  @IsNotEmpty()
  route_id!: string

  @IsString()
  @IsNotEmpty()
  ship_date!: string

  @IsString()
  @IsNotEmpty()
  commodity_type_id!: string

  @IsInt()
  @Min(1)
  pieces!: number

  @IsNumber()
  @Min(0.01)
  weight_kg!: number

  @IsNumber()
  @Min(0.01)
  volume_m3!: number

  @IsString()
  @IsNotEmpty()
  description!: string

  @IsOptional()
  @IsString()
  un_number?: string
}

class CreateBookingDto extends QuoteDto {
  @IsString()
  @IsNotEmpty()
  shipper_company!: string

  @IsOptional()
  @IsString()
  shipper_phone?: string

  @IsString()
  @IsNotEmpty()
  consignee_name!: string

  @IsString()
  @IsNotEmpty()
  consignee_address!: string

  @IsOptional()
  @IsString()
  consignee_phone?: string
}

class FileClaimDto {
  @IsString()
  @IsIn(['damage', 'loss'])
  claim_type!: string

  @IsInt()
  @Min(1)
  pieces_affected!: number

  @IsString()
  @IsNotEmpty()
  description!: string

  @IsNumber()
  @Min(0.01)
  claimed_amount!: number
}

@Controller('cargo')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class CargoCustomerController {
  constructor(
    private readonly svc: CargoCustomerService,
    private readonly claims: CargoClaimsService,
  ) {}

  // ── Routes and commodity types ────────────────────────────────────

  @Get('routes')
  listRoutes() {
    return this.svc.listRoutes()
  }

  @Get('commodity-types')
  listCommodityTypes() {
    return this.svc.listCommodityTypes()
  }

  @Get('routes/:routeId/ship-dates')
  async getShipDates(@Param('routeId', new ParseUUIDPipe()) routeId: string, @Query('weight_kg') weightKgStr?: string) {
    const weightKg = weightKgStr ? Number(weightKgStr) : undefined
    return this.svc.getShipDates(routeId, weightKg)
  }

  @Get('routes/:routeId/flights')
  async getRouteFlights(@Param('routeId', new ParseUUIDPipe()) routeId: string, @Query('date') date: string) {
    return this.svc.getRouteFlights(routeId, date)
  }

  @Get('settings')
  async getSettings() {
    return this.svc.getSettings()
  }

  @Public()
  @Get('settings/public')
  async getPublicSettings() {
    return this.svc.getSettings()
  }

  // ── Quotes and bookings ───────────────────────────────────────────

  @Post('quotes')
  async getQuote(@Body() dto: QuoteDto) {
    return this.svc.getQuote({
      routeId: dto.route_id,
      shipDate: dto.ship_date,
      commodityTypeId: dto.commodity_type_id,
      pieces: dto.pieces,
      declaredWeightKg: dto.weight_kg,
      declaredVolumeM3: dto.volume_m3,
      goodsDescription: dto.description,
      unNumber: dto.un_number,
    })
  }

  @Post('bookings')
  async createBooking(@Body() dto: CreateBookingDto, @CurrentUser() user: { id: string }) {
    const customerId = await this.svc.resolveCustomerId(user.id)
    return this.svc.createBooking(customerId, {
      routeId: dto.route_id,
      shipDate: dto.ship_date,
      commodityTypeId: dto.commodity_type_id,
      pieces: dto.pieces,
      declaredWeightKg: dto.weight_kg,
      declaredVolumeM3: dto.volume_m3,
      goodsDescription: dto.description,
      unNumber: dto.un_number,
      shipperName: dto.shipper_company,
      shipperPhone: dto.shipper_phone,
      consigneeName: dto.consignee_name,
      consigneeAddress: dto.consignee_address,
      consigneePhone: dto.consignee_phone,
    })
  }

  @Get('bookings')
  async listMyBookings(
    @CurrentUser() user: { id: string },
    @Query('status') status?: string,
    @Query('page') pageStr?: string,
    @Query('page_size') pageSizeStr?: string,
  ) {
    const customerId = await this.svc.resolveCustomerId(user.id)
    const page = Math.max(1, Number(pageStr) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeStr) || 20))
    return this.svc.listMyBookings(customerId, { status: status || undefined, page, pageSize })
  }

  @Get('bookings/:id')
  async getMyBooking(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: { id: string }) {
    const customerId = await this.svc.resolveCustomerId(user.id)
    return this.svc.getMyBooking(customerId, id)
  }

  @Delete('bookings/:id')
  async cancelMyBooking(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: { id: string }) {
    const customerId = await this.svc.resolveCustomerId(user.id)
    return this.svc.cancelMyBooking(customerId, id)
  }

  // ── Track ─────────────────────────────────────────────────────────

  @Get('track')
  async trackBooking(@CurrentUser() user: { id: string }, @Query('ref') ref?: string, @Query('awb') awb?: string) {
    const customerId = await this.svc.resolveCustomerId(user.id)
    return this.svc.trackBooking(customerId, { ref: ref || undefined, awb: awb || undefined })
  }

  // ── Claims ────────────────────────────────────────────────────────

  @Get('claims/claimable')
  async listClaimable(@CurrentUser() user: { id: string }) {
    const customerId = await this.svc.resolveCustomerId(user.id)
    return this.svc.listClaimable(customerId)
  }

  @Post('bookings/:id/claims')
  async fileClaim(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: FileClaimDto, @CurrentUser() user: { id: string }) {
    const customerId = await this.svc.resolveCustomerId(user.id)
    return this.claims.fileClaim(id, customerId, {
      claim_type: dto.claim_type,
      pieces_affected: dto.pieces_affected,
      description: dto.description,
      claimed_amount: dto.claimed_amount,
    })
  }

  @Get('claims')
  async listMyClaims(@CurrentUser() user: { id: string }, @Query('page') pageStr?: string, @Query('page_size') pageSizeStr?: string) {
    const customerId = await this.svc.resolveCustomerId(user.id)
    const page = Math.max(1, Number(pageStr) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeStr) || 20))
    const offset = (page - 1) * pageSize

    const claims = await this.claims.listCustomerClaims(customerId, { offset, limit: pageSize })

    return {
      data: claims.data,
      page,
      pageSize,
      total: claims.total,
      totalPages: Math.ceil(claims.total / pageSize),
    }
  }

  // ── Notices ───────────────────────────────────────────────────────

  @Get('notices')
  async listMyNotices(
    @CurrentUser() user: { id: string },
    @Query('unread') unreadStr?: string,
    @Query('page') pageStr?: string,
    @Query('page_size') pageSizeStr?: string,
  ) {
    const customerId = await this.svc.resolveCustomerId(user.id)
    const page = Math.max(1, Number(pageStr) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeStr) || 20))
    const unread = unreadStr === 'true' ? true : unreadStr === 'false' ? false : undefined
    return this.svc.listMyNotices(customerId, { unread, page, pageSize })
  }

  @Put('notices/:id')
  async markNoticeRead(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: { id: string }) {
    const customerId = await this.svc.resolveCustomerId(user.id)
    return this.svc.markNoticeRead(customerId, id)
  }

  @Post('notices/read-all')
  async markAllNoticesRead(@CurrentUser() user: { id: string }) {
    const customerId = await this.svc.resolveCustomerId(user.id)
    return this.svc.markAllNoticesRead(customerId)
  }
}
