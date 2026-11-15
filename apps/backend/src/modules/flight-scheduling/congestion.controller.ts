import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards, UseFilters } from '@nestjs/common'
import { StaffGuard } from './operations/staff.guard'
import { CongestionService } from './congestion.service'
import { FlightErrorFilter } from './flight-error.filter'
import { withValue } from './dto/with-value'

// A window is recorded under its airport; windows are listed and removed by themselves.
@UseFilters(FlightErrorFilter)
@Controller('flight-scheduling')
export class CongestionController {
  constructor(private readonly congestionService: CongestionService) {}

  @Get('congestion')
  list(@Query() query: { airport?: string }) {
    return this.congestionService.list(query)
  }

  @UseGuards(StaffGuard)
  @Post('airports/:iata/congestion')
  create(@Param('iata') iata: string, @Body() body: unknown) {
    return this.congestionService.create(withValue(body, 'airport', iata))
  }

  @UseGuards(StaffGuard)
  @Delete('congestion/:id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.congestionService.remove(id)
  }
}
