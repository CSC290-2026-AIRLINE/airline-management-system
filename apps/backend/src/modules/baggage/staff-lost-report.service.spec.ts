import { StaffLostReportService } from './staff-lost-report.service'
import type { DbService } from '@backend/db/db.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const STAFF_ID = '11111111-1111-4111-8111-111111111111'
const FLIGHT_ID = '22222222-2222-4222-8222-222222222222'
const PASSENGER_ID = '33333333-3333-4333-8333-333333333333'
const BOOKING_PASSENGER_ID = '55555555-5555-4555-8555-555555555555'
const FOUND_BAG_ID = '66666666-6666-4666-8666-666666666666'
const REPORT_ID = '77777777-7777-4777-8777-777777777777'
const SIM_NOW = new Date('2026-10-30T08:00:00Z')
const FLIGHT_DATE = new Date('2026-10-29T00:00:00Z')

function prismaError(code: string) {
  return Object.assign(new Error(code), { code })
}

/** What Prisma returns for a created or read report with REPORT_INCLUDE. */
function reportRow(data: Record<string, unknown>) {
  return {
    id: REPORT_ID,
    reported_by_customer_id: null,
    photo_url: null,
    lost_at: null,
    closed_at: null,
    created_at: SIM_NOW,
    updated_at: SIM_NOW,
    ...data,
    passenger: { first_name: 'Somchai', last_name: 'Jaidee' },
    flight: { flight_number: 'FT101', service_date: FLIGHT_DATE },
    booking_coupon: { booking_passenger: { booking: { booking_reference: 'ABC234' } } },
  }
}

const booking = { contact_email: 'somchai@example.com', contact_phone: '+66 81 234 5678' }

function makeSvc() {
  const db = {
    booking: { findUnique: jest.fn().mockResolvedValue(null) },
    booking_coupon: {
      findFirst: jest.fn().mockResolvedValue({
        booking_passenger_id: BOOKING_PASSENGER_ID,
        status: 'confirmed',
        booking_passenger: { booking },
      }),
    },
    flight: { findMany: jest.fn().mockResolvedValue([{ id: FLIGHT_ID, flight_number: 'FT101', service_date: FLIGHT_DATE }]) },
    checked_bag: { findFirst: jest.fn().mockResolvedValue(null) },
    found_bag: { findUnique: jest.fn().mockResolvedValue(null) },
    lost_bag_report: {
      create: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve(reportRow(args.data))),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ nextval: 42n }]),
    $transaction: jest.fn(),
  }
  db.$transaction.mockImplementation((cb: (tx: typeof db) => unknown) => cb(db))

  return { svc: new StaffLostReportService(db as unknown as DbService, { now: () => SIM_NOW }), db }
}

const deskInput = {
  staffId: STAFF_ID,
  bookingReference: 'abc234',
  passengerId: PASSENGER_ID,
  flightId: FLIGHT_ID,
  bagType: 'suitcase' as const,
  colour: 'black' as const,
}

describe('StaffLostReportService.createAtDesk', () => {
  it('files an open staff report with the next case number and the booking contact', async () => {
    const { svc, db } = makeSvc()

    const report = await svc.createAtDesk(deskInput)

    expect(db.booking_coupon.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { passenger_id: PASSENGER_ID, flight_id: FLIGHT_ID, booking_passenger: { booking: { booking_reference: 'ABC234' } } },
      }),
    )
    expect(db.lost_bag_report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          case_number: 'LB-2026-000042',
          booking_passenger_id: BOOKING_PASSENGER_ID,
          passenger_id: PASSENGER_ID,
          flight_id: FLIGHT_ID,
          reported_by_staff_id: STAFF_ID,
          tag_number: null,
          contact_email: 'somchai@example.com',
          contact_phone: '+66 81 234 5678',
          status: 'open',
          reported_at: SIM_NOW,
        }),
      }),
    )
    expect(report).toMatchObject({
      caseNumber: 'LB-2026-000042',
      bookingReference: 'ABC234',
      passengerLastName: 'Jaidee',
      flightNumber: 'FT101',
      reportedByStaffId: STAFF_ID,
    })
  })

  it('keeps contact details the staff member typed, and trims the rest', async () => {
    const { svc, db } = makeSvc()

    await svc.createAtDesk({ ...deskInput, contactEmail: ' hotel@example.com ', contactPhone: ' ', brand: ' Rimowa ', description: '' })

    expect(db.lost_bag_report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contact_email: 'hotel@example.com',
          contact_phone: '+66 81 234 5678',
          brand: 'Rimowa',
          description: null,
        }),
      }),
    )
  })

  it('reports an unknown booking, passenger or flight as BOOKING_NOT_FOUND', async () => {
    const { svc, db } = makeSvc()
    db.booking_coupon.findFirst.mockResolvedValue(null)

    await expect(svc.createAtDesk(deskInput)).rejects.toMatchObject({ code: 'BOOKING_NOT_FOUND', status: 404 })
    expect(db.lost_bag_report.create).not.toHaveBeenCalled()
  })

  it('rejects a coupon that was never ticketed', async () => {
    const { svc, db } = makeSvc()
    db.booking_coupon.findFirst.mockResolvedValue({
      booking_passenger_id: BOOKING_PASSENGER_ID,
      status: 'cancelled',
      booking_passenger: { booking },
    })

    await expect(svc.createAtDesk(deskInput)).rejects.toMatchObject({ code: 'INVALID_REPORT', status: 400 })
  })

  it('rejects bad input before touching the database', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.createAtDesk({ ...deskInput, bookingReference: 'ABC10' })).rejects.toMatchObject({ code: 'INVALID_REPORT' })
    await expect(svc.createAtDesk({ ...deskInput, flightId: 'nope' })).rejects.toMatchObject({ code: 'INVALID_REPORT' })
    await expect(svc.createAtDesk({ ...deskInput, colour: 'navy' as never })).rejects.toMatchObject({ code: 'INVALID_REPORT' })
    await expect(svc.createAtDesk({ ...deskInput, tagNumber: '1234567890' })).rejects.toMatchObject({ code: 'INVALID_TAG' })
    await expect(svc.createAtDesk({ ...deskInput, staffId: '' })).rejects.toMatchObject({ code: 'INVALID_REPORT' })
    expect(db.booking_coupon.findFirst).not.toHaveBeenCalled()
  })

  it('accepts a tag only when it is on this booking passenger', async () => {
    const { svc, db } = makeSvc()
    db.checked_bag.findFirst.mockResolvedValue({ check_in: { booking_passenger_id: BOOKING_PASSENGER_ID } })

    await svc.createAtDesk({ ...deskInput, tagNumber: '0123456789' })
    expect(db.lost_bag_report.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tag_number: '0123456789' }) }),
    )

    db.checked_bag.findFirst.mockResolvedValue({ check_in: { booking_passenger_id: '99999999-9999-4999-8999-999999999999' } })
    await expect(svc.createAtDesk({ ...deskInput, tagNumber: '0123456789' })).rejects.toMatchObject({ code: 'TAG_NOT_ON_BOOKING' })

    db.checked_bag.findFirst.mockResolvedValue(null)
    await expect(svc.createAtDesk({ ...deskInput, tagNumber: '0123456789' })).rejects.toMatchObject({ code: 'TAG_NOT_ON_BOOKING' })
  })

  it('refuses a second live case for the same tag, early and on the unique index', async () => {
    const { svc, db } = makeSvc()
    db.checked_bag.findFirst.mockResolvedValue({ check_in: { booking_passenger_id: BOOKING_PASSENGER_ID } })
    db.lost_bag_report.findFirst.mockResolvedValueOnce({ id: REPORT_ID })

    await expect(svc.createAtDesk({ ...deskInput, tagNumber: '0123456789' })).rejects.toMatchObject({ code: 'REPORT_EXISTS', status: 409 })
    expect(db.lost_bag_report.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tag_number: '0123456789', status: { in: ['open', 'matched', 'delivering', 'lost'] } } }),
    )

    db.lost_bag_report.create.mockRejectedValueOnce(prismaError('P2002'))
    await expect(svc.createAtDesk({ ...deskInput, tagNumber: '0123456789' })).rejects.toMatchObject({ code: 'REPORT_EXISTS' })
  })
})

describe('StaffLostReportService.createFromFoundBag', () => {
  const heldTaggedBag = {
    status: 'held',
    tag_number: '0123456789',
    bag_type: 'duffel',
    colour: 'red',
    brand: 'North Face',
    description: 'Luggage strap',
    checked_bag: {
      check_in: {
        booking_passenger_id: BOOKING_PASSENGER_ID,
        passenger_id: PASSENGER_ID,
        flight_id: FLIGHT_ID,
        booking_coupon: { booking_passenger: { booking } },
      },
    },
  }

  it("opens a case for the bag's owner from the check-in and the found bag", async () => {
    const { svc, db } = makeSvc()
    db.found_bag.findUnique.mockResolvedValue(heldTaggedBag)

    await svc.createFromFoundBag({ staffId: STAFF_ID, foundBagId: FOUND_BAG_ID, contactPhone: '+66 2 000 0000' })

    expect(db.lost_bag_report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          booking_passenger_id: BOOKING_PASSENGER_ID,
          passenger_id: PASSENGER_ID,
          flight_id: FLIGHT_ID,
          tag_number: '0123456789',
          bag_type: 'duffel',
          colour: 'red',
          brand: 'North Face',
          description: 'Luggage strap',
          contact_email: 'somchai@example.com',
          contact_phone: '+66 2 000 0000',
          reported_by_staff_id: STAFF_ID,
        }),
      }),
    )
  })

  it('needs a known, held bag with its type and colour', async () => {
    const { svc, db } = makeSvc()
    const input = { staffId: STAFF_ID, foundBagId: FOUND_BAG_ID }

    await expect(svc.createFromFoundBag(input)).rejects.toMatchObject({ code: 'FOUND_BAG_NOT_FOUND', status: 404 })

    db.found_bag.findUnique.mockResolvedValue({ ...heldTaggedBag, checked_bag: null })
    await expect(svc.createFromFoundBag(input)).rejects.toMatchObject({ code: 'INVALID_REPORT' })

    db.found_bag.findUnique.mockResolvedValue({ ...heldTaggedBag, status: 'unclaimed' })
    await expect(svc.createFromFoundBag(input)).rejects.toMatchObject({ code: 'INVALID_STATUS', status: 409 })

    db.found_bag.findUnique.mockResolvedValue({ ...heldTaggedBag, bag_type: null })
    await expect(svc.createFromFoundBag(input)).rejects.toMatchObject({ code: 'INVALID_STATUS' })

    expect(db.lost_bag_report.create).not.toHaveBeenCalled()
  })
})

describe('StaffLostReportService reads', () => {
  it('looks up the coupons on a booking with their flights', async () => {
    const { svc, db } = makeSvc()
    db.booking.findUnique.mockResolvedValue({
      booking_reference: 'ABC234',
      ...booking,
      booking_passenger: [
        {
          passenger: { id: PASSENGER_ID, first_name: 'Somchai', last_name: 'Jaidee' },
          booking_coupon: [{ booking_passenger_id: BOOKING_PASSENGER_ID, flight_id: FLIGHT_ID, status: 'confirmed' }],
        },
      ],
    })

    await expect(svc.lookupBooking('abc234')).resolves.toEqual({
      bookingReference: 'ABC234',
      contactEmail: 'somchai@example.com',
      contactPhone: '+66 81 234 5678',
      coupons: [
        {
          bookingPassengerId: BOOKING_PASSENGER_ID,
          passengerId: PASSENGER_ID,
          firstName: 'Somchai',
          lastName: 'Jaidee',
          flightId: FLIGHT_ID,
          flightNumber: 'FT101',
          flightDate: FLIGHT_DATE,
          status: 'confirmed',
        },
      ],
    })
    expect(db.booking.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { booking_reference: 'ABC234' } }))
  })

  it('reports an unknown or malformed booking reference', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.lookupBooking('ABC234')).rejects.toMatchObject({ code: 'BOOKING_NOT_FOUND' })
    await expect(svc.lookupBooking('ABC10')).rejects.toMatchObject({ code: 'BOOKING_NOT_FOUND' })
    expect(db.booking.findUnique).toHaveBeenCalledTimes(1)
  })

  it('gets a report by id, and 404s a missing or malformed id', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.getById('not-a-uuid')).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND', status: 404 })
    await expect(svc.getById(REPORT_ID)).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
    expect(db.lost_bag_report.findUnique).toHaveBeenCalledTimes(1)
  })

  it('lists with combined filters, newest first, and short-circuits malformed ones', async () => {
    const { svc, db } = makeSvc()

    await svc.list({ status: 'open', flightId: FLIGHT_ID, caseNumber: 'lb-2026-000042' })

    expect(db.lost_bag_report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'open', flight_id: FLIGHT_ID, case_number: 'LB-2026-000042' },
        orderBy: [{ reported_at: 'desc' }, { id: 'asc' }],
      }),
    )

    await expect(svc.list({ caseNumber: 'LB-26-1' })).resolves.toEqual([])
    await expect(svc.list({ flightId: 'nope' })).resolves.toEqual([])
    expect(db.lost_bag_report.findMany).toHaveBeenCalledTimes(1)
  })
})
