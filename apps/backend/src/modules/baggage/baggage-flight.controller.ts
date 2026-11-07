import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import type { ValidationError } from '@nestjs/common'
import { BaggageFlightService, type BaggageFlight } from './baggage-flight.service'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { ArrivalsQuery, DeparturesQuery } from './dto/baggage-flight.query'
import { BaggageStaffGuard } from './guards/baggage-staff.guard'

function toValidationError(errors: ValidationError[]): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_FOUND_BAG, errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; '))
}

function flightNotFound(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.FLIGHT_NOT_FOUND, 'Flight not found')
}

/** `/api/staff/baggage-flights`: read-only flight lookups for the found bag screens. Staff only. */
@Controller('staff/baggage-flights')
@UseGuards(BaggageStaffGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: toValidationError }))
export class BaggageFlightController {
  constructor(private readonly flights: BaggageFlightService) {}

  /** `?airport=BKK`: flights that landed there recently or are due soon, newest first. */
  @Get()
  arrivals(@Query() query: ArrivalsQuery): Promise<BaggageFlight[]> {
    return this.flights.arrivalsAt(query.airport)
  }

  /** `?from=BKK&to=HKT`: flights a found bag can be sent on, soonest first. Declared before `:id`. */
  @Get('departures')
  departures(@Query() query: DeparturesQuery): Promise<BaggageFlight[]> {
    return this.flights.departuresFrom(query.from, query.to)
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe({ exceptionFactory: flightNotFound })) id: string): Promise<BaggageFlight> {
    return this.flights.get(id)
  }
}
