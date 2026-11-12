import { Body, Controller, HttpCode, HttpStatus, Post, UseFilters } from '@nestjs/common'
import { Public } from '@backend/auth/decorators/public.decorator'
import { BaggageErrorFilter } from './common/baggage-error.filter'
import { GuestBookingLookupService, type GuestTravellerOption } from './guest-booking-lookup.service'

/**
 * Guest (no-account) lost bag reporting, "Whose bag is it?": the passengers on the booking whose surname matches, with
 * their confirmed flights, after a server-side reference + surname check. Public and read only, like the guest flight
 * lookup; the signed-in customer routes keep their guards. POST keeps the reference and surname out of URLs and logs.
 */
@Public()
@Controller('guest/lost-report-travellers')
@UseFilters(BaggageErrorFilter)
export class GuestLostReportTravellersController {
  constructor(private readonly lookup: GuestBookingLookupService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  list(@Body() body: unknown): Promise<GuestTravellerOption[]> {
    return this.lookup.listEligibleTravellers(body)
  }
}
