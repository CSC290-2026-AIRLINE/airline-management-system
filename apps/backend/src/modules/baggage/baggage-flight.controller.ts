import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { BaggageFlightService, type BaggageFlight } from './baggage-flight.service'
import { BaggageStaffGuard } from './guards/baggage-staff.guard'

/** `/api/staff/baggage-flights`: read-only flight lookups for the found bag screens. Staff only. */
@Controller('staff/baggage-flights')
@UseGuards(BaggageStaffGuard)
export class BaggageFlightController {
  constructor(private readonly flights: BaggageFlightService) {}

  /** `?airport=BKK`: flights that landed there recently or are due soon, newest first. */
  @Get()
  arrivals(@Query('airport') airport: string): Promise<BaggageFlight[]> {
    return this.flights.arrivalsAt(airport)
  }

  /** `?from=BKK&to=HKT`: flights a found bag can be sent on, soonest first. Declared before `:id`. */
  @Get('departures')
  departures(@Query('from') from: string, @Query('to') to?: string): Promise<BaggageFlight[]> {
    return this.flights.departuresFrom(from, to)
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<BaggageFlight> {
    return this.flights.get(id)
  }
}
