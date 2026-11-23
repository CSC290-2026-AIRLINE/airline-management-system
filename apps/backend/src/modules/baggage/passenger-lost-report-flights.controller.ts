import { Controller, Get, Query, UseFilters, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import type { VerifiedReportFlight } from './common/report.ports'
import { BaggageErrorFilter } from './common/baggage-error.filter'
import { PassengerReportAccessQuery } from './dto/passenger-lost-report.dto'
import { BaggageCustomerGuard, CurrentBaggageCustomer, type BaggageCustomer } from './guards/baggage-customer.guard'
import { ReportService } from './report.service'

@Controller('customer/lost-report-flights')
@UseGuards(BaggageCustomerGuard)
@UseFilters(BaggageErrorFilter)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class PassengerLostReportFlightsController {
  constructor(private readonly reports: ReportService) {}

  @Get()
  list(@CurrentBaggageCustomer() customer: BaggageCustomer, @Query() query: PassengerReportAccessQuery): Promise<VerifiedReportFlight[]> {
    return this.reports.listConfirmedFlights({
      ...query,
      passengerId: customer.passengerId,
    })
  }
}
