import { Body, Controller, HttpCode, HttpStatus, Post, UseFilters } from '@nestjs/common'
import { Public } from '@backend/auth/decorators/public.decorator'
import { BaggageErrorFilter } from './common/baggage-error.filter'
import { GuestBookingLookupService, type GuestEligibleFlight } from './guest-booking-lookup.service'

/**
 * Guest (no-account) lost bag reporting, step 1: find the booking. Public on purpose: a passenger without an account
 * proves the booking with its reference and surname, checked on the server. Read only, and separate from the signed-in
 * customer routes, which keep their guards. POST keeps the reference and surname out of URLs and access logs.
 */
@Public()
@Controller('guest/lost-report-flights')
@UseFilters(BaggageErrorFilter)
export class GuestLostReportFlightsController {
  constructor(private readonly lookup: GuestBookingLookupService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  list(@Body() body: unknown): Promise<GuestEligibleFlight[]> {
    return this.lookup.listEligibleFlights(body)
  }
}
