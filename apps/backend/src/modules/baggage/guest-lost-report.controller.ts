import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Public } from '@backend/auth/decorators/public.decorator'
import { BagMatchingService } from './bag-matching.service'
import { BaggageErrorFilter } from './common/baggage-error.filter'
import type { BagColour, BagType, ReportStatus } from './common/baggage.constants'
import { CreateGuestLostReportDto } from './dto/guest-lost-report.dto'
import { GuestBookingLookupService, verificationFailed } from './guest-booking-lookup.service'
import { LOST_REPORT_PHOTO_MAX_BYTES, type UploadedLostReportPhoto } from './lost-report-photo.storage'
import { ReportService } from './report.service'

/** Same photo rules as the signed-in report (PassengerLostReportController): one optional JPEG or PNG up to 10 MB. */
const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png'])

/** All a guest gets back: enough for the success page, with no internal ids, contact details or photo reference. */
export interface GuestLostReportResult {
  caseNumber: string
  status: ReportStatus
  flightNumber: string
  serviceDate: string
  bagType: BagType
  colour: BagColour
  tagNumber: string | null
}

/**
 * Guest (no-account) lost bag report. Public on purpose; the signed-in customer routes keep their guards. Every request
 * re-verifies the booking reference + surname, the chosen traveller and the flight on the server; the report is then
 * created by the same code as a signed-in report (field rules, tag ownership, duplicate check, case number, photo
 * upload and cleanup), with no customer as reporter, and match suggestions run as for any new report.
 */
@Public()
@Controller('guest/lost-reports')
@UseFilters(BaggageErrorFilter)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class GuestLostReportController {
  constructor(
    private readonly lookup: GuestBookingLookupService,
    private readonly reports: ReportService,
    private readonly matching: BagMatchingService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
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
  async create(@Body() dto: CreateGuestLostReportDto, @UploadedFile() photo?: UploadedLostReportPhoto): Promise<GuestLostReportResult> {
    const traveller = await this.lookup.resolveGuestTraveller(dto)
    if (!traveller) throw verificationFailed()

    const report = await this.reports.createForVerifiedPassenger(
      { bookingPassengerId: traveller.bookingPassengerId, passengerId: traveller.passengerId, flightId: traveller.flightId },
      dto,
      null,
      photo,
    )
    await this.matching.suggestForReport(report.id)

    return {
      caseNumber: report.caseNumber,
      status: report.status,
      flightNumber: traveller.flightNumber,
      serviceDate: traveller.serviceDate,
      bagType: report.bagType,
      colour: report.colour,
      tagNumber: report.tagNumber,
    }
  }
}
