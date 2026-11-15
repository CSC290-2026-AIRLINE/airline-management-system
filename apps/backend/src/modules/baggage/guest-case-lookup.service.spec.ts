jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

import { RequestMethod } from '@nestjs/common'
import { GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { IS_PUBLIC_KEY } from '@backend/auth/decorators/public.decorator'
import type { DbService } from '@backend/db/db.service'
import type { PassengerCaseSummary } from './common/passenger-case-summary.types'
import { GuestCaseLookupService } from './guest-case-lookup.service'
import { GuestLostReportCaseLookupController } from './guest-lost-report-case-lookup.controller'
import type { PrismaReportRepository } from './prisma-report.repository'

const OWNER_REPORT = '00000000-0000-4000-8000-000000000501'
const COTRAVELLER_REPORT = '00000000-0000-4000-8000-000000000502'

// Booking K7QX2M: Anna Eriksson owns LB-2026-000121; Maya Lind (same booking) owns LB-2026-000122.
const REPORTS = [
  { id: OWNER_REPORT, case_number: 'LB-2026-000121', booking_reference: 'K7QX2M', last_name: 'Eriksson', passenger_deleted: false },
  { id: COTRAVELLER_REPORT, case_number: 'LB-2026-000122', booking_reference: 'K7QX2M', last_name: 'Lind', passenger_deleted: false },
]

type ReportWhere = {
  case_number: string
  passenger: { last_name: { equals: string; mode: string }; deleted_at: null }
  booking_coupon: { booking_passenger: { booking: { booking_reference: string } } }
}

/** The authenticated passenger summary, full of fields a guest must never see. */
const fullSummary = (overrides: Partial<PassengerCaseSummary> = {}): PassengerCaseSummary => ({
  caseNumber: 'LB-2026-000121',
  status: 'delivering',
  reportedAt: new Date('2026-10-19T08:00:00Z'),
  lostAt: null,
  closedAt: null,
  passenger: { firstName: 'Anna', lastName: 'Eriksson' },
  flight: { flightNumber: 'FY204', serviceDate: new Date('2026-10-19T00:00:00Z'), origin: 'BKK', destination: 'NRT' },
  bag: { type: 'suitcase', colour: 'black', brand: 'Samsonite', tagNumber: '0789204578', description: 'Laptop inside, red ribbon' },
  delivery: { deliveryType: 'hotel', address: 'Hotel Gracery, Shinjuku', pickupAirport: null, status: 'in_transit' },
  timeline: [
    { type: 'report_received', occurredAt: new Date('2026-10-19T08:00:00Z') },
    { type: 'match_confirmed', occurredAt: new Date('2026-10-20T09:00:00Z') },
    { type: 'choice_saved', occurredAt: new Date('2026-10-20T10:00:00Z'), deliveryType: 'hotel', chosenBy: 'passenger' },
    { type: 'bag_sent', occurredAt: new Date('2026-10-20T11:00:00Z'), fromAirport: 'BKK', toAirport: 'NRT' },
    { type: 'bag_arrived', occurredAt: new Date('2026-10-20T18:00:00Z'), airport: 'NRT' },
    { type: 'out_for_delivery', occurredAt: new Date('2026-10-21T09:00:00Z'), airport: 'NRT' },
  ],
  ...overrides,
})

function setup(summary: PassengerCaseSummary | null = fullSummary()) {
  const findFirst = jest.fn(({ where }: { where: ReportWhere }) => {
    const hit = REPORTS.find(
      (r) =>
        r.case_number === where.case_number &&
        r.last_name.toLowerCase() === where.passenger.last_name.equals.toLowerCase() &&
        !r.passenger_deleted &&
        r.booking_reference === where.booking_coupon.booking_passenger.booking.booking_reference,
    )
    return Promise.resolve(hit ? { id: hit.id } : null)
  })
  const findSummary = jest.fn().mockResolvedValue(summary)
  const service = new GuestCaseLookupService(
    { lost_bag_report: { findFirst } } as unknown as DbService,
    { findPassengerCaseSummaryByReportId: findSummary } as unknown as PrismaReportRepository,
  )
  return { service, findFirst, findSummary }
}

const FAILED = { code: 'INVALID_REPORT', message: 'Booking verification failed' }
const OWNER_LOOKUP = { caseNumber: 'LB-2026-000121', bookingReference: 'K7QX2M', surname: 'Eriksson' }

describe('GuestCaseLookupService', () => {
  it("opens the case for its own bag owner's booking reference and surname (normalized)", async () => {
    const { service, findFirst, findSummary } = setup()

    const result = await service.lookUp({ caseNumber: ' lb-2026-000121 ', bookingReference: ' k7qx2m ', surname: ' ERIKSSON ' })

    expect(result.caseNumber).toBe('LB-2026-000121')
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        case_number: 'LB-2026-000121',
        passenger: { last_name: { equals: 'ERIKSSON', mode: 'insensitive' }, deleted_at: null },
        booking_coupon: { booking_passenger: { booking: { booking_reference: 'K7QX2M' } } },
      },
      select: { id: true },
    })
    expect(findSummary).toHaveBeenCalledWith(OWNER_REPORT)
  })

  it('returns only the allowlisted guest fields', async () => {
    const { service } = setup()

    const result = await service.lookUp(OWNER_LOOKUP)

    expect(result).toEqual({
      caseNumber: 'LB-2026-000121',
      status: 'delivering',
      reportedAt: new Date('2026-10-19T08:00:00Z'),
      lostAt: null,
      closedAt: null,
      flight: { flightNumber: 'FY204', serviceDate: new Date('2026-10-19T00:00:00Z'), origin: 'BKK', destination: 'NRT' },
      bag: { type: 'suitcase', colour: 'black' },
      delivery: { status: 'in_transit' },
      timeline: [
        { type: 'report_received', occurredAt: new Date('2026-10-19T08:00:00Z') },
        { type: 'match_confirmed', occurredAt: new Date('2026-10-20T09:00:00Z') },
        { type: 'bag_sent', occurredAt: new Date('2026-10-20T11:00:00Z') },
        { type: 'out_for_delivery', occurredAt: new Date('2026-10-21T09:00:00Z') },
      ],
    })
    const serialized = JSON.stringify(result)
    for (const secret of [
      'Anna',
      'Hotel Gracery',
      'hotel',
      'Samsonite',
      '0789204578',
      'Laptop',
      'choice_saved',
      'bag_arrived',
      OWNER_REPORT,
    ]) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('keeps the delivery null when no delivery exists, and lost/closed dates as they are', async () => {
    const lostAt = new Date('2026-11-09T08:00:00Z')
    const { service } = setup(fullSummary({ status: 'lost', delivery: null, lostAt, timeline: [] }))

    await expect(service.lookUp(OWNER_LOOKUP)).resolves.toMatchObject({ status: 'lost', delivery: null, lostAt, timeline: [] })
  })

  it.each([
    ['a wrong case number', { ...OWNER_LOOKUP, caseNumber: 'LB-2026-000999' }],
    ['a wrong booking reference', { ...OWNER_LOOKUP, bookingReference: 'ZZZZZ9' }],
    ['a wrong surname', { ...OWNER_LOOKUP, surname: 'Smith' }],
    // Same booking, but the case belongs to another traveller: Maya Lind cannot open Anna's case.
    ['a same-booking co-traveller', { ...OWNER_LOOKUP, surname: 'Lind' }],
    ["the owner's surname on the co-traveller's case", { ...OWNER_LOOKUP, caseNumber: 'LB-2026-000122' }],
  ])('rejects %s with the uniform failure', async (_label, body) => {
    const { service, findSummary } = setup()

    await expect(service.lookUp(body)).rejects.toMatchObject(FAILED)
    expect(findSummary).not.toHaveBeenCalled()
  })

  it.each([
    ['a malformed case number', { ...OWNER_LOOKUP, caseNumber: 'LB-26-121' }],
    ['a missing case number', { bookingReference: 'K7QX2M', surname: 'Eriksson' }],
    ['a malformed reference', { ...OWNER_LOOKUP, bookingReference: 'K7-X2' }],
    ['an empty surname', { ...OWNER_LOOKUP, surname: '  ' }],
    ['non-string values', { caseNumber: 121, bookingReference: ['K7QX2M'], surname: {} }],
    ['no body', undefined],
  ])('rejects %s with the same failure, without querying', async (_label, body) => {
    const { service, findFirst } = setup()

    await expect(service.lookUp(body)).rejects.toMatchObject(FAILED)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('fails uniformly if the summary cannot be built', async () => {
    const { service } = setup(null)

    await expect(service.lookUp(OWNER_LOOKUP)).rejects.toMatchObject(FAILED)
  })
})

describe('GuestLostReportCaseLookupController', () => {
  it('is a public POST /guest/lost-report-case-lookup answering 200, with no customer guard', () => {
    const handler = Object.getOwnPropertyDescriptor(GuestLostReportCaseLookupController.prototype, 'lookUp')!.value as object

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, GuestLostReportCaseLookupController)).toBe(true)
    expect(Reflect.getMetadata(PATH_METADATA, GuestLostReportCaseLookupController)).toBe('guest/lost-report-case-lookup')
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST)
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200)
    expect(Reflect.getMetadata(GUARDS_METADATA, GuestLostReportCaseLookupController)).toBeUndefined()
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined()
  })

  it('passes the raw body to the service', async () => {
    const cases = { lookUp: jest.fn().mockResolvedValue({ caseNumber: 'LB-2026-000121' }) }

    await new GuestLostReportCaseLookupController(cases as never).lookUp(OWNER_LOOKUP)

    expect(cases.lookUp).toHaveBeenCalledWith(OWNER_LOOKUP)
  })
})
