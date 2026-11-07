import { Body, Controller, Get, HttpCode, Param, Post, Query, UseFilters, UseGuards, UsePipes, ValidationPipe, Patch } from '@nestjs/common'
import type { DeliveryChoiceResult } from './bag-delivery.service'
import { ReportService } from './report.service'
import type { LostBagReport } from './common/report.types'
import { BaggageCustomerGuard, CurrentBaggageCustomer, type BaggageCustomer } from './guards/baggage-customer.guard'
import { CreatePassengerLostReportDto, PassengerReportAccessQuery } from './dto/passenger-lost-report.dto'
import { PassengerDeliveryChoiceDto } from './dto/passenger-delivery-choice.dto'
import { BaggageErrorFilter } from './common/baggage-error.filter'
import { PassengerDeliveryChoiceService } from './passenger-delivery-choice.service'

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
  ) {}

  @Post()
  @HttpCode(201)
  create(@CurrentBaggageCustomer() customer: BaggageCustomer, @Body() dto: CreatePassengerLostReportDto): Promise<LostBagReport> {
    return this.reports.create({
      ...dto,
      passengerId: customer.passengerId,
      reportedByCustomerId: customer.customerId,
    })
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
