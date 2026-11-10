import { Inject, Injectable } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { AuditService, type AuditActor } from '@backend/modules/admin-console/audit/audit.service'
import {
  AUDIT_SOURCE_FEATURE,
  BAG_COLOURS,
  MAX_LIST_ROWS,
  BAG_TYPES,
  type BagColour,
  type BagType,
  type ReportStatus,
} from './common/baggage.constants'
import { isValidBaggageTag } from './common/baggage-tag.util'
import { CASE_NUMBER_PATTERN, formatCaseNumber } from './common/case-number.util'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { FOUND_BAG_CLOCK, type FoundBagClock } from './common/found-bag.ports'
import type { BookingLookup, LostReportCase } from './common/lost-report.types'
import { UUID_PATTERN, prismaErrorCode } from './common/patterns'

/** Same rule as the CHECK on booking.booking_reference. */
export const BOOKING_REFERENCE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/

/** Report statuses that hold the one live case per tag (lost_bag_report_open_tag_uq). */
const LIVE_REPORT_STATUSES: ReportStatus[] = ['open', 'matched', 'delivering', 'lost']

export interface DeskReportInput {
  staffId: string
  bookingReference: string
  passengerId: string
  flightId: string
  bagType: BagType
  colour: BagColour
  tagNumber?: string | null
  brand?: string | null
  description?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
}

export interface FoundBagReportInput {
  staffId: string
  foundBagId: string
  description?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
}

export interface LostReportFilter {
  status?: ReportStatus
  flightId?: string
  tagNumber?: string
  caseNumber?: string
}

/** What a new report needs once the passenger, flight and bag are known. */
interface NewReport {
  staffId: string
  bookingPassengerId: string
  passengerId: string
  flightId: string
  tagNumber: string | null
  bagType: BagType
  colour: BagColour
  brand: string | null
  description: string | null
  contactEmail: string
  contactPhone: string | null
}

const REPORT_INCLUDE = {
  passenger: { select: { first_name: true, last_name: true } },
  flight: {
    select: { flight_number: true, service_date: true, actual_destination: true, route: { select: { origin: true, destination: true } } },
  },
  booking_coupon: { select: { booking_passenger: { select: { booking: { select: { booking_reference: true } } } } } },
} satisfies Prisma.lost_bag_reportInclude

type ReportRow = Prisma.lost_bag_reportGetPayload<{ include: typeof REPORT_INCLUDE }>

export function toLostReportCase(row: ReportRow): LostReportCase {
  return {
    id: row.id,
    caseNumber: row.case_number,
    bookingPassengerId: row.booking_passenger_id,
    passengerId: row.passenger_id,
    flightId: row.flight_id,
    bookingReference: row.booking_coupon.booking_passenger.booking.booking_reference,
    passengerFirstName: row.passenger.first_name,
    passengerLastName: row.passenger.last_name,
    flightNumber: row.flight.flight_number,
    flightDate: row.flight.service_date,
    flightOrigin: row.flight.route.origin,
    flightDestination: row.flight.actual_destination ?? row.flight.route.destination,
    reportedByCustomerId: row.reported_by_customer_id,
    reportedByStaffId: row.reported_by_staff_id,
    tagNumber: row.tag_number,
    bagType: row.bag_type as BagType,
    colour: row.colour as BagColour,
    brand: row.brand,
    description: row.description,
    photoUrl: row.photo_url,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    status: row.status as ReportStatus,
    reportedAt: row.reported_at,
    lostAt: row.lost_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function invalid(message: string): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_REPORT, message)
}

function reportExists(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.REPORT_EXISTS, 'This bag tag already has a live lost bag case')
}

function bookingNotFound(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.BOOKING_NOT_FOUND, 'Booking not found')
}

function requireStaff(staffId: string): void {
  if (!staffId || !UUID_PATTERN.test(staffId)) {
    throw invalid('Reporting staff member is required')
  }
}

/** Blank strings count as not given, so a form that sends '' falls back to the booking's contact. */
function clean(value: string | null | undefined): string | null {
  return value?.trim() || null
}

/**
 * Lost bag reports filed by baggage staff: at an airport desk for a passenger who shows their booking, or for the
 * owner of a tagged found bag who has not reported yet. Both set reported_by_staff_id. Passenger self-service reports
 * are on feat-10-lost-baggage-report. The controller runs matching on every new report.
 */
@Injectable()
export class StaffLostReportService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    @Inject(FOUND_BAG_CLOCK) private readonly clock: FoundBagClock,
  ) {}

  /**
   * The ticketed passengers and flights on a booking, for the desk form. It returns the booking's contact details, so
   * every lookup that finds a booking is written to audit_log as a sensitive view.
   */
  async lookupBooking(bookingReference: string, actor: AuditActor): Promise<BookingLookup> {
    const reference = bookingReference?.trim().toUpperCase()

    if (!reference || !BOOKING_REFERENCE_PATTERN.test(reference)) {
      throw bookingNotFound()
    }

    const booking = await this.db.booking.findUnique({
      where: { booking_reference: reference },
      select: {
        id: true,
        booking_reference: true,
        contact_email: true,
        contact_phone: true,
        booking_passenger: {
          select: {
            passenger: { select: { id: true, first_name: true, last_name: true } },
            booking_coupon: {
              select: { booking_passenger_id: true, flight_id: true, status: true },
            },
          },
        },
      },
    })

    if (!booking) {
      throw bookingNotFound()
    }

    await this.audit.recordSensitiveView(actor, {
      sourceFeature: AUDIT_SOURCE_FEATURE,
      entityType: 'booking',
      entityId: booking.id,
      summary: `Booking ${booking.booking_reference} looked up at the baggage desk`,
    })

    // booking_coupon has no Prisma relation to Feature 2's flight, so flights are read in one extra query.
    const flightIds = [...new Set(booking.booking_passenger.flatMap((bp) => bp.booking_coupon.map((coupon) => coupon.flight_id)))]
    const flights = flightIds.length
      ? await this.db.flight.findMany({ where: { id: { in: flightIds } }, select: { id: true, flight_number: true, service_date: true } })
      : []
    const flightById = new Map(flights.map((flight) => [flight.id, flight]))

    const coupons = booking.booking_passenger.flatMap((bp) =>
      bp.booking_coupon.flatMap((coupon) => {
        const flight = flightById.get(coupon.flight_id)

        return flight
          ? [
              {
                bookingPassengerId: coupon.booking_passenger_id,
                passengerId: bp.passenger.id,
                firstName: bp.passenger.first_name,
                lastName: bp.passenger.last_name,
                flightId: coupon.flight_id,
                flightNumber: flight.flight_number,
                flightDate: flight.service_date,
                status: coupon.status,
              },
            ]
          : []
      }),
    )

    coupons.sort((a, b) => a.flightDate.getTime() - b.flightDate.getTime() || a.lastName.localeCompare(b.lastName))

    return {
      bookingReference: booking.booking_reference,
      contactEmail: booking.contact_email,
      contactPhone: booking.contact_phone,
      coupons,
    }
  }

  /** A passenger at the desk reports a missing bag for one ticketed flight on their booking. */
  async createAtDesk(input: DeskReportInput): Promise<LostReportCase> {
    const staffId = input.staffId?.trim()
    const reference = input.bookingReference?.trim().toUpperCase()
    const passengerId = input.passengerId?.trim()
    const flightId = input.flightId?.trim()
    const tagNumber = clean(input.tagNumber)

    requireStaff(staffId)

    if (!reference || !BOOKING_REFERENCE_PATTERN.test(reference)) {
      throw invalid('Booking reference must be 6 letters or digits')
    }

    if (!passengerId || !UUID_PATTERN.test(passengerId) || !flightId || !UUID_PATTERN.test(flightId)) {
      throw invalid('Passenger and flight are required')
    }

    if (!BAG_TYPES.some((type) => type === input.bagType) || !BAG_COLOURS.some((colour) => colour === input.colour)) {
      throw invalid('Invalid bag type or colour')
    }

    if (tagNumber && !isValidBaggageTag(tagNumber)) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_TAG, 'Invalid baggage tag number')
    }

    const coupon = await this.db.booking_coupon.findFirst({
      where: { passenger_id: passengerId, flight_id: flightId, booking_passenger: { booking: { booking_reference: reference } } },
      select: {
        booking_passenger_id: true,
        status: true,
        booking_passenger: { select: { booking: { select: { contact_email: true, contact_phone: true } } } },
      },
    })

    if (!coupon) {
      throw bookingNotFound()
    }

    // A held, expired or cancelled coupon never flew, so it has no checked bags to lose.
    if (coupon.status !== 'confirmed') {
      throw invalid('Only a ticketed flight can have a lost bag report')
    }

    if (tagNumber) {
      const checkedBag = await this.db.checked_bag.findFirst({
        where: { tag_number: tagNumber, deleted_at: null },
        select: { check_in: { select: { booking_passenger_id: true } } },
      })

      if (checkedBag?.check_in.booking_passenger_id !== coupon.booking_passenger_id) {
        throw new FoundBagError(FOUND_BAG_ERROR_CODES.TAG_NOT_ON_BOOKING, 'Baggage tag does not belong to this booking passenger')
      }
    }

    const booking = coupon.booking_passenger.booking

    return this.insert({
      staffId,
      bookingPassengerId: coupon.booking_passenger_id,
      passengerId,
      flightId,
      tagNumber,
      bagType: input.bagType,
      colour: input.colour,
      brand: clean(input.brand),
      description: clean(input.description),
      contactEmail: clean(input.contactEmail) ?? booking.contact_email,
      contactPhone: clean(input.contactPhone) ?? booking.contact_phone,
    })
  }

  /**
   * Open a case for the owner of a held found bag whose tag Feature 6 knows. The passenger and flight come from the
   * bag's check-in and the bag details from the found bag, so staff only add contact details if they have better ones.
   */
  async createFromFoundBag(input: FoundBagReportInput): Promise<LostReportCase> {
    const staffId = input.staffId?.trim()
    const foundBagId = input.foundBagId?.trim()

    requireStaff(staffId)

    const bag =
      foundBagId && UUID_PATTERN.test(foundBagId)
        ? await this.db.found_bag.findUnique({
            where: { id: foundBagId },
            select: {
              status: true,
              tag_number: true,
              bag_type: true,
              colour: true,
              brand: true,
              description: true,
              checked_bag: {
                select: {
                  check_in: {
                    select: {
                      booking_passenger_id: true,
                      passenger_id: true,
                      flight_id: true,
                      booking_coupon: {
                        select: { booking_passenger: { select: { booking: { select: { contact_email: true, contact_phone: true } } } } },
                      },
                    },
                  },
                },
              },
            },
          })
        : null

    if (!bag) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.FOUND_BAG_NOT_FOUND, 'Found bag not found')
    }

    if (!bag.checked_bag || !bag.tag_number) {
      throw invalid('Only a bag with a known tag can open a case for its owner')
    }

    // Any other status means the bag already has an owner case, or can no longer be matched (unclaimed, flew on).
    if (bag.status !== 'held') {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_STATUS, 'Only a held bag can open a case for its owner')
    }

    if (!bag.bag_type || !bag.colour) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_STATUS, 'Add the bag type and colour before opening a case')
    }

    const checkIn = bag.checked_bag.check_in
    const booking = checkIn.booking_coupon.booking_passenger.booking

    return this.insert({
      staffId,
      bookingPassengerId: checkIn.booking_passenger_id,
      passengerId: checkIn.passenger_id,
      flightId: checkIn.flight_id,
      tagNumber: bag.tag_number,
      bagType: bag.bag_type as BagType,
      colour: bag.colour as BagColour,
      brand: bag.brand,
      description: clean(input.description) ?? bag.description,
      contactEmail: clean(input.contactEmail) ?? booking.contact_email,
      contactPhone: clean(input.contactPhone) ?? booking.contact_phone,
    })
  }

  async getById(id: string): Promise<LostReportCase> {
    const row = UUID_PATTERN.test(id) ? await this.db.lost_bag_report.findUnique({ where: { id }, include: REPORT_INCLUDE }) : null

    if (!row) {
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.REPORT_NOT_FOUND, 'Lost bag report not found')
    }

    return toLostReportCase(row)
  }

  /** Every report, whoever filed it, newest first. */
  async list(filter: LostReportFilter = {}): Promise<LostReportCase[]> {
    const where: Prisma.lost_bag_reportWhereInput = {}
    const flightId = filter.flightId?.trim()
    const tagNumber = filter.tagNumber?.trim()
    const caseNumber = filter.caseNumber?.trim().toUpperCase()

    if (filter.status) where.status = filter.status
    if (tagNumber) where.tag_number = tagNumber
    if (caseNumber) {
      if (!CASE_NUMBER_PATTERN.test(caseNumber)) return []
      where.case_number = caseNumber
    }
    if (flightId) {
      if (!UUID_PATTERN.test(flightId)) return []
      where.flight_id = flightId
    }

    const rows = await this.db.lost_bag_report.findMany({
      where,
      include: REPORT_INCLUDE,
      orderBy: [{ reported_at: 'desc' }, { id: 'asc' }],
      take: MAX_LIST_ROWS,
    })

    return rows.map(toLostReportCase)
  }

  private async insert(report: NewReport): Promise<LostReportCase> {
    // Early, friendly check. lost_bag_report_open_tag_uq is still the real guard (caught as P2002 below).
    if (report.tagNumber) {
      const live = await this.db.lost_bag_report.findFirst({
        where: { tag_number: report.tagNumber, status: { in: LIVE_REPORT_STATUSES } },
        select: { id: true },
      })

      if (live) {
        throw reportExists()
      }
    }

    // updated_at is set by the backend (no trigger, no @updatedAt).
    const reportedAt = this.clock.now()
    const now = new Date()

    try {
      const row = await this.db.$transaction(async (tx) => {
        // A number burnt by a failed insert is fine: case numbers only need to be unique, not gapless.
        const [seq] = await tx.$queryRaw<{ nextval: bigint | number }[]>`SELECT nextval('lost_bag_case_seq')`

        return tx.lost_bag_report.create({
          data: {
            case_number: formatCaseNumber(reportedAt, Number(seq.nextval)),
            booking_passenger_id: report.bookingPassengerId,
            passenger_id: report.passengerId,
            flight_id: report.flightId,
            reported_by_staff_id: report.staffId,
            tag_number: report.tagNumber,
            bag_type: report.bagType,
            colour: report.colour,
            brand: report.brand,
            description: report.description,
            contact_email: report.contactEmail,
            contact_phone: report.contactPhone,
            status: 'open',
            reported_at: reportedAt,
            created_at: now,
            updated_at: now,
          },
          include: REPORT_INCLUDE,
        })
      })

      return toLostReportCase(row)
    } catch (e) {
      const code = prismaErrorCode(e)

      if (code === 'P2002') {
        throw reportExists()
      }

      // Foreign key: the staff member does not exist (the coupon was read just before).
      if (code === 'P2003') {
        throw invalid('Unknown passenger, flight or staff member')
      }

      throw e
    }
  }
}
