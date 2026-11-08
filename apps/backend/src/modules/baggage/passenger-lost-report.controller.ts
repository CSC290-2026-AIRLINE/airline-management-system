import { Body, Controller, Get, HttpCode, Param, Post, Query, UseFilters, UseGuards, UsePipes, ValidationPipe, Patch } from '@nestjs/common'
import type { DeliveryChoiceResult } from './bag-delivery.service'
import { ReportService } from './report.service'
import type { LostBagReport } from './common/report.types'
import type { DeliveryChoiceSnapshot } from './common/report.ports'
import { BaggageCustomerGuard, CurrentBaggageCustomer, type BaggageCustomer } from './guards/baggage-customer.guard'
import { CreatePassengerLostReportDto, PassengerReportAccessQuery } from './dto/passenger-lost-report.dto'
import { PassengerDeliveryChoiceDto } from './dto/passenger-delivery-choice.dto'
import { BaggageErrorFilter } from './common/baggage-error.filter'
import { PassengerDeliveryChoiceService } from './passenger-delivery-choice.service'
import { PassengerCaseSummaryService } from './passenger-case-summary.service'
import type { PassengerCaseSummary } from './common/passenger-case-summary.types'
import { BagMatchingService } from './bag-matching.service'

@Controller('customer/lost-reports')
@UseGuards(BaggageCustomerGuard)
@UseFilters(BaggageErrorFilter)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class PassengerLostReportController {
  constructor(
    private readonly reports: ReportService,
    private readonly deliveryChoices: PassengerDeliveryChoiceService,
    private readonly caseSummaries: PassengerCaseSummaryService,
    private readonly matching: BagMatchingService,
  ) {}

  @Post()
  @HttpCode(201)
  async create(@CurrentBaggageCustomer() customer: BaggageCustomer, @Body() dto: CreatePassengerLostReportDto): Promise<LostBagReport> {
    const report = await this.reports.create({
      ...dto,
      passengerId: customer.passengerId,
      reportedByCustomerId: customer.customerId,
    })

    await this.matching.suggestForReport(report.id)

    return report
  }

  @Get()
  list(@CurrentBaggageCustomer() customer: BaggageCustomer, @Query() query: PassengerReportAccessQuery): Promise<LostBagReport[]> {
    return this.reports.listMine({
      ...query,
      passengerId: customer.passengerId,
    })
  }

  @Get(':caseNumber')
  getByCaseNumber(
    @CurrentBaggageCustomer() customer: BaggageCustomer,
    @Param('caseNumber') caseNumber: string,
    @Query() query: PassengerReportAccessQuery,
  ): Promise<LostBagReport> {
    return this.reports.getByCaseNumber(caseNumber, {
      ...query,
      passengerId: customer.passengerId,
    })
  }

  @Get(':caseNumber/summary')
  getCaseSummary(
    @CurrentBaggageCustomer() customer: BaggageCustomer,
    @Param('caseNumber') caseNumber: string,
    @Query() query: PassengerReportAccessQuery,
  ): Promise<PassengerCaseSummary> {
    return this.caseSummaries.getByCaseNumber(caseNumber, {
      ...query,
      passengerId: customer.passengerId,
    })
  }

  @Get(':caseNumber/delivery-choice')
  getDeliveryChoice(
    @CurrentBaggageCustomer() customer: BaggageCustomer,
    @Param('caseNumber') caseNumber: string,
    @Query() query: PassengerReportAccessQuery,
  ): Promise<DeliveryChoiceSnapshot> {
    return this.deliveryChoices.getChoice(caseNumber, {
      ...query,
      passengerId: customer.passengerId,
    })
  }

  @Patch(':caseNumber/delivery-choice')
  saveDeliveryChoice(
    @CurrentBaggageCustomer() customer: BaggageCustomer,
    @Param('caseNumber') caseNumber: string,
    @Query() query: PassengerReportAccessQuery,
    @Body() dto: PassengerDeliveryChoiceDto,
  ): Promise<DeliveryChoiceResult> {
    return this.deliveryChoices.saveChoice(
      caseNumber,
      {
        ...query,
        passengerId: customer.passengerId,
      },
      {
        customerId: customer.customerId,
        userId: customer.id,
      },
      dto,
    )
  }

  @Patch(':caseNumber/cancel')
  cancel(
    @CurrentBaggageCustomer() customer: BaggageCustomer,
    @Param('caseNumber') caseNumber: string,
    @Query() query: PassengerReportAccessQuery,
  ): Promise<LostBagReport> {
    return this.reports.cancel(caseNumber, {
      ...query,
      passengerId: customer.passengerId,
    })
  }
}
