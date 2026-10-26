import type { Actor } from './actor'
import { CheckInService } from './checkin.service'
import { CounterService } from './counter.service'
import { buildLine2 } from './domain/mrz'
import { BOOKINGS } from './providers/fixtures'
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
import type { BookingPassenger } from './providers/providers'
import { CheckInStore } from './store/checkin-store'

const staff: Actor = { userId: 'user-staff', staffId: 'staff-demo' }
const cust: Actor = { userId: 'user-anna', staffId: null }

/** The demo passenger Sara Lopez with a specimen passport: a different given name, so the name flags. */
const SARA_LINE1 = 'P<UTO' + 'LOPEZ'.padEnd(10, '<') + 'MARIA'.padEnd(29, '<')
const SARA_LINE2 = buildLine2({ number: 'UTO123456', nationality3: 'UTO', dob: '910829', sex: 'F', expiry: '300415' })

function build() {
  const clock = new FixtureClock()
  const store = new CheckInStore(clock)
  const payments = new FixturePayments()
  const audit = new LoggerAudit()
  const checkins = new CheckInService(
    clock,
    new FixtureFlights(),
    new FixtureBookings(),
    new FixturePassengers(),
    new FixtureSeats(clock),
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
  const counter = new CounterService(
    clock,
    new FixtureFlights(),
    new FixtureBookings(),
    new FixturePricing(),
    new FixtureTiers(),
    new FixtureSettings(),
    payments,
    audit,
    checkins,
    store,
  )
  return { counter, checkins, store, payments, audit, clock }
}

/** Pim Saetang is seeded checked_in on FY 204: economy, 20 kg free, 500 THB per kg, 32 kg a bag. */
function pimId(store: CheckInStore): string {
  const record = store.listCheckInsByFlight('flt-fy204').find((c) => c.pnr === 'EC204G')
  if (!record) throw new Error('Pim Saetang is not seeded')
  return record.id
}

function bag(weightKg: number) {
  return { weightKg, lengthCm: 60, widthCm: 40, heightCm: 20 }
}

async function weigh(counter: CounterService, id: string, ...weights: number[]) {
  let view = await counter.detail(staff, id)
  for (const weight of weights) view = await counter.weighBag(staff, id, bag(weight))
  return view
}

const addedBookings: BookingPassenger[] = []

afterEach(() => {
  for (const booking of addedBookings.splice(0)) {
    const i = BOOKINGS.indexOf(booking)
    if (i >= 0) BOOKINGS.splice(i, 1)
  }
  jest.restoreAllMocks()
})

describe('CounterService.weighBag', () => {
  it('weighs bags in order, each keeps the excess it added, fee at the copied rate', async () => {
    const { counter, store } = build()
    const id = pimId(store)
    await counter.weighBag(staff, id, bag(15))
    await counter.weighBag(staff, id, bag(8))
    const v = await counter.weighBag(staff, id, bag(10))
    expect(v.bags.map((b) => [b.excessKg, b.excessFee])).toEqual([
      [0, 0],
      [3, 1500],
      [10, 5000],
    ])
    expect(v.totals).toEqual({ weightKg: 33, excessKg: 13, unpaidFee: 6500 })
    expect(v.issues).toContain('EXCESS_UNPAID')
    expect(v.allowance).toEqual({ freeKg: 20, tierBonusKg: 0, ratePerKg: 500, maxBagKg: 32, maxLinearCm: 158 })
  })

  it('weighBag rejects non-positive weight', async () => {
    const { counter, store } = build()
    await expect(counter.weighBag(staff, pimId(store), bag(0))).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('refuses an overweight or oversize bag and stores nothing', async () => {
    const { counter, store } = build()
    const id = pimId(store)
    await expect(counter.weighBag(staff, id, bag(32.5))).rejects.toMatchObject({
      code: 'BAG_REFUSED',
      details: { reason: 'overweight', maxBagKg: 32, maxLinearCm: 158 },
    })
    await expect(counter.weighBag(staff, id, { weightKg: 10, lengthCm: 100, widthCm: 40, heightCm: 30 })).rejects.toMatchObject({
      code: 'BAG_REFUSED',
      details: { reason: 'oversize' },
    })
    expect((await counter.detail(staff, id)).bags).toHaveLength(0)
  })

  it('weighs a bag only while the check-in is open', async () => {
    const { counter, store } = build()
    const id = pimId(store)
    store.updateCheckIn(id, { status: 'boarded' })
    await expect(counter.weighBag(staff, id, bag(10))).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })
})

describe('CounterService.tagBag', () => {
  it('pays all unpaid bags together and numbers them', async () => {
    const { counter, store, payments } = build()
    const id = pimId(store)
    const v = await weigh(counter, id, 15, 8)
    const [b1, b2] = v.bags
    const t = await counter.tagBag(staff, b2.id)
    expect(t.bag).toMatchObject({ tagNumber: '0402000001', status: 'tagged', excessPaymentId: 'pay-1' })
    // The 15 kg bag has no excess, the payment of 1500 baht never covered it.
    expect(t.view.bags[0].excessPaymentId).toBeNull()
    expect((await counter.tagBag(staff, b1.id)).bag.tagNumber).toBe('0402000002')
    expect(t.view.issues).not.toContain('EXCESS_UNPAID')
    expect(payments.charges).toEqual([{ amount: 1500, currency: 'THB', purpose: 'excess_baggage', reference: id }])
  })

  it('a bag with no excess tags without a payment', async () => {
    const { counter, store, payments } = build()
    const id = pimId(store)
    const v = await weigh(counter, id, 15)
    const t = await counter.tagBag(staff, v.bags[0].id)
    expect(t.bag).toMatchObject({ tagNumber: '0402000001', status: 'tagged', excessPaymentId: null })
    expect(payments.charges).toHaveLength(0)
  })

  it('a bag without excess is not marked as paid', async () => {
    const { counter, store } = build()
    const id = pimId(store)
    const v = await weigh(counter, id, 5, 25)
    const t = await counter.tagBag(staff, v.bags[1].id)
    expect(t.bag.excessPaymentId).toBe('pay-1')
    expect(t.view.bags[0]).toMatchObject({ excessFee: 0, excessPaymentId: null })
  })

  it('a bag is only tagged while the check-in is open', async () => {
    const { counter, store } = build()
    const id = pimId(store)
    const v = await weigh(counter, id, 15)
    store.updateCheckIn(id, { status: 'on_hold' })
    await expect(counter.tagBag(staff, v.bags[0].id)).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })

  it('tagging an already tagged bag keeps its number', async () => {
    const { counter, store } = build()
    const id = pimId(store)
    const v = await weigh(counter, id, 15)
    const first = await counter.tagBag(staff, v.bags[0].id)
    const again = await counter.tagBag(staff, v.bags[0].id)
    expect(again.bag.tagNumber).toBe(first.bag.tagNumber)
  })
})

describe('CounterService.removeBag', () => {
  it('removing a bag weighed by mistake recomputes the unpaid bags and never removes a tagged bag', async () => {
    const { counter, store } = build()
    const id = pimId(store)
    const v = await weigh(counter, id, 15, 8, 10)
    await counter.removeBag(staff, v.bags[0].id)
    expect((await counter.detail(staff, id)).bags.map((b) => b.excessKg)).toEqual([0, 0])
    const t = await counter.tagBag(staff, (await counter.detail(staff, id)).bags[0].id)
    await expect(counter.removeBag(staff, t.bag.id)).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })

  it('never removes a tagged bag, not even after the gate offloaded it', async () => {
    const { counter, store } = build()
    const id = pimId(store)
    const v = await weigh(counter, id, 15)
    const tagged = await counter.tagBag(staff, v.bags[0].id)
    // The gate offloads the bags of a no-show, the printed tag stays on the bag.
    store.updateBag(tagged.bag.id, { status: 'offloaded' })
    await expect(counter.removeBag(staff, tagged.bag.id)).rejects.toMatchObject({ code: 'INVALID_STATE' })
    expect((await counter.detail(staff, id)).bags).toHaveLength(1)
  })

  it('never removes a bag that was paid together with another one', async () => {
    const { counter, store, payments } = build()
    const id = pimId(store)
    const v = await weigh(counter, id, 25, 10)
    const tagged = await counter.tagBag(staff, v.bags[0].id)
    expect(tagged.bag.excessPaymentId).toBe('pay-1')
    // The second bag was charged in the same payment, so it may not be removed.
    await expect(counter.removeBag(staff, v.bags[1].id)).rejects.toMatchObject({ code: 'INVALID_STATE' })
    expect(payments.charges).toEqual([{ amount: 7500, currency: 'THB', purpose: 'excess_baggage', reference: id }])
    expect((await counter.detail(staff, id)).bags).toHaveLength(2)
  })
})

describe('CounterService.carryOn', () => {
  it('carry-on over 7 kg or oversize must be checked', async () => {
    const { counter, store } = build()
    const id = pimId(store)
    const ok = await counter.carryOn(staff, id, { weightKg: 6, lengthCm: 50, widthCm: 30, heightCm: 20 })
    expect(ok.carryOnCheck).toMatchObject({ weightKg: 6, withinSize: true, result: 'ok' })
    const heavy = await counter.carryOn(staff, id, { weightKg: 8, lengthCm: 50, widthCm: 30, heightCm: 20 })
    expect(heavy.carryOnCheck).toMatchObject({ withinSize: true, result: 'must_check' })
    const big = await counter.carryOn(staff, id, { weightKg: 5, lengthCm: 60, widthCm: 40, heightCm: 25 })
    expect(big.carryOnCheck).toMatchObject({ withinSize: false, result: 'must_check' })
  })
})

describe('CounterService issues', () => {
  it('name mismatch appears and is cleared; visa check appears and is cleared', async () => {
    const { counter, checkins, store } = build()
    const sara: BookingPassenger = {
      bookingPassengerId: 'bp-test-sara',
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
    }
    addedBookings.push(sara)
    BOOKINGS.push(sara)
    const c = await checkins.start(cust, { pnr: 'VS318X', lastName: 'Lopez' })
    await checkins.submitDocument(cust, c.id, { mrzLine1: SARA_LINE1, mrzLine2: SARA_LINE2, visaNumber: 'V123' })

    const view = await counter.detail(staff, c.id)
    expect(view.issues).toEqual(expect.arrayContaining(['NAME_MISMATCH', 'VISA_CHECK']))
    const documentId = view.checkIn.document!.id
    const cleared = await counter.clearMismatch(staff, documentId)
    expect(cleared.issues).not.toContain('NAME_MISMATCH')
    const visa = await counter.checkVisa(staff, documentId)
    expect(visa.issues).not.toContain('VISA_CHECK')
    expect(store.getDocument(documentId)!.visa_checked_at).not.toBeNull()
  })

  it('a customer cannot use the counter', async () => {
    const { counter } = build()
    await expect(counter.search(cust, {})).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('detail audits the sensitive read', async () => {
    const { counter, store, audit } = build()
    const spy = jest.spyOn(audit, 'record')
    await counter.detail(staff, pimId(store))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ action: 'view_sensitive', isSensitive: true }))
  })
})

describe('CounterService lookups', () => {
  it('bag lookups by tag and by flight return passenger, pnr and flight', async () => {
    const { counter, store } = build()
    const id = pimId(store)
    const v = await weigh(counter, id, 15)
    const t = await counter.tagBag(staff, v.bags[0].id)
    const found = await counter.bagByTag(staff, t.bag.tagNumber!)
    expect(found).toMatchObject({ pnr: 'EC204G', passengerName: 'Pim Saetang' })
    expect(found.flight.flightNumber).toBe('FY 204')
    await expect(counter.bagByTag(staff, '0402999999')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const all = await counter.bagsByFlight(staff, 'flt-fy204')
    expect(all).toHaveLength(1)
    expect(all[0].pnr).toBe('EC204G')
  })

  it('printPass stamps printed_at once and keeps it on reprint', async () => {
    const { counter, store, clock } = build()
    const id = pimId(store)
    const pass = store.passesForCheckIn(id)[0]
    const first = await counter.printPass(staff, pass.id)
    expect(first.printedAt).toBe('2026-11-11T01:00:00.000Z')
    clock.set(new Date(clock.now().getTime() + 60_000))
    const again = await counter.printPass(staff, pass.id)
    expect(again.printedAt).toBe(first.printedAt)
  })

  it('search filters by flight, pnr and name (case-insensitive substring)', async () => {
    const { counter } = build()
    const byFlight = await counter.search(staff, { flightId: 'flt-fy204' })
    expect(byFlight.length).toBeGreaterThan(0)
    expect(byFlight.every((row) => row.flightNumber === 'FY 204')).toBe(true)
    const byPnr = await counter.search(staff, { pnr: 'ec204g' })
    expect(byPnr.map((row) => row.pnr)).toEqual(['EC204G'])
    const byName = await counter.search(staff, { name: 'saetang' })
    expect(byName.map((row) => row.passengerName)).toEqual(['Pim Saetang'])
  })
})
