import { randomUUID } from 'node:crypto'
import { BAG_TYPES, BAG_COLOURS, type BagType, type BagColour } from './common/baggage.constants'
import { BAGGAGE_ERROR_CODES, BaggageError } from './common/baggage.errors'
import { isValidBaggageTag } from './common/baggage-tag.util'
import { formatCaseNumber } from './common/case-number.util'
import type { LostBagReport } from './common/report.types'
import type { BookingVerification, CheckedBagLookup, ReportRepository, CaseNumberSequence, SimulationClock } from './common/report.ports'

export interface CreateReportInput {
  bookingReference: string
  surname: string
  passengerId: string
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
  constructor(
    private readonly repository: ReportRepository,
    private readonly bookings: BookingVerification,
    private readonly checkedBags: CheckedBagLookup,
    private readonly sequence: CaseNumberSequence,
    private readonly clock: SimulationClock,
  ) {}

  async create(input: CreateReportInput): Promise<LostBagReport> {
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

    const passenger = await this.bookings.verifyPassenger({
      bookingReference: input.bookingReference,
      surname: input.surname,
      passengerId: input.passengerId,
    })

    if (!passenger) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.INVALID_REPORT, 'Booking verification failed')
    }

    if (tagNumber) {
      const checkedBag = await this.checkedBags.findByTag(tagNumber)

      if (!checkedBag || checkedBag.bookingPassengerId !== passenger.bookingPassengerId) {
        throw new BaggageError(BAGGAGE_ERROR_CODES.TAG_NOT_ON_BOOKING, 'Baggage tag does not belong to this booking passenger')
      }
    }

    const reportedAt = this.clock.now()
    const nextNumber = await this.sequence.next()

    const report: LostBagReport = {
      id: randomUUID(),
      caseNumber: formatCaseNumber(reportedAt, nextNumber),
      bookingPassengerId: passenger.bookingPassengerId,
      passengerId: passenger.passengerId,
      flightId: passenger.flightId,
      reportedByCustomerId: null,
      reportedByStaffId: null,
      tagNumber,
      bagType: input.bagType,
      colour: input.colour,
      brand: input.brand?.trim() || null,
      description: input.description?.trim() || null,
      photoUrl: null,
      contactEmail,
      contactPhone,
      status: 'open',
      reportedAt,
      lostAt: null,
      closedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    return this.repository.create(report)
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

  async listMine(access: ReportAccessInput): Promise<LostBagReport[]> {
    const passenger = await this.bookings.verifyPassenger(access)

    if (!passenger) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.INVALID_REPORT, 'Booking verification failed')
    }

    return this.repository.listByBookingPassengerId(passenger.bookingPassengerId)
  }
}
