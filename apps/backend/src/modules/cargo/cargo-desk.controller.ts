import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
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
  ) {
    const page = Math.max(1, Number(pageStr) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeStr) || 20))
    return this.desk.listBookings({ status: status || undefined, q: q || undefined, page, pageSize })
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
}
