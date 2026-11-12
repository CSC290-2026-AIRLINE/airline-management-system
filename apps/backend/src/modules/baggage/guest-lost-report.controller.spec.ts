jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))
jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }))

import { BadRequestException, RequestMethod, ValidationPipe } from '@nestjs/common'
import { GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { IS_PUBLIC_KEY } from '@backend/auth/decorators/public.decorator'
import type { DbService } from '@backend/db/db.service'
import type { BagMatchingService } from './bag-matching.service'
import { CreateGuestLostReportDto } from './dto/guest-lost-report.dto'
import { GuestBookingLookupService } from './guest-booking-lookup.service'
import { GuestLostReportController } from './guest-lost-report.controller'
import { GuestLostReportTravellersController } from './guest-lost-report-travellers.controller'
import type { UploadedLostReportPhoto } from './lost-report-photo.storage'
import { InMemoryCaseNumberSequence } from './mocks/in-memory-case-number.sequence'
import { InMemoryReportRepository } from './mocks/in-memory-report.repository'
import { MockBookingVerification } from './mocks/mock-booking.verification'
import { MockCheckedBagLookup } from './mocks/mock-checked-bag.lookup'
import { MockSimulationClock } from './mocks/mock-simulation.clock'
import { ReportService } from './report.service'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const FLIGHT_OUT = id(101) // FY204, 2026-10-19, BKK-NRT
const FLIGHT_BACK = id(102) // FY205, 2026-10-26, NRT-BKK
const FLIGHT_OTHER = id(103) // FY900, 2026-10-19, SIN-BKK (another booking)

// Booking K7QX2M: Anna and Erik Eriksson (shared surname), Maya Lind (other surname). Booking ZZZZZ9: Olof Eriksson.
const ANNA = { bp: id(201), passenger: id(301) }
const ERIK = { bp: id(202), passenger: id(302) }
const MAYA = { bp: id(203), passenger: id(303) }
const OLOF = { bp: id(204), passenger: id(304) }

interface Coupon {
  booking_passenger_id: string
  passenger_id: string
  flight_id: string
  status: string
  booking_reference: string
  first_name: string
  last_name: string
  passenger_deleted: boolean
}

const c = (who: { bp: string; passenger: string }, first: string, last: string, flight: string, extra: Partial<Coupon> = {}): Coupon => ({
  booking_passenger_id: who.bp,
  passenger_id: who.passenger,
  flight_id: flight,
  status: 'confirmed',
  booking_reference: 'K7QX2M',
  first_name: first,
  last_name: last,
  passenger_deleted: false,
  ...extra,
})

const COUPONS: Coupon[] = [
  c(ANNA, 'Anna', 'Eriksson', FLIGHT_OUT),
  c(ANNA, 'Anna', 'Eriksson', FLIGHT_BACK),
  c(ERIK, 'Erik', 'Eriksson', FLIGHT_OUT),
  c(ERIK, 'Erik', 'Eriksson', FLIGHT_BACK, { status: 'cancelled' }), // Erik is not flying back
  c(MAYA, 'Maya', 'Lind', FLIGHT_OUT),
  c(OLOF, 'Olof', 'Eriksson', FLIGHT_OTHER, { booking_reference: 'ZZZZZ9' }),
]

const FLIGHTS = [
  {
    id: FLIGHT_OUT,
    flight_number: 'FY204',
    service_date: new Date('2026-10-19T00:00:00Z'),
    actual_destination: null,
    route: { origin: 'BKK', destination: 'NRT' },
  },
  {
    id: FLIGHT_BACK,
    flight_number: 'FY205',
    service_date: new Date('2026-10-26T00:00:00Z'),
    actual_destination: null,
    route: { origin: 'NRT', destination: 'BKK' },
  },
  {
    id: FLIGHT_OTHER,
    flight_number: 'FY900',
    service_date: new Date('2026-10-19T00:00:00Z'),
    actual_destination: null,
    route: { origin: 'SIN', destination: 'BKK' },
  },
]

type CouponWhere = {
  status: string
  booking_passenger_id?: string
  flight_id?: string
  booking_passenger: { booking: { booking_reference: string }; passenger: { last_name: { equals: string }; deleted_at: null } }
}

/** Evaluates the guest lookup's coupon and flight queries the way the database would. */
function fakeDb() {
  const matches = (row: Coupon, where: CouponWhere) =>
    row.status === where.status &&
    row.booking_reference === where.booking_passenger.booking.booking_reference &&
    row.last_name.toLowerCase() === where.booking_passenger.passenger.last_name.equals.toLowerCase() &&
    !row.passenger_deleted &&
    (where.booking_passenger_id === undefined || row.booking_passenger_id === where.booking_passenger_id) &&
    (where.flight_id === undefined || row.flight_id === where.flight_id)
  const shape = (row: Coupon) => ({ ...row, booking_passenger: { passenger: { first_name: row.first_name, last_name: row.last_name } } })

  const db = {
    booking_coupon: {
      findMany: jest.fn(({ where, distinct }: { where: CouponWhere; distinct?: string[] }) => {
        const hits = COUPONS.filter((row) => matches(row, where)).map(shape)
        return Promise.resolve(distinct ? [...new Map(hits.map((h) => [h.flight_id, h])).values()] : hits)
      }),
      findFirst: jest.fn(({ where }: { where: CouponWhere }) => Promise.resolve(COUPONS.find((row) => matches(row, where)) ?? null)),
    },
    flight: {
      findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          FLIGHTS.filter((f) => where.id.in.includes(f.id)).sort((a, b) => a.service_date.getTime() - b.service_date.getTime()),
        ),
      ),
      findUnique: jest.fn(({ where }: { where: { flight_number_service_date: { flight_number: string; service_date: Date } } }) => {
        const key = where.flight_number_service_date
        const flight = FLIGHTS.find((f) => f.flight_number === key.flight_number && f.service_date.getTime() === key.service_date.getTime())
        return Promise.resolve(flight ? { id: flight.id } : null)
      }),
    },
  }
  return db
}

function setup() {
  const db = fakeDb()
  const lookup = new GuestBookingLookupService(db as unknown as DbService)
  const repository = new InMemoryReportRepository()
  const signedInBookings = new MockBookingVerification([])
  const verifyPassenger = jest.spyOn(signedInBookings, 'verifyPassenger')
  const photos = { upload: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined), retrieve: jest.fn() }
  const reports = new ReportService(
    repository,
    signedInBookings,
    new MockCheckedBagLookup([
      { tagNumber: '0789204578', bookingPassengerId: ERIK.bp, flightId: FLIGHT_OUT },
      { tagNumber: '0789204579', bookingPassengerId: MAYA.bp, flightId: FLIGHT_OUT },
    ]),
    new InMemoryCaseNumberSequence(),
    new MockSimulationClock(new Date('2026-10-20T09:00:00Z')),
    photos,
  )
  const matching = { suggestForReport: jest.fn().mockResolvedValue(undefined) }
  const controller = new GuestLostReportController(lookup, reports, matching as unknown as BagMatchingService)
  return { db, lookup, repository, reports, photos, matching, controller, verifyPassenger }
}

const VERIFICATION_FAILED = { code: 'INVALID_REPORT', message: 'Booking verification failed' }

const submission = (overrides: Partial<CreateGuestLostReportDto> = {}): CreateGuestLostReportDto =>
  Object.assign(new CreateGuestLostReportDto(), {
    bookingReference: 'k7qx2m',
    surname: ' eriksson ',
    travellerId: ERIK.bp,
    flightNumber: 'fy204',
    serviceDate: '2026-10-19',
    bagType: 'suitcase',
    colour: 'black',
    contactEmail: 'erik@example.com',
    ...overrides,
  })

const photo = {
  originalname: 'bag.jpg',
  mimetype: 'image/jpeg',
  size: 1024,
  buffer: Buffer.from('jpeg'),
} as unknown as UploadedLostReportPhoto

describe('Guest traveller options ("Whose bag is it?")', () => {
  it('lists every passenger on the booking who shares the surname, each with their own confirmed flights only', async () => {
    const { lookup } = setup()

    await expect(lookup.listEligibleTravellers({ bookingReference: 'K7QX2M', surname: 'Eriksson' })).resolves.toEqual([
      {
        travellerId: ANNA.bp,
        displayName: 'Anna Eriksson',
        flights: [
          { flightNumber: 'FY204', serviceDate: '2026-10-19', origin: 'BKK', destination: 'NRT' },
          { flightNumber: 'FY205', serviceDate: '2026-10-26', origin: 'NRT', destination: 'BKK' },
        ],
      },
      {
        travellerId: ERIK.bp,
        displayName: 'Erik Eriksson',
        flights: [{ flightNumber: 'FY204', serviceDate: '2026-10-19', origin: 'BKK', destination: 'NRT' }],
      },
    ])
  })

  it('returns only the selection fields: no passenger ids, flight ids, contact details or other bookings', async () => {
    const { lookup } = setup()

    const travellers = await lookup.listEligibleTravellers({ bookingReference: 'K7QX2M', surname: 'Eriksson' })

    for (const traveller of travellers) {
      expect(Object.keys(traveller).sort()).toEqual(['displayName', 'flights', 'travellerId'])
      for (const flight of traveller.flights)
        expect(Object.keys(flight).sort()).toEqual(['destination', 'flightNumber', 'origin', 'serviceDate'])
    }
    const serialized = JSON.stringify(travellers)
    for (const leaked of [ANNA.passenger, ERIK.passenger, FLIGHT_OUT, FLIGHT_BACK, 'Maya', 'Lind', 'Olof', 'FY900']) {
      expect(serialized).not.toContain(leaked)
    }
  })

  it.each([
    ['an unknown reference', { bookingReference: 'NOPE00', surname: 'Eriksson' }],
    ['a surname not on the booking', { bookingReference: 'K7QX2M', surname: 'Smith' }],
    ['a malformed reference', { bookingReference: 'K7-X2', surname: 'Eriksson' }],
    ['no body', undefined],
  ])('answers %s with the uniform failure', async (_label, body) => {
    const { lookup } = setup()

    await expect(lookup.listEligibleTravellers(body)).rejects.toMatchObject(VERIFICATION_FAILED)
  })
})

describe('Guest report submission', () => {
  it('creates the report for the server-verified traveller and flight, with no customer reporter, then runs matching', async () => {
    const { controller, repository, matching, verifyPassenger } = setup()

    const result = await controller.create(submission({ travellerId: ANNA.bp, tagNumber: undefined }))

    const stored = await repository.findByCaseNumber(result.caseNumber)
    expect(stored).toMatchObject({
      bookingPassengerId: ANNA.bp,
      passengerId: ANNA.passenger,
      flightId: FLIGHT_OUT,
      reportedByCustomerId: null,
      reportedByStaffId: null,
      status: 'open',
      contactEmail: 'erik@example.com',
    })
    expect(matching.suggestForReport).toHaveBeenCalledWith(stored!.id)
    expect(verifyPassenger).not.toHaveBeenCalled() // the signed-in verification is not used for guests
  })

  it('accepts a traveller who shares the surname with others on the booking (no rejection for a shared surname)', async () => {
    const { controller, repository } = setup()

    const result = await controller.create(submission({ travellerId: ERIK.bp }))

    expect((await repository.findByCaseNumber(result.caseNumber))?.bookingPassengerId).toBe(ERIK.bp)
  })

  it('returns exactly the minimal result: no ids, contact details or photo reference', async () => {
    const { controller } = setup()

    const result = await controller.create(submission({ tagNumber: '0789204578' }), photo)

    expect(result).toEqual({
      caseNumber: 'LB-2026-000001',
      status: 'open',
      flightNumber: 'FY204',
      serviceDate: '2026-10-19',
      bagType: 'suitcase',
      colour: 'black',
      tagNumber: '0789204578',
    })
  })

  it.each([
    ['a traveller from another booking', { travellerId: OLOF.bp }],
    ['a traveller on the booking with another surname', { travellerId: MAYA.bp }],
    ['a traveller id that does not exist', { travellerId: id(999) }],
    ['a malformed traveller id', { travellerId: 'not-a-uuid' }],
    ['a traveller without a confirmed coupon for the flight', { travellerId: ERIK.bp, flightNumber: 'FY205', serviceDate: '2026-10-26' }],
    ['a flight on another booking', { flightNumber: 'FY900', serviceDate: '2026-10-19' }],
    ['a flight number on the wrong date', { flightNumber: 'FY204', serviceDate: '2026-10-20' }],
    ['an impossible date', { serviceDate: '2026-02-30' }],
    ['a malformed flight number', { flightNumber: 'FY 204!' }],
    ['an unknown reference', { bookingReference: 'NOPE00' }],
    ['a wrong surname', { surname: 'Smith' }],
    ['a malformed reference', { bookingReference: 'K7QX2' }],
  ])('rejects %s with the uniform failure and creates nothing', async (_label, overrides) => {
    const { controller, repository, matching, photos } = setup()

    await expect(controller.create(submission(overrides), photo)).rejects.toMatchObject(VERIFICATION_FAILED)

    expect(await repository.findByCaseNumber('LB-2026-000001')).toBeNull()
    expect(photos.upload).not.toHaveBeenCalled()
    expect(matching.suggestForReport).not.toHaveBeenCalled()
  })

  it('does not query the database for a malformed reference or surname', async () => {
    const { controller, db } = setup()

    await expect(controller.create(submission({ surname: '   ' }))).rejects.toMatchObject(VERIFICATION_FAILED)
    expect(db.flight.findUnique).not.toHaveBeenCalled()
    expect(db.booking_coupon.findFirst).not.toHaveBeenCalled()
  })

  it('applies the shared tag ownership rule to the verified traveller', async () => {
    const { controller } = setup()

    // 0789204579 is Maya's bag; Erik cannot report it as his.
    await expect(controller.create(submission({ tagNumber: '0789204579' }))).rejects.toMatchObject({ code: 'TAG_NOT_ON_BOOKING' })
  })

  it('applies the shared field rules (a contact method is required)', async () => {
    const { controller, repository } = setup()

    await expect(controller.create(submission({ contactEmail: undefined, contactPhone: undefined }))).rejects.toMatchObject({
      code: 'INVALID_REPORT',
      message: 'Email or phone is required',
    })
    expect(await repository.findByCaseNumber('LB-2026-000001')).toBeNull()
  })

  it('uploads an optional photo for the new report', async () => {
    const { controller, repository, photos } = setup()

    const result = await controller.create(submission(), photo)

    const stored = await repository.findByCaseNumber(result.caseNumber)
    expect(photos.upload).toHaveBeenCalledWith(stored!.id, photo)
    expect(stored?.photoUrl).toBe(`/api/customer/lost-reports/${result.caseNumber}/photo`)
  })

  it('creates a report without a photo when none is sent', async () => {
    const { controller, repository, photos } = setup()

    const result = await controller.create(submission())

    expect(photos.upload).not.toHaveBeenCalled()
    expect((await repository.findByCaseNumber(result.caseNumber))?.photoUrl).toBeNull()
  })

  it('removes the uploaded photo when the report cannot be saved (duplicate live report for the tag)', async () => {
    const { controller, photos, matching } = setup()
    await controller.create(submission({ tagNumber: '0789204578' }))
    matching.suggestForReport.mockClear()

    await expect(controller.create(submission({ tagNumber: '0789204578' }), photo)).rejects.toMatchObject({ code: 'REPORT_EXISTS' })

    expect(photos.upload).toHaveBeenCalledTimes(1)
    expect(photos.remove).toHaveBeenCalledWith((photos.upload.mock.calls[0] as [string])[0])
    expect(matching.suggestForReport).not.toHaveBeenCalled()
  })
})

describe('CreateGuestLostReportDto (as validated by the controller pipe)', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
  const validate = (body: Record<string, unknown>) => pipe.transform(body, { type: 'body', metatype: CreateGuestLostReportDto })
  const body = {
    bookingReference: 'K7QX2M',
    surname: 'Eriksson',
    travellerId: ERIK.bp,
    flightNumber: 'FY204',
    serviceDate: '2026-10-19',
    bagType: 'suitcase',
    colour: 'black',
    contactEmail: 'erik@example.com',
  }

  it('accepts a valid guest report body', async () => {
    await expect(validate(body)).resolves.toBeInstanceOf(CreateGuestLostReportDto)
  })

  it.each(['flightId', 'passengerId', 'bookingPassengerId', 'bookingId', 'reportedByCustomerId'])(
    'rejects a client-supplied %s instead of trusting it',
    async (field) => {
      await expect(validate({ ...body, [field]: FLIGHT_OUT })).rejects.toBeInstanceOf(BadRequestException)
    },
  )

  it('rejects an unknown bag type, as the signed-in form does', async () => {
    await expect(validate({ ...body, bagType: 'crate' })).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('Guest controllers', () => {
  it.each([
    [GuestLostReportController, 'guest/lost-reports', 'create', 201],
    [GuestLostReportTravellersController, 'guest/lost-report-travellers', 'list', 200],
  ] as const)('%p is a public POST with no customer guard', (controller, path, method, status) => {
    const handler = Object.getOwnPropertyDescriptor(controller.prototype, method)!.value as object

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, controller)).toBe(true)
    expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(path)
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST)
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(status)
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toBeUndefined()
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined()
  })

  it('the traveller controller passes the raw body to the lookup', async () => {
    const lookup = { listEligibleTravellers: jest.fn().mockResolvedValue([]) }
    const body = { bookingReference: 'K7QX2M', surname: 'Eriksson' }

    await new GuestLostReportTravellersController(lookup as never).list(body)

    expect(lookup.listEligibleTravellers).toHaveBeenCalledWith(body)
  })
})
