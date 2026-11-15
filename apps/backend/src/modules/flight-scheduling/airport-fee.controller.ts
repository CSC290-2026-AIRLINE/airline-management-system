import { Body, Controller, Get, Param, Post, Put, UseGuards, UseFilters } from '@nestjs/common'
import { StaffGuard } from './operations/staff.guard'
import { AirportFeeService } from './airport-fee.service'
import { FlightErrorFilter } from './flight-error.filter'
import { withValue } from './dto/with-value'

// Fees are listed and created under their airport, and edited by their own id.
@UseFilters(FlightErrorFilter)
@Controller('flight-scheduling')
export class AirportFeeController {
  constructor(private readonly airportFeeService: AirportFeeService) {}

  @Get('airports/:iata/fees')
  list(@Param('iata') iata: string) {
    return this.airportFeeService.list({ airport: iata })
  }

  @UseGuards(StaffGuard)
  @Post('airports/:iata/fees')
  create(@Param('iata') iata: string, @Body() body: unknown) {
    return this.airportFeeService.create(withValue(body, 'airport', iata))
  }

  @UseGuards(StaffGuard)
  @Put('airport-fees/:id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.airportFeeService.update(id, body)
  }
}
