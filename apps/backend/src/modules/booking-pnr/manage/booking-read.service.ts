import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import {
  BOOKING_CLOCK,
  type BookingClock,
  type BookingCouponDto,
  type BookingDetail,
  type BookingHistoryEntry,
  type BookingListItem,
  type BookingListQuery,
  type BookingPage,
  type BookingReadPort,
  type BookingSegmentDto,
  type BookingStatus,
  type BookingSummary,
  type BookingViewer,
  type Cabin,
  type CouponCancelReason,
  type CouponStatus,
  type FlightBookingCounts,
  type FlightPassengerDto,
  type PassengerType,
  type PaymentType,
  type ServiceCode,
  type ServiceRequestStatus,
  type TripType,
  type UpcomingFlightDto,
} from '../contracts'

const LIVE_COUPON_STATUSES = ['held', 'confirmed']
const LIVE_REQUEST_STATUSES = ['requested', 'accepted']
const ACTIVE_SEAT_STATUSES = ['held', 'assigned']
const CHECKED_IN_STATUSES = new Set(['checked_in', 'boarded', 'no_show'])

const SUMMARY_SELECT = {
  id: true,
  booking_reference: true,
  status: true,
  trip_type: true,
  payment_type: true,
  customer_id: true,
  booked_by_staff_id: true,
  contact_email: true,
  contact_phone: true,
  currency: true,
  booked_at: true,
  hold_expires_at: true,
  confirmed_at: true,
  cancelled_at: true,
} satisfies Prisma.bookingSelect

const LIST_SELECT = {
  ...SUMMARY_SELECT,
  booking_passenger: {
    select: {
      id: true,
      passenger_id: true,
      passenger_type: true,
      created_at: true,
      passenger: { select: { first_name: true, last_name: true } },
    },
    orderBy: { created_at: 'asc' },
  },
  booking_segment: {
    select: {
      id: true,
      segment_order: true,
      seat_inventory: {
        select: {
          flight: {
            select: {
              flight_number: true,
              dep_at: true,
              arr_at: true,
              route: { select: { origin: true, destination: true } },
            },
          },
        },
      },
    },
    orderBy: { segment_order: 'asc' },
  },
} satisfies Prisma.bookingSelect

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  booking_passenger: {
    select: {
      id: true,
      passenger_id: true,
      passenger_type: true,
      lap_of_id: true,
      created_at: true,
      passenger: { select: { first_name: true, last_name: true } },
    },
    orderBy: { created_at: 'asc' },
  },
  booking_segment: {
    select: {
      id: true,
      flight_id: true,
      segment_order: true,
      cabin: true,
      fare_class_id: true,
      fare_class: { select: { code: true } },
      seat_inventory: {
        select: {
          flight: {
            select: {
              flight_number: true,
              dep_at: true,
              arr_at: true,
              route: { select: { origin: true, destination: true } },
            },
          },
        },
      },
    },
    orderBy: { segment_order: 'asc' },
  },
} satisfies Prisma.bookingSelect

const COUPON_DETAIL_SELECT = {
  id: true,
  booking_passenger_id: true,
  passenger_id: true,
  booking_segment_id: true,
  flight_id: true,
  ticket_number: true,
  status: true,
  cancel_reason: true,
  price_total: true,
  seat_assignment: {
    where: { status: { in: ACTIVE_SEAT_STATUSES } },
    select: { seat_code: true, status: true },
  },
} satisfies Prisma.booking_couponSelect

const COUPON_EXTRA_SELECT = {
  booking_id: true,
  price_total: true,
  check_in: { select: { status: true } },
} satisfies Prisma.booking_couponSelect

const SERVICE_REQUEST_SELECT = {
  id: true,
  booking_passenger_id: true,
  booking_segment_id: true,
  service_code: true,
  status: true,
  note: true,
  decision_note: true,
  requested_at: true,
} satisfies Prisma.booking_service_requestSelect

const FLIGHT_PASSENGER_SELECT = {
  booking_passenger_id: true,
  passenger_id: true,
  booking_passenger: {
    select: {
      passenger_type: true,
      passenger: { select: { first_name: true, last_name: true } },
      booking: { select: { booking_reference: true, contact_email: true, contact_phone: true } },
    },
  },
  booking_segment: {
    select: {
      cabin: true,
      fare_class: { select: { code: true } },
    },
  },
  seat_assignment: {
    where: { status: { in: ACTIVE_SEAT_STATUSES } },
    select: { seat_code: true, status: true },
  },
} satisfies Prisma.booking_couponSelect

const UPCOMING_SELECT = {
  booking_id: true,
  flight_id: true,
  booking_segment: {
    select: {
      booking: { select: { booking_reference: true, status: true } },
      seat_inventory: {
        select: {
          flight: {
            select: {
              flight_number: true,
              dep_at: true,
              route: { select: { origin: true, destination: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.booking_couponSelect

type SummaryRow = Prisma.bookingGetPayload<{ select: typeof SUMMARY_SELECT }>
type ListRow = Prisma.bookingGetPayload<{ select: typeof LIST_SELECT }>
type DetailRow = Prisma.bookingGetPayload<{ select: typeof DETAIL_SELECT }>
type CouponDetailRow = Prisma.booking_couponGetPayload<{ select: typeof COUPON_DETAIL_SELECT }>
type ServiceRequestRow = Prisma.booking_service_requestGetPayload<{ select: typeof SERVICE_REQUEST_SELECT }>

interface ListExtras {
  total: number
  openServiceRequests: number
  checkedIn: boolean
}

interface CustomerBookingEntry {
  item: BookingListItem
  past: boolean
}

export interface CustomerTrips {
  upcoming: BookingListItem[]
  past: BookingListItem[]
}

const EMPTY_EXTRAS: ListExtras = { total: 0, openServiceRequests: 0, checkedIn: false }

@Injectable()
export class BookingReadService implements BookingReadPort {
  constructor(
    private readonly db: DbService,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}

  getBooking(reference: string): Promise<BookingDetail | null> {
    return this.loadDetail(reference)
  }

  async getBookingDetail(reference: string, viewer: BookingViewer): Promise<BookingDetail | null> {
    const detail = await this.loadDetail(reference)
    if (!detail) {
      return null
    }
    if (viewer.staff) {
      return detail
    }
    return viewer.customerId !== undefined && detail.customerId === viewer.customerId ? detail : null
  }

  async findBookingByReferenceAndSurname(reference: string, surname: string): Promise<BookingDetail | null> {
    const trimmed = surname.trim()
    if (!trimmed) {
      return null
    }

    const booking = await this.db.booking.findFirst({
      where: {
        booking_reference: reference,
        booking_passenger: {
          some: { passenger: { last_name: { equals: trimmed, mode: 'insensitive' } } },
        },
      },
      select: { booking_reference: true },
    })

    return booking ? this.loadDetail(booking.booking_reference) : null
  }

  async getBookingForPassenger(bookingPassengerId: string): Promise<BookingDetail | null> {
    const passenger = await this.db.booking_passenger.findUnique({
      where: { id: bookingPassengerId },
      select: { booking: { select: { booking_reference: true } } },
    })

    return passenger ? this.loadDetail(passenger.booking.booking_reference) : null
  }

  async listCustomerBookings(customerId: string): Promise<BookingListItem[]> {
    const entries = await this.loadCustomerBookings(customerId)
    return entries.map((entry) => entry.item)
  }

  async listStaffBookings(query: BookingListQuery): Promise<BookingPage> {
    const search = query.search?.trim() ?? ''
    const where = search ? this.searchWhere(search) : this.filterWhere(query)
    const { page, pageSize } = this.pageParams(query)

    const [rows, total] = await Promise.all([
      this.db.booking.findMany({
        where,
        select: LIST_SELECT,
        orderBy: { booked_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.booking.count({ where }),
    ])

    const extras = await this.loadListExtras(rows)

    return {
      items: rows.map((row) => this.toListItem(row, extras.get(row.id) ?? EMPTY_EXTRAS)),
      page,
      pageSize,
      total,
    }
  }

  async listFlightPassengers(flightId: string): Promise<FlightPassengerDto[]> {
    const [coupons, requests] = await Promise.all([
      this.db.booking_coupon.findMany({
        where: { flight_id: flightId, status: 'confirmed' },
        select: FLIGHT_PASSENGER_SELECT,
      }),
      this.db.booking_service_request.findMany({
        where: {
          status: { in: LIVE_REQUEST_STATUSES },
          OR: [
            { booking_segment: { flight_id: flightId } },
            {
              booking_segment_id: null,
              booking_passenger: {
                booking_coupon: { some: { flight_id: flightId, status: 'confirmed' } },
              },
            },
          ],
        },
        select: { booking_passenger_id: true, service_code: true },
      }),
    ])

    const codes = new Map<string, ServiceCode[]>()
    for (const request of requests) {
      const list = codes.get(request.booking_passenger_id) ?? []
      const code = request.service_code as ServiceCode
      if (!list.includes(code)) {
        list.push(code)
      }
      codes.set(request.booking_passenger_id, list)
    }

    const passengers = coupons.map<FlightPassengerDto>((coupon) => ({
      bookingReference: coupon.booking_passenger.booking.booking_reference,
      bookingPassengerId: coupon.booking_passenger_id,
      passengerId: coupon.passenger_id,
      firstName: coupon.booking_passenger.passenger.first_name,
      lastName: coupon.booking_passenger.passenger.last_name,
      passengerType: coupon.booking_passenger.passenger_type as PassengerType,
      cabin: coupon.booking_segment.cabin as Cabin,
      fareClassCode: coupon.booking_segment.fare_class?.code ?? null,
      contactEmail: coupon.booking_passenger.booking.contact_email,
      contactPhone: coupon.booking_passenger.booking.contact_phone,
      seatCode: this.pickSeat(coupon.seat_assignment),
      serviceCodes: codes.get(coupon.booking_passenger_id) ?? [],
    }))

    return passengers.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
  }

  async listUpcomingFlights(passengerId: string): Promise<UpcomingFlightDto[]> {
    const now = this.clock.now()
    const rows = await this.db.booking_coupon.findMany({
      where: {
        passenger_id: passengerId,
        status: 'confirmed',
        booking_segment: { seat_inventory: { flight: { dep_at: { gt: now } } } },
      },
      select: UPCOMING_SELECT,
      orderBy: { booking_segment: { seat_inventory: { flight: { dep_at: 'asc' } } } },
    })

    return rows.map((row) => {
      const flight = row.booking_segment.seat_inventory.flight
      return {
        bookingId: row.booking_id,
        reference: row.booking_segment.booking.booking_reference,
        status: row.booking_segment.booking.status as BookingStatus,
        flightId: row.flight_id,
        flightNumber: flight.flight_number,
        origin: flight.route.origin,
        destination: flight.route.destination,
        depAt: flight.dep_at,
      }
    })
  }

  async countBookingsForFlight(flightId: string): Promise<FlightBookingCounts> {
    const [groups, openServiceRequests] = await Promise.all([
      this.db.booking_coupon.groupBy({
        by: ['booking_id'],
        where: { flight_id: flightId, status: { in: LIVE_COUPON_STATUSES } },
        _count: { _all: true },
      }),
      this.db.booking_service_request.count({
        where: {
          status: { in: LIVE_REQUEST_STATUSES },
          OR: [
            { booking_segment: { flight_id: flightId } },
            {
              booking_segment_id: null,
              booking_passenger: {
                booking_coupon: { some: { flight_id: flightId, status: { in: LIVE_COUPON_STATUSES } } },
              },
            },
          ],
        },
      }),
    ])

    return {
      bookings: groups.length,
      passengers: groups.reduce((sum, group) => sum + group._count._all, 0),
      openServiceRequests,
    }
  }

  /** Route helper: a staff token reads any booking; a customer token reads only its own. */
  async getBookingForUser(reference: string, userId: string): Promise<BookingDetail | null> {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { type: true } })
    if (!user) {
      return null
    }
    if (user.type === 'staff') {
      return this.getBookingDetail(reference, { staff: true })
    }

    const customer = await this.db.customer.findUnique({ where: { user_id: userId }, select: { id: true } })
    if (!customer) {
      return null
    }
    return this.getBookingDetail(reference, { customerId: customer.id })
  }

  /** Route helper: My Trips, split into the Upcoming and Past tabs. */
  async listCustomerTrips(userId: string): Promise<CustomerTrips> {
    const customer = await this.db.customer.findUnique({ where: { user_id: userId }, select: { id: true } })
    if (!customer) {
      throw new NotFoundException('Customer profile was not found.')
    }

    const entries = await this.loadCustomerBookings(customer.id)
    return {
      upcoming: entries.filter((entry) => !entry.past).map((entry) => entry.item),
      past: entries.filter((entry) => entry.past).map((entry) => entry.item),
    }
  }

  private async loadDetail(reference: string): Promise<BookingDetail | null> {
    const row = await this.db.booking.findUnique({
      where: { booking_reference: reference },
      select: DETAIL_SELECT,
    })
    if (!row) {
      return null
    }

    const [coupons, serviceRequests] = await Promise.all([
      this.db.booking_coupon.findMany({
        where: { booking_id: row.id },
        select: COUPON_DETAIL_SELECT,
        orderBy: { created_at: 'asc' },
      }),
      this.db.booking_service_request.findMany({
        where: { booking_id: row.id },
        select: SERVICE_REQUEST_SELECT,
        orderBy: { requested_at: 'asc' },
      }),
    ])

    return this.toDetail(row, coupons, serviceRequests)
  }

  private async loadCustomerBookings(customerId: string): Promise<CustomerBookingEntry[]> {
    const rows = await this.db.booking.findMany({ where: { customer_id: customerId }, select: LIST_SELECT })
    if (rows.length === 0) {
      return []
    }

    const extras = await this.loadListExtras(rows)
    const now = this.clock.now().getTime()
    const entries = rows.map<CustomerBookingEntry>((row) => {
      const extra = extras.get(row.id) ?? EMPTY_EXTRAS
      const item = this.toListItem(row, extra)
      const departed = item.travelDate !== null && item.travelDate.getTime() <= now
      const closed = row.status === 'cancelled' || row.status === 'expired'
      return { item, past: closed || departed || extra.checkedIn }
    })

    return entries.sort((a, b) => {
      const left = a.item.travelDate
      const right = b.item.travelDate
      if (!left && !right) {
        return 0
      }
      if (!left) {
        return 1
      }
      if (!right) {
        return -1
      }
      return right.getTime() - left.getTime()
    })
  }

  private async loadListExtras(rows: ListRow[]): Promise<Map<string, ListExtras>> {
    const extras = new Map<string, ListExtras>()
    if (rows.length === 0) {
      return extras
    }

    const ids = rows.map((row) => row.id)
    for (const id of ids) {
      extras.set(id, { total: 0, openServiceRequests: 0, checkedIn: false })
    }

    const [coupons, requests] = await Promise.all([
      this.db.booking_coupon.findMany({
        where: { booking_id: { in: ids } },
        select: COUPON_EXTRA_SELECT,
      }),
      this.db.booking_service_request.findMany({
        where: { booking_id: { in: ids }, status: { in: LIVE_REQUEST_STATUSES } },
        select: { booking_id: true },
      }),
    ])

    for (const coupon of coupons) {
      const extra = extras.get(coupon.booking_id)
      if (!extra) {
        continue
      }
      extra.total += Number(coupon.price_total)
      if (coupon.check_in.some((checkIn) => CHECKED_IN_STATUSES.has(checkIn.status))) {
        extra.checkedIn = true
      }
    }

    for (const request of requests) {
      const extra = extras.get(request.booking_id)
      if (extra) {
        extra.openServiceRequests += 1
      }
    }

    return extras
  }

  private toDetail(row: DetailRow, coupons: CouponDetailRow[], requests: ServiceRequestRow[]): BookingDetail {
    const segments = row.booking_segment.map<BookingSegmentDto>((segment) => ({
      bookingSegmentId: segment.id,
      flightId: segment.flight_id,
      segmentOrder: segment.segment_order,
      cabin: segment.cabin as Cabin,
      fareClassId: segment.fare_class_id,
      fareClassCode: segment.fare_class?.code ?? null,
      flightNumber: segment.seat_inventory.flight.flight_number,
      origin: segment.seat_inventory.flight.route.origin,
      destination: segment.seat_inventory.flight.route.destination,
      depAt: segment.seat_inventory.flight.dep_at,
      arrAt: segment.seat_inventory.flight.arr_at,
    }))

    const total = coupons.reduce((sum, coupon) => sum + Number(coupon.price_total), 0)

    return {
      ...this.toSummary(row, total),
      passengers: row.booking_passenger.map((passenger) => ({
        bookingPassengerId: passenger.id,
        passengerId: passenger.passenger_id,
        firstName: passenger.passenger.first_name,
        lastName: passenger.passenger.last_name,
        passengerType: passenger.passenger_type as PassengerType,
        lapOfBookingPassengerId: passenger.lap_of_id,
      })),
      segments,
      coupons: coupons.map<BookingCouponDto>((coupon) => ({
        couponId: coupon.id,
        bookingPassengerId: coupon.booking_passenger_id,
        passengerId: coupon.passenger_id,
        bookingSegmentId: coupon.booking_segment_id,
        flightId: coupon.flight_id,
        ticketNumber: coupon.ticket_number,
        status: coupon.status as CouponStatus,
        cancelReason: coupon.cancel_reason as CouponCancelReason | null,
        priceTotal: Number(coupon.price_total),
        seatCode: this.pickSeat(coupon.seat_assignment),
      })),
      serviceRequests: requests.map((request) => ({
        serviceRequestId: request.id,
        bookingPassengerId: request.booking_passenger_id,
        bookingSegmentId: request.booking_segment_id,
        serviceCode: request.service_code as ServiceCode,
        status: request.status as ServiceRequestStatus,
        note: request.note,
        decisionNote: request.decision_note,
        requestedAt: request.requested_at,
      })),
      history: this.history(row),
      serverNow: this.clock.now(),
    }
  }

  private toListItem(row: ListRow, extra: ListExtras): BookingListItem {
    const travelDate = row.booking_segment.length > 0 ? row.booking_segment[0].seat_inventory.flight.dep_at : null
    return {
      ...this.toSummary(row, extra.total),
      leadPassengerName: this.leadPassengerName(row),
      trip: this.tripLabel(row),
      travelDate,
      openServiceRequests: extra.openServiceRequests,
    }
  }

  private toSummary(row: SummaryRow, total: number): BookingSummary {
    return {
      bookingId: row.id,
      reference: row.booking_reference,
      status: row.status as BookingStatus,
      tripType: row.trip_type as TripType,
      paymentType: row.payment_type as PaymentType,
      customerId: row.customer_id,
      bookedByStaffId: row.booked_by_staff_id,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      currency: row.currency,
      total,
      bookedAt: row.booked_at,
      holdExpiresAt: row.hold_expires_at,
      confirmedAt: row.confirmed_at,
      cancelledAt: row.cancelled_at,
    }
  }

  private history(row: SummaryRow): BookingHistoryEntry[] {
    const entries: BookingHistoryEntry[] = [{ at: row.booked_at, event: 'held', byStaffId: row.booked_by_staff_id }]
    if (row.confirmed_at) {
      entries.push({ at: row.confirmed_at, event: 'confirmed', byStaffId: null })
    }
    if (row.status === 'cancelled' && row.cancelled_at) {
      entries.push({ at: row.cancelled_at, event: 'cancelled', byStaffId: null })
    }
    if (row.status === 'expired') {
      entries.push({ at: row.hold_expires_at, event: 'expired', byStaffId: null })
    }
    return entries.sort((a, b) => a.at.getTime() - b.at.getTime())
  }

  private leadPassengerName(row: ListRow): string {
    const lead = row.booking_passenger.find((passenger) => passenger.passenger_type === 'adult') ?? row.booking_passenger[0]
    if (!lead) {
      return ''
    }
    return `${lead.passenger.first_name} ${lead.passenger.last_name}`.trim()
  }

  private tripLabel(row: ListRow): string {
    const flights = row.booking_segment.map((segment) => segment.seat_inventory.flight)
    if (flights.length === 0) {
      return ''
    }

    const [first, second] = flights
    if (flights.length === 2 && first.route.origin === second.route.destination && first.route.destination === second.route.origin) {
      return `${first.route.origin} ⇄ ${first.route.destination}`
    }

    return [flights[0].route.origin, ...flights.map((flight) => flight.route.destination)].join(' → ')
  }

  private pickSeat(assignments: Array<{ seat_code: string; status: string }>): string | null {
    const active = assignments.find((assignment) => assignment.status === 'assigned') ?? assignments[0]
    return active?.seat_code ?? null
  }

  private searchWhere(search: string): Prisma.bookingWhereInput {
    const tokens = search.split(/\s+/).filter(Boolean)
    const digits = search.replace(/\D/g, '')
    const ticketLike = digits.length > 0 && /^[\d\s-]+$/.test(search)
    const or: Prisma.bookingWhereInput[] = [
      { booking_reference: { contains: search, mode: 'insensitive' } },
      {
        booking_passenger: {
          some: {
            passenger: {
              AND: tokens.map((token): Prisma.passengerWhereInput => ({
                OR: [
                  { first_name: { contains: token, mode: 'insensitive' } },
                  { last_name: { contains: token, mode: 'insensitive' } },
                  { passport_number: { contains: token, mode: 'insensitive' } },
                ],
              })),
            },
          },
        },
      },
    ]

    if (ticketLike) {
      or.push({
        booking_passenger: { some: { booking_coupon: { some: { ticket_number: { contains: digits } } } } },
      })
    }

    return { OR: or }
  }

  private filterWhere(query: BookingListQuery): Prisma.bookingWhereInput {
    const filters: Prisma.bookingWhereInput[] = []
    if (query.status) {
      filters.push({ status: query.status })
    }
    if (query.flightId) {
      filters.push({ booking_segment: { some: { flight_id: query.flightId } } })
    }

    if (query.from || query.to) {
      const range: Prisma.DateTimeFilter = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      }
      if (query.dateType === 'travelling') {
        filters.push({ booking_segment: { some: { seat_inventory: { flight: { dep_at: range } } } } })
      } else {
        filters.push({ booked_at: range })
      }
    }

    return filters.length > 0 ? { AND: filters } : {}
  }

  private pageParams(query: BookingListQuery): { page: number; pageSize: number } {
    const rawPage = query.page ?? 1
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.trunc(rawPage) : 1
    const rawSize = query.pageSize ?? 20
    const pageSize = Number.isFinite(rawSize) ? Math.min(100, Math.max(1, Math.trunc(rawSize))) : 20
    return { page, pageSize }
  }
}
