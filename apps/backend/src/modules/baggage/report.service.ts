import { Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { BAG_TYPES, BAG_COLOURS, type BagType, type BagColour } from './common/baggage.constants'
import { BAGGAGE_ERROR_CODES, BaggageError } from './common/baggage.errors'
import { isValidBaggageTag } from './common/baggage-tag.util'
import { formatCaseNumber } from './common/case-number.util'
import type { LostBagReport } from './common/report.types'
import type { LostReportPhotoObject, ReportPhotoStorage, UploadedLostReportPhoto } from './lost-report-photo.storage'
import type {
  BookingVerification,
  CheckedBagLookup,
  DeliveryChoiceSnapshot,
  EligibleTraveller,
  VerifiedReportFlight,
  ReportRepository,
  CaseNumberSequence,
  SimulationClock,
} from './common/report.ports'

export interface CreateReportInput {
  reportedByCustomerId?: string
  flightId: string
  bookingReference: string
  surname: string
  passengerId: string
  /**
   * "Whose bag is it?": the booking passenger whose bag is lost, when it is not the signed-in customer's own. Omitted or
   * null means the reporter's own bag (the original flow). Never trusted on its own: it must resolve on the reporter's
   * verified booking with a confirmed coupon for flightId.
   */
  bookingPassengerId?: string | null
  tagNumber?: string | null
  bagType: BagType
  colour: BagColour
  brand?: string | null
  description?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
}

export interface ReportAccessInput {
  bookingReference: string
  surname: string
  passengerId: string
}

export class ReportService {
  private readonly logger = new Logger(ReportService.name)

  constructor(
    private readonly repository: ReportRepository,
    private readonly bookings: BookingVerification,
    private readonly checkedBags: CheckedBagLookup,
    private readonly sequence: CaseNumberSequence,
    private readonly clock: SimulationClock,
    private readonly photos: ReportPhotoStorage,
  ) {}

  async create(input: CreateReportInput, photo?: UploadedLostReportPhoto): Promise<LostBagReport> {
    const contactEmail = input.contactEmail?.trim() || null
    const contactPhone = input.contactPhone?.trim() || null
    const tagNumber = input.tagNumber?.trim() || null

    if (!contactEmail || !contactPhone) {
      // At least one contact method is required.
      if (!contactEmail && !contactPhone) {
        throw new BaggageError(BAGGAGE_ERROR_CODES.INVALID_REPORT, 'Email or phone is required')
      }
    }

    if (!BAG_TYPES.some((type) => type === input.bagType) || !BAG_COLOURS.some((colour) => colour === input.colour)) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.INVALID_REPORT, 'Invalid bag type or colour')
    }

    if (tagNumber && !isValidBaggageTag(tagNumber)) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.INVALID_TAG, 'Invalid baggage tag number')
    }

    // The bag owner. Own bag: the reporter, verified as before. Another traveller: resolved only on the reporter's own
    // verified booking. Either way a failure gets the same generic error, and the tag/duplicate checks below apply to
    // the bag owner.
    const passenger =
      input.bookingPassengerId == null
        ? await this.bookings.verifyPassenger({
            bookingReference: input.bookingReference,
            surname: input.surname,
            passengerId: input.passengerId,
            flightId: input.flightId,
          })
        : await this.bookings.resolveTraveller({
            bookingReference: input.bookingReference,
            surname: input.surname,
            passengerId: input.passengerId,
            bookingPassengerId: input.bookingPassengerId,
            flightId: input.flightId,
          })

    if (!passenger) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.INVALID_REPORT, 'Booking verification failed')
    }

    if (tagNumber) {
      const checkedBag = await this.checkedBags.findByTag(tagNumber)

      if (!checkedBag || checkedBag.bookingPassengerId !== passenger.bookingPassengerId || checkedBag.flightId !== passenger.flightId) {
        throw new BaggageError(BAGGAGE_ERROR_CODES.TAG_NOT_ON_BOOKING, 'Baggage tag does not belong to this passenger and flight')
      }
    }

    const reportedAt = this.clock.now()
    const nextNumber = await this.sequence.next()
    const caseNumber = formatCaseNumber(reportedAt, nextNumber)

    const report: LostBagReport = {
      id: randomUUID(),
      caseNumber,
      bookingPassengerId: passenger.bookingPassengerId,
      passengerId: passenger.passengerId,
      flightId: passenger.flightId,
      reportedByCustomerId: input.reportedByCustomerId ?? null,
      reportedByStaffId: null,
      tagNumber,
      bagType: input.bagType,
      colour: input.colour,
      brand: input.brand?.trim() || null,
      description: input.description?.trim() || null,
      photoUrl: photo ? this.photoPath(caseNumber) : null,
      contactEmail,
      contactPhone,
      status: 'open',
      reportedAt,
      lostAt: null,
      closedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    if (photo) await this.photos.upload(report.id, photo)

    try {
      return await this.repository.create(report)
    } catch (error) {
      if (photo) {
        try {
          await this.photos.remove(report.id)
        } catch {
          this.logger.error(`Failed to clean up lost-baggage photo for report ${report.id}`)
        }
      }
      throw error
    }
  }

  async getByCaseNumber(caseNumber: string, access: ReportAccessInput): Promise<LostBagReport> {
    const passenger = await this.bookings.verifyPassenger(access)

    if (!passenger) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.INVALID_REPORT, 'Booking verification failed')
    }

    const report = await this.repository.findByCaseNumber(caseNumber)

    if (!report || report.bookingPassengerId !== passenger.bookingPassengerId) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.REPORT_NOT_FOUND, 'Lost baggage report not found')
    }

    return report
  }

  async getPhotoForCaseNumber(caseNumber: string, access: ReportAccessInput, customerId: string): Promise<LostReportPhotoObject> {
    const report = await this.getByCaseNumber(caseNumber, access)

    if (report.reportedByCustomerId !== customerId || !report.photoUrl) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.REPORT_NOT_FOUND, 'Lost baggage report not found')
    }

    return this.photos.retrieve(report.id)
  }

  async getDeliveryIdForCaseNumber(caseNumber: string, access: ReportAccessInput): Promise<string | null> {
    const report = await this.getByCaseNumber(caseNumber, access)

    return this.repository.findDeliveryIdByReportId(report.id)
  }

  async getDeliveryChoiceForCaseNumber(caseNumber: string, access: ReportAccessInput): Promise<DeliveryChoiceSnapshot | null> {
    const report = await this.getByCaseNumber(caseNumber, access)

    return this.repository.findDeliveryChoiceByReportId(report.id)
  }

  async listMine(access: ReportAccessInput): Promise<LostBagReport[]> {
    const passenger = await this.bookings.verifyPassenger(access)

    if (!passenger) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.INVALID_REPORT, 'Booking verification failed')
    }

    return this.repository.listByBookingPassengerId(passenger.bookingPassengerId)
  }

  listConfirmedFlights(access: ReportAccessInput): Promise<VerifiedReportFlight[]> {
    return this.bookings.listConfirmedFlights(access)
  }

  /**
   * "Whose bag is it?": the travellers on the requester's booking. A verified requester always sees at least themselves,
   * so an empty result means verification failed; it gets the same error as every other passenger call.
   */
  async listEligibleTravellers(access: ReportAccessInput): Promise<EligibleTraveller[]> {
    const travellers = await this.bookings.listEligibleTravellers(access)

    if (travellers.length === 0) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.INVALID_REPORT, 'Booking verification failed')
    }

    return travellers
  }

  async cancel(caseNumber: string, access: ReportAccessInput): Promise<LostBagReport> {
    const passenger = await this.bookings.verifyPassenger(access)

    if (!passenger) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.INVALID_REPORT, 'Booking verification failed')
    }

    const report = await this.repository.findByCaseNumber(caseNumber)

    if (!report || report.bookingPassengerId !== passenger.bookingPassengerId) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.REPORT_NOT_FOUND, 'Lost baggage report not found')
    }

    const cancelled = await this.repository.cancelIfNotDispatched(report.id, passenger.bookingPassengerId, this.clock.now())

    if (!cancelled) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.CANCELLATION_NOT_ALLOWED, 'This report can no longer be cancelled')
    }

    return cancelled
  }

  private photoPath(caseNumber: string): string {
    return `/api/customer/lost-reports/${caseNumber}/photo`
  }
}
