import { Logger } from '@nestjs/common'
import type { Actor } from './actor'
import { CheckInService } from './checkin.service'
import { SPECIMEN_LINE1, buildLine2, buildSpecimenLine2 } from './domain/mrz'
import { AIRPORTS, BOOKINGS, DEMO_NOW, FLIGHTS } from './providers/fixtures'
import {
  FixtureBookings,
  FixtureClock,
  FixtureFlights,
  FixturePassengers,
  FixturePayments,
  FixturePolice,
  FixturePricing,
  FixtureScreening,
  FixtureSeats,
  FixtureSettings,
  FixtureTiers,
  LoggerAudit,
  LoggerNotify,
} from './providers/fixture-providers'
import type { BookingPassenger, FlightRecord, PassengerProfile } from './providers/providers'
import { CheckInStore } from './store/checkin-store'

const cust: Actor = { userId: 'user-anna', staffId: null }
const staff: Actor = { userId: 'user-staff', staffId: 'staff-demo' }

/** The demo passenger Sara Lopez with a specimen passport: a different given name, so the name flags. */
const SARA_LINE1 = 'P<UTO' + 'LOPEZ'.padEnd(10, '<') + 'MARIA'.padEnd(29, '<')
const SARA_LINE2 = buildLine2({ number: 'UTO123456', nationality3: 'UTO', dob: '910829', sex: 'F', expiry: '300415' })

/** One extra passport holder, for the duplicate document rule. */
class PassengersWithExtra extends FixturePassengers {
  extra: PassengerProfile | null = null

  override async findByPassportNumber(n: string): Promise<PassengerProfile[]> {
    const rows = await super.findByPassportNumber(n)
    const extra = this.extra
    return extra && extra.passportNumber === n ? [...rows, extra] : rows
  }
}

function build() {
  const clock = new FixtureClock()
  const store = new CheckInStore(clock)
  const passengers = new PassengersWithExtra()
  const seats = new FixtureSeats(clock)
  const payments = new FixturePayments()
  const audit = new LoggerAudit()
  const svc = new CheckInService(
    clock,
    new FixtureFlights(),
    new FixtureBookings(),
    passengers,
    seats,
    new FixturePricing(),
    payments,
    new FixtureScreening(),
    new FixturePolice(),
    new FixtureTiers(),
    new LoggerNotify(),
    audit,
    new FixtureSettings(),
    store,
  )
  return { svc, clock, store, passengers, payments, audit, seats }
}

const addedBookings: BookingPassenger[] = []
const addedFlights: FlightRecord[] = []

function addBooking(booking: BookingPassenger): void {
  addedBookings.push(booking)
  BOOKINGS.push(booking)
}

function addFlight(flight: FlightRecord): void {
  addedFlights.push(flight)
  FLIGHTS.push(flight)
}

afterEach(() => {
  for (const booking of addedBookings.splice(0)) {
    const i = BOOKINGS.indexOf(booking)
    if (i >= 0) BOOKINGS.splice(i, 1)
  }
  for (const flight of addedFlights.splice(0)) {
    const i = FLIGHTS.indexOf(flight)
    if (i >= 0) FLIGHTS.splice(i, 1)
  }
  jest.restoreAllMocks()
})

describe('CheckInService.start', () => {
  it('start creates a started check-in for a paid booking in the window', async () => {
    const { svc } = build()
    const view = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    expect(view).toMatchObject({
      status: 'started',
      steps: { document: false, seat: false, baggage: false, boardingPass: false },
      window: { isOpen: true },
    })
    expect(view.booking).toEqual({ pnr: 'ER204F', bookingPassengerId: 'bp-er204f' })
  })

  it('start is idempotent and returns the checked-in passenger as-is', async () => {
    const { svc } = build()
    const a = await svc.start(cust, { pnr: 'EC204G', lastName: 'Saetang' })
    expect(a.status).toBe('checked_in')
    expect(await svc.start(cust, { pnr: 'EC204G', lastName: 'Saetang' })).toMatchObject({ id: a.id })
  })

  it('start rejects unknown PNR, unpaid booking, cancelled flight and a closed window', async () => {
    const { svc, clock } = build()
    addFlight({
      id: 'flt-test-cancelled',
      flightNumber: 'FY 999',
      serviceDate: '2026-11-11',
      depAt: new Date('2026-11-11T04:00:00.000Z'),
      status: 'cancelled',
      origin: AIRPORTS.BKK,
      destination: AIRPORTS.NRT,
      routeId: 'rt-bkk-nrt',
    })
    addBooking({
      bookingPassengerId: 'bp-test-unpaid',
      pnr: 'XX000U',
      paid: false,
      flightId: 'flt-fy204',
      passengerId: 'pax-test-unpaid',
      firstName: 'Test',
      lastName: 'Unpaid',
      cabin: 'economy',
      fareClass: 'Y',
      specialAssistance: [],
      isPolice: false,
    })
    addBooking({
      bookingPassengerId: 'bp-test-cancelled',
      pnr: 'XX000C',
      paid: true,
      flightId: 'flt-test-cancelled',
      passengerId: 'pax-test-cancelled',
      firstName: 'Test',
      lastName: 'Cancelled',
      cabin: 'economy',
      fareClass: 'Y',
      specialAssistance: [],
      isPolice: false,
    })

    await expect(svc.start(cust, { pnr: 'ZZ9999', lastName: 'Nobody' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(svc.start(cust, { pnr: 'XX000U', lastName: 'Unpaid' })).rejects.toMatchObject({
      code: 'NOT_ELIGIBLE',
      details: { reason: 'unpaid' },
    })
    await expect(svc.start(cust, { pnr: 'XX000C', lastName: 'Cancelled' })).rejects.toMatchObject({
      code: 'NOT_ELIGIBLE',
      details: { reason: 'flight_cancelled' },
    })

    clock.set(new Date(DEMO_NOW.getTime() + 2 * 3600_000))
    await expect(svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })).rejects.toMatchObject({
      code: 'WINDOW_CLOSED',
      details: { closesAt: '2026-11-11T02:25:00.000Z' },
    })
  })

  it('start audits the new check-in', async () => {
    const { svc, audit } = build()
    const spy = jest.spyOn(audit, 'record')
    await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ action: 'check_in.start' }))
  })
})

describe('CheckInService.get', () => {
  it('get refuses another customer but a staff member may read it', async () => {
    const { svc } = build()
    const c = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    await expect(svc.get({ userId: 'user-other', staffId: null }, c.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(svc.get(staff, c.id)).resolves.toBeTruthy()
  })

  it('get audits view_sensitive once a document exists', async () => {
    const { svc, audit } = build()
    const c = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    const spy = jest.spyOn(audit, 'record')
    await svc.get(cust, c.id)
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'view_sensitive' }))
    await svc.submitDocument(cust, c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })
    spy.mockClear()
    await svc.get(cust, c.id)
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ action: 'view_sensitive', isSensitive: true }))
  })
})

describe('CheckInService.submitDocument', () => {
  it('accepts the specimen, flags nothing for Anna, fills her profile, stores only last4', async () => {
    const { svc, store, passengers } = build()
    const c = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    const v = await svc.submitDocument(cust, c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })
    expect(v.document).toMatchObject({ numberLast4: '02C3', nameMismatch: false, visaRequired: false, issuingCountry: 'ut' })
    expect(v.steps.document).toBe(true)
    expect(JSON.stringify(store.getDocumentByCheckIn(c.id))).not.toContain('L898902C3')
    expect(await passengers.byId('pax-er204f')).toMatchObject({ passportNumber: 'L898902C3', nationality: 'ut' })
  })

  it('names the failed MRZ check', async () => {
    const { svc } = build()
    const c = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    const l2 = buildSpecimenLine2()
    await expect(
      svc.submitDocument(cust, c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: l2.slice(0, 21) + '310415' + l2.slice(27) }),
    ).rejects.toMatchObject({ code: 'MRZ_INVALID', details: { failedCheck: 'expiry' } })
  })

  it('blocks a passport expiring within 6 months', async () => {
    const { svc } = build()
    const c = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    const l2 = buildLine2({ number: 'L898902C3', nationality3: 'UTO', dob: '740812', sex: 'F', expiry: '270401' })
    await expect(svc.submitDocument(cust, c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: l2 })).rejects.toMatchObject({
      code: 'PASSPORT_EXPIRING',
    })
  })

  it('requires a visa number when the table says so', async () => {
    const { svc } = build()
    addBooking({
      bookingPassengerId: 'bp-test-visa',
      pnr: 'VS318X',
      paid: true,
      flightId: 'flt-fy318',
      passengerId: 'pax-ec318d',
      firstName: 'Sara',
      lastName: 'Lopez',
      cabin: 'economy',
      fareClass: 'Y',
      specialAssistance: [],
      isPolice: false,
    })
    const c = await svc.start(cust, { pnr: 'VS318X', lastName: 'Lopez' })
    await expect(svc.submitDocument(cust, c.id, { mrzLine1: SARA_LINE1, mrzLine2: SARA_LINE2 })).rejects.toMatchObject({
      code: 'VISA_REQUIRED',
    })
    const v = await svc.submitDocument(cust, c.id, { mrzLine1: SARA_LINE1, mrzLine2: SARA_LINE2, visaNumber: 'V123' })
    expect(v.document).toMatchObject({ visaRequired: true, visaNumber: 'V123', nameMismatch: true })
  })

  it('blocks a duplicate passport with a different identity and passes the same identity', async () => {
    const { svc, passengers } = build()
    const c = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    passengers.extra = {
      id: 'pax-other',
      firstName: 'Someone',
      lastName: 'Else',
      dateOfBirth: '1974-08-12',
      gender: 'F',
      nationality: 'ut',
      passportNumber: 'L898902C3',
    }
    await expect(svc.submitDocument(cust, c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })).rejects.toMatchObject({
      code: 'DUPLICATE_DOCUMENT',
    })
    passengers.extra = {
      id: 'pax-other',
      firstName: 'Anna',
      lastName: 'Eriksson',
      dateOfBirth: '1974-08-12',
      gender: 'F',
      nationality: 'ut',
      passportNumber: 'L898902C3',
    }
    await expect(svc.submitDocument(cust, c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })).resolves.toMatchObject({
      document: { numberLast4: '02C3' },
    })
  })

  it('puts a held passenger on hold and later steps say ON_HOLD', async () => {
    const { svc } = build()
    const c = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    const l2 = buildLine2({ number: 'HLD000000', nationality3: 'UTO', dob: '740812', sex: 'F', expiry: '300415' })
    const v = await svc.submitDocument(cust, c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: l2 })
    expect(v.status).toBe('on_hold')
    await expect(svc.holdSeat(cust, 'flt-fy204', { checkInId: c.id, seatCode: '7E' })).rejects.toMatchObject({ code: 'ON_HOLD' })
    await expect(svc.complete(cust, c.id)).rejects.toMatchObject({ code: 'ON_HOLD' })
  })

  it('never logs an MRZ line', async () => {
    const { svc } = build()
    const log = jest.spyOn(Logger.prototype, 'log')
    const warn = jest.spyOn(Logger.prototype, 'warn')
    const error = jest.spyOn(Logger.prototype, 'error')
    const c = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    await svc.submitDocument(cust, c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })
    for (const spy of [log, warn, error]) {
      for (const call of spy.mock.calls) {
        expect(String(call[0])).not.toContain(SPECIMEN_LINE1)
        expect(JSON.stringify(call)).not.toContain('L898902C3')
      }
    }
  })
})

describe('CheckInService seats', () => {
  it('refuses an exit row for special assistance', async () => {
    const { svc, store } = build()
    const somchai = store.listCheckInsByFlight('flt-fy204').find((c) => c.pnr === 'SA204B')!
    store.updateCheckIn(somchai.id, { status: 'started' })
    await expect(svc.holdSeat(staff, 'flt-fy204', { checkInId: somchai.id, seatCode: '12A' })).rejects.toMatchObject({
      code: 'VALIDATION',
      details: { reason: 'exit_row_special_assistance' },
    })
  })

  it('charges a paid seat, confirms, and a later change updates the pass in place', async () => {
    const { svc } = build()
    const c = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    await svc.submitDocument(cust, c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })

    const lock = await svc.holdSeat(cust, 'flt-fy204', { checkInId: c.id, seatCode: '4A' })
    expect(lock.fee).toBe(250)
    const confirmed = await svc.confirmSeat(cust, c.id, { lockId: lock.id })
    expect(confirmed.seat).toMatchObject({ code: '4A', fee: 250, paymentId: 'pay-1' })

    const pass = await svc.complete(cust, c.id)
    expect(pass.seat).toBe('4A')

    const lock2 = await svc.holdSeat(cust, 'flt-fy204', { checkInId: c.id, seatCode: '18B' })
    await svc.confirmSeat(cust, c.id, { lockId: lock2.id })
    const after = await svc.boardingPass(cust, c.id)
    expect(after.seat).toBe('18B')
    expect(after.reference).toBe(pass.reference)
  })
})

describe('CheckInService.complete', () => {
  it('assigns a free standard seat, sets checked_in_at, group 4 for Anna', async () => {
    const { svc, store } = build()
    const c = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    await svc.submitDocument(cust, c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })
    const p = await svc.complete(cust, c.id)
    expect(p.seat).toMatch(/^(?:[6-9]|1[0-9]|20)[A-F]$/)
    expect(p.boardingGroup).toBe(4)
    expect(p.gate).toBe('A1')
    expect(p.boardingAt).toBe('2026-11-11T02:45:00.000Z')
    expect(p.reference).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    expect(p.qrPayload).toBe(p.reference)
    expect((await svc.get(cust, c.id)).status).toBe('checked_in')
    expect(store.getCheckIn(c.id)!.checked_in_at).toEqual(new Date(DEMO_NOW))
  })

  it('is idempotent', async () => {
    const { svc, store } = build()
    const c = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    await svc.submitDocument(cust, c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })
    const a = await svc.complete(cust, c.id)
    const b = await svc.complete(cust, c.id)
    expect(b.reference).toBe(a.reference)
    expect(store.listPasses()).toHaveLength(14)
  })

  it('without a document is INVALID_STATE', async () => {
    const { svc } = build()
    const c = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    await expect(svc.complete(cust, c.id)).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })
})

describe('CheckInService.declareBags', () => {
  it('validates 0..10 integers', async () => {
    const { svc } = build()
    const c = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    await expect(svc.declareBags(cust, c.id, { declaredBags: -1 })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(svc.declareBags(cust, c.id, { declaredBags: 11 })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(svc.declareBags(cust, c.id, { declaredBags: 1.5 })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(svc.declareBags(cust, c.id, { declaredBags: 2 })).resolves.toMatchObject({ declaredBags: 2 })
  })
})

describe('CheckInService.applyScreeningResult', () => {
  it('held after the pass puts the check-in on hold and clear restores checked_in', async () => {
    const { svc, store } = build()
    const c = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    await svc.submitDocument(cust, c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })
    await svc.complete(cust, c.id)
    await svc.applyScreeningResult(c.id, 'held')
    expect(store.getCheckIn(c.id)!.status).toBe('on_hold')
    await svc.applyScreeningResult(c.id, 'clear')
    expect(store.getCheckIn(c.id)!.status).toBe('checked_in')
  })
})

describe('CheckInService.releaseExpiredHolds', () => {
  it('releases the seat and marks no-show after the window closes', async () => {
    const { svc, clock, store, seats } = build()
    const c = await svc.start(cust, { pnr: 'ER204F', lastName: 'Eriksson' })
    await svc.submitDocument(cust, c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })
    const lock = await svc.holdSeat(cust, 'flt-fy204', { checkInId: c.id, seatCode: '7E' })
    await svc.confirmSeat(cust, c.id, { lockId: lock.id })
    await svc.applyScreeningResult(c.id, 'held')
    expect(store.getCheckIn(c.id)!.status).toBe('on_hold')

    clock.set(new Date(DEMO_NOW.getTime() + 3 * 3600_000))
    expect(await svc.releaseExpiredHolds()).toBeGreaterThanOrEqual(1)
    expect(store.getCheckIn(c.id)!.status).toBe('no_show')
    expect(await seats.assigned('bp-er204f')).toBeNull()
  })
})
