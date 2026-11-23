import { Controller, Get, Query, UseFilters, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import type { EligibleTraveller } from './common/report.ports'
import { BaggageErrorFilter } from './common/baggage-error.filter'
import { PassengerReportAccessQuery } from './dto/passenger-lost-report.dto'
import { BaggageCustomerGuard, CurrentBaggageCustomer, type BaggageCustomer } from './guards/baggage-customer.guard'
import { ReportService } from './report.service'

/**
 * "Whose bag is it?" (spec §2: a signed-in customer may report for anyone on their booking). The signed-in customer's
 * own passenger must pass the booking reference + surname check before any traveller is listed.
 */
@Controller('customer/lost-report-travellers')
@UseGuards(BaggageCustomerGuard)
@UseFilters(BaggageErrorFilter)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class PassengerLostReportTravellersController {
  constructor(private readonly reports: ReportService) {}

  @Get()
  list(@CurrentBaggageCustomer() customer: BaggageCustomer, @Query() query: PassengerReportAccessQuery): Promise<EligibleTraveller[]> {
    return this.reports.listEligibleTravellers({
      bookingReference: query.bookingReference,
      surname: query.surname,
      passengerId: customer.passengerId,
    })
  }
}
