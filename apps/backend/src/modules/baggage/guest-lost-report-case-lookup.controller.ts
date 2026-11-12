import { Body, Controller, HttpCode, HttpStatus, Post, UseFilters } from '@nestjs/common'
import { Public } from '@backend/auth/decorators/public.decorator'
import { BaggageErrorFilter } from './common/baggage-error.filter'
import { GuestCaseLookupService, type GuestCaseSummary } from './guest-case-lookup.service'

/**
 * Guest (no-account) case tracking: case number + booking reference + surname, checked on the server against the case's
 * own bag owner. Public and read only; the signed-in case routes keep their guards. POST keeps the booking reference and
 * surname out of URLs and access logs. Production rate limiting is still a deployment dependency (see the PR notes).
 */
@Public()
@Controller('guest/lost-report-case-lookup')
@UseFilters(BaggageErrorFilter)
export class GuestLostReportCaseLookupController {
  constructor(private readonly cases: GuestCaseLookupService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  lookUp(@Body() body: unknown): Promise<GuestCaseSummary> {
    return this.cases.lookUp(body)
  }
}
