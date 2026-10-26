import { DEMO_NOW } from './fixtures'
import {
  FixtureBookings,
  FixtureClock,
  FixturePassengers,
  FixturePayments,
  FixturePricing,
  FixtureScreening,
  FixtureSeats,
  FixtureSettings,
} from './fixture-providers'

describe('FixtureSeats', () => {
  it('seat hold is exclusive, expires after ttl and confirm fails after expiry', async () => {
    const clock = new FixtureClock()
    const seats = new FixtureSeats(clock)
    const a = await seats.hold('flt-fy204', '17E', 'bp-er204f', 300_000)
    await expect(seats.hold('flt-fy204', '17E', 'bp-ec204g', 300_000)).rejects.toMatchObject({ code: 'SEAT_TAKEN' })
    clock.set(new Date(DEMO_NOW.getTime() + 300_001))
    await expect(seats.confirm(a.id)).rejects.toMatchObject({ code: 'LOCK_EXPIRED' })
    await expect(seats.hold('flt-fy204', '17E', 'bp-ec204g', 300_000)).resolves.toMatchObject({ seatCode: '17E' })
  })

  it('seat map marks taken, blocked, business rows and fees', async () => {
    const seats = new FixtureSeats(new FixtureClock())
    const m = await seats.seatMap('flt-fy204', { bookingPassengerId: 'bp-er204f', cabin: 'economy' })
    const find = (code: string) => m.rows.flatMap((r) => r.seats).find((s) => s.code === code)!
    expect(find('1A').status).toBe('taken')
    expect(find('1C').status).toBe('blocked')
    expect(find('20E').status).toBe('blocked')
    expect(find('12A')).toMatchObject({ type: 'exit', fee: 450 })
    expect(find('4A')).toMatchObject({ type: 'front', fee: 250 })
    expect(find('18B')).toMatchObject({ type: 'standard', fee: 0, status: 'free' })
  })

  it('a seat of another cabin cannot be held', async () => {
    const seats = new FixtureSeats(new FixtureClock())
    await expect(seats.hold('flt-fy204', '1D', 'bp-er204f', 300_000)).rejects.toMatchObject({ code: 'SEAT_TAKEN' })
  })

  it('assignAnyStandard skips exit rows when asked and taken seats', async () => {
    const seats = new FixtureSeats(new FixtureClock())
    const seat = await seats.assignAnyStandard('flt-fy204', 'bp-er204f', { avoidExitRow: true })
    expect(seat.seatCode).toMatch(/^(?:[6-9]|1[0-9]|20)[A-F]$/)
    expect(seat.type).toBe('standard')
    expect(await seats.assigned('bp-er204f')).toMatchObject({ seatCode: seat.seatCode })
    await expect(seats.assignAnyStandard('flt-fy204', 'bp-ec204g', { avoidExitRow: true })).resolves.not.toMatchObject({
      seatCode: seat.seatCode,
    })
  })

  it('a new hold releases the passenger previous hold', async () => {
    const seats = new FixtureSeats(new FixtureClock())
    const first = await seats.hold('flt-fy204', '17E', 'bp-er204f', 300_000)
    await seats.hold('flt-fy204', '19D', 'bp-er204f', 300_000)
    await expect(seats.confirm(first.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(seats.confirm('lock-2')).resolves.toMatchObject({ seatCode: '19D' })
  })
})

describe('FixtureBookings', () => {
  it('bookings are found by PNR + surname, case-insensitive', async () => {
    expect(await new FixtureBookings().findByPnrAndLastName('er204f', 'ERIKSSON')).toHaveLength(1)
    expect(await new FixtureBookings().findByPnrAndLastName('ER204F', 'eriksson')).toHaveLength(1)
    expect(await new FixtureBookings().findByPnrAndLastName('ER204F', 'Erikson')).toHaveLength(0)
  })

  it('the demo has 14 bookings, one police and two special assistance', async () => {
    const bookings = await new FixtureBookings().listByFlight('flt-fy204')
    expect(bookings).toHaveLength(9)
    expect(bookings.filter((b) => b.isPolice).map((b) => b.lastName)).toEqual(['Sukjai'])
    expect(bookings.filter((b) => b.specialAssistance.length > 0).map((b) => b.specialAssistance)).toEqual([['WCHR']])
  })
})

describe('FixtureScreening', () => {
  it('screening holds on the demo last4 and clears the specimen', async () => {
    const screening = new FixtureScreening()
    expect(
      await screening.check({ passengerId: 'pax-hd204h', flightId: 'flt-fy204', numberLast4: '0000', lastName: 'Kowalski' }),
    ).toMatchObject({ outcome: 'held' })
    expect(
      await screening.check({ passengerId: 'pax-er204f', flightId: 'flt-fy204', numberLast4: '02C3', lastName: 'Eriksson' }),
    ).toMatchObject({ outcome: 'clear' })
  })
})

describe('FixturePassengers', () => {
  it('fills empty profile fields and never overwrites', async () => {
    const passengers = new FixturePassengers()
    await passengers.fill('pax-er204f', { passportNumber: 'L898902C3', nationality: 'ut' })
    expect(await passengers.byId('pax-er204f')).toMatchObject({ passportNumber: 'L898902C3', nationality: 'ut' })
    await passengers.fill('pax-er204f', { passportNumber: 'OTHER' })
    expect(await passengers.byId('pax-er204f')).toMatchObject({ passportNumber: 'L898902C3' })
  })

  it('finds a profile by passport number', async () => {
    expect(await new FixturePassengers().findByPassportNumber('SEC000000')).toHaveLength(1)
  })
})

describe('FixturePricing and FixturePayments', () => {
  it('baggage allowance comes from the fare class and the seat fee from the seat type', async () => {
    const pricing = new FixturePricing()
    expect(await pricing.baggage('Y', 'rt-bkk-nrt')).toEqual({ freeKg: 20, ratePerKg: 500, maxBagKg: 32 })
    expect(await pricing.baggage('J', 'rt-bkk-nrt')).toEqual({ freeKg: 30, ratePerKg: 500, maxBagKg: 32 })
    expect(await pricing.seatFee('economy', 'exit')).toBe(450)
    expect(await pricing.seatFee('economy', 'standard')).toBe(0)
  })

  it('payments hand out a new id each time', async () => {
    const payments = new FixturePayments()
    expect(await payments.charge({ amount: 1500, currency: 'THB', purpose: 'excess_baggage', reference: 'r' })).toEqual({
      paymentId: 'pay-1',
    })
    expect(await payments.charge({ amount: 250, currency: 'THB', purpose: 'seat', reference: 'r' })).toEqual({ paymentId: 'pay-2' })
  })
})

describe('FixtureSettings', () => {
  it('settings: visa rule lookup, no row = not required', async () => {
    const s = new FixtureSettings()
    expect(await s.visaRequired('ut', 'kr')).toBe(true)
    expect(await s.visaRequired('ut', 'jp')).toBe(false)
    expect(await s.window()).toEqual({ checkInOpensHours: 24, checkInClosesMinutes: 60, boardingStartsMinutes: 40 })
    expect(await s.checkedBagMaxLinearCm()).toBe(158)
    expect(await s.bagTagAirlineNumber()).toBe('402')
    expect(await s.carryOn('business')).toEqual({ maxKg: 7, maxLengthCm: 56, maxWidthCm: 36, maxHeightCm: 23 })
  })
})

describe('FixtureClock', () => {
  it('starts at the demo instant and can be moved', () => {
    const clock = new FixtureClock()
    expect(clock.now().toISOString()).toBe('2026-11-11T01:00:00.000Z')
    clock.set(new Date('2026-11-11T05:00:00.000Z'))
    expect(clock.now().toISOString()).toBe('2026-11-11T05:00:00.000Z')
  })
})
