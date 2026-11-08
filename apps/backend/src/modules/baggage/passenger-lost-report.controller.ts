import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
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
import { LOST_REPORT_PHOTO_MAX_BYTES, type UploadedLostReportPhoto } from './lost-report-photo.storage'

const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png'])

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
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: LOST_REPORT_PHOTO_MAX_BYTES },
      fileFilter: (_request, file, callback) => {
        if (!PHOTO_MIME_TYPES.has(file.mimetype)) {
          callback(new BadRequestException('Choose a JPG or PNG image.'), false)
          return
        }
        callback(null, true)
      },
    }),
  )
  async create(
    @CurrentBaggageCustomer() customer: BaggageCustomer,
    @Body() dto: CreatePassengerLostReportDto,
    @UploadedFile() photo?: UploadedLostReportPhoto,
  ): Promise<LostBagReport> {
    const report = await this.reports.create(
      {
        ...dto,
        passengerId: customer.passengerId,
        reportedByCustomerId: customer.customerId,
      },
      photo,
    )

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

  @Get(':caseNumber/photo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async getPhoto(
    @CurrentBaggageCustomer() customer: BaggageCustomer,
    @Param('caseNumber') caseNumber: string,
    @Query() query: PassengerReportAccessQuery,
  ): Promise<StreamableFile> {
    const photo = await this.reports.getPhotoForCaseNumber(caseNumber, { ...query, passengerId: customer.passengerId }, customer.customerId)
    const extension = photo.contentType === 'image/png' ? 'png' : 'jpg'
    return new StreamableFile(photo.body, {
      type: photo.contentType,
      disposition: `inline; filename="lost-baggage-photo.${extension}"`,
      length: photo.contentLength,
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
