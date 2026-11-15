import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Res, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import type { Response } from 'express'
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator'
import { StaffProfilesGuard } from '@backend/modules/passenger-profiles/staff-profiles.guard'
import { CargoDeskService } from './cargo-desk.service'

class AcceptanceDto {
  @IsNumber()
  @Min(0.1)
  measured_weight_kg!: number

  @IsNumber()
  @Min(0.001)
  measured_volume_m3!: number
}

class RejectionDto {
  @IsNumber()
  @Min(0.1)
  measured_weight_kg!: number

  @IsNumber()
  @Min(0.001)
  measured_volume_m3!: number

  @IsString()
  @IsNotEmpty()
  reason!: string
}

class PostEventDto {
  @IsString()
  @IsIn(['loaded', 'delivered', 'cancelled'])
  event!: string

  @IsOptional()
  @IsString()
  note?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

@Controller('staff/cargo')
@UseGuards(StaffProfilesGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class CargoDeskController {
  constructor(private readonly desk: CargoDeskService) {}

  @Get('bookings')
  listBookings(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') pageStr?: string,
    @Query('page_size') pageSizeStr?: string,
    @Query('flight_id') flightId?: string,
    @Query('ship_date') shipDate?: string,
    @Query('commodity_type_id') commodityTypeId?: string,
  ) {
    const page = Math.max(1, Number(pageStr) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeStr) || 20))
    return this.desk.listBookings({
      status: status || undefined,
      q: q || undefined,
      page,
      pageSize,
      flightId: flightId && UUID_RE.test(flightId) ? flightId : undefined,
      shipDate: shipDate && DATE_RE.test(shipDate) ? shipDate : undefined,
      commodityTypeId: commodityTypeId && UUID_RE.test(commodityTypeId) ? commodityTypeId : undefined,
    })
  }

  @Get('bookings/:id')
  getBookingDetail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.desk.getBookingDetail(id)
  }

  @Put('bookings/:id/acceptance')
  acceptBooking(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: AcceptanceDto) {
    return this.desk.acceptBooking(id, dto.measured_weight_kg, dto.measured_volume_m3)
  }

  @Post('bookings/:id/rejection')
  rejectBooking(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: RejectionDto) {
    return this.desk.rejectBooking(id, dto.measured_weight_kg, dto.measured_volume_m3, dto.reason)
  }

  @Post('bookings/:id/events')
  postEvent(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: PostEventDto) {
    return this.desk.postEvent(id, dto.event, dto.note)
  }

  @Get('flights')
  listFlightsWithCargo(@Query('from') from?: string, @Query('to') to?: string, @Query('route_id') routeId?: string) {
    const today = new Date().toISOString().slice(0, 10)
    return this.desk.listFlightsWithCargo(from || today, to || today, routeId && UUID_RE.test(routeId) ? routeId : undefined)
  }

  @Get('flights/:flightId')
  getFlightSummary(@Param('flightId', new ParseUUIDPipe()) flightId: string) {
    return this.desk.getFlightSummary(flightId)
  }

  @Get('flights/:flightId/manifest')
  async getFlightManifest(
    @Param('flightId', new ParseUUIDPipe()) flightId: string,
    @Query('format') format?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const manifest = await this.desk.getFlightManifest(flightId)
    if (format === 'csv' && res) {
      res.set('Content-Type', 'text/csv')
      res.set('Content-Disposition', `attachment; filename="manifest-${manifest.flightNumber}.csv"`)
      return this.desk.manifestToCsv(manifest)
    }
    return manifest
  }
}
