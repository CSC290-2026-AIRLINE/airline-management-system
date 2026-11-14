import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import { StaffProfilesGuard } from '@backend/modules/passenger-profiles/staff-profiles.guard'
import { CargoDeskService } from './cargo-desk.service'

@Controller('staff/cargo')
@UseGuards(StaffProfilesGuard)
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
}
