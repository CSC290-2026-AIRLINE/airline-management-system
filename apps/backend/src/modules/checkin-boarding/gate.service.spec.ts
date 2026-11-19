import type { Actor } from './actor'
import { CheckInService } from './checkin.service'
import { CounterService } from './counter.service'
import { GateService } from './gate.service'
import { CheckInError } from './errors'
import { BOOKINGS, FLIGHTS } from './providers/fixtures'
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
  FixtureSensor,
  FixtureSettings,
  FixtureTiers,
  LoggerAudit,
  LoggerNotify,
} from './providers/fixture-providers'
import { CheckInStore } from './store/checkin-store'

const staff: Actor = { userId: 'user-staff', staffId: 'staff-demo' }
const cust: Actor = { userId: 'user-anna', staffId: null }

function build() {
  const clock = new FixtureClock()
  const store = new CheckInStore(clock)
  const payments = new FixturePayments()
  const audit = new LoggerAudit()
  const notify = new LoggerNotify()
  const flights = new FixtureFlights()
  const bookings = new FixtureBookings()
  const settings = new FixtureSettings()
  const seats = new FixtureSeats(clock)
  const sensor = new FixtureSensor()
  const screening = new FixtureScreening()
  const checkins = new CheckInService(
    clock,
    flights,
    bookings,
    new FixturePassengers(),
    seats,
    new FixturePricing(),
    payments,
    screening,
    new FixturePolice(),
    new FixtureTiers(),
    notify,
    audit,
    settings,
    store,
  )
  const counter = new CounterService(
    clock,
    flights,
    bookings,
    seats,
    new FixturePricing(),
    new FixtureTiers(),
    settings,
    payments,
    audit,
    checkins,
    store,
  )
  const gate = new GateService(
    clock,
    flights,
    bookings,
    new FixturePolice(),
    seats,
    screening,
    sensor,
    notify,
    audit,
    settings,
    checkins,
    store,
  )
  return { gate, checkins, counter, store, clock, notify, audit, sensor, screening, flights, seats }
}

async function idOf(store: CheckInStore, pnr: string): Promise<string> {
  const booking = BOOKINGS.find((b) => b.pnr === pnr)
  if (!booking) throw new Error(`${pnr} is not a booking`)
  const record = (await store.listCheckInsByFlight('flt-fy204')).find((c) => c.booking_passenger_id === booking.bookingPassengerId)
  if (!record) throw new Error(`${pnr} is not seeded`)
  return record.id
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('GateService.passengerList', () => {
  it('lists police first, then groups, with boarded flags', async () => {
    const { gate } = build()
    const list = await gate.passengerList(staff, 'gate-a1', 'flt-fy204')
    expect(list.police.map((p) => p.passengerName)).toEqual(['Narong Sukjai'])
    expect(list.groups['1'].map((p) => p.seat)).toEqual(['6C'])
    expect(list.groups['2']).toHaveLength(2)
    expect(list.groups['3']).toHaveLength(1)
    expect(list.groups['4']).toHaveLength(3)
    expect(list.boardedCount).toBe(0)
    expect(list.groups['4'].every((p) => !p.isPolice)).toBe(true)
  })

  it('refuses a flight that is at another gate and names the right gate', async () => {
    const { gate } = build()
    await expect(gate.passengerList(staff, 'gate-a2', 'flt-fy204')).rejects.toMatchObject({
      code: 'VALIDATION',
      details: { correctGate: 'A1' },
    })
  })
})

describe('GateService.scan', () => {
  it('scan boards a valid pass once, second scan is ALREADY_BOARDED and both are recorded', async () => {
    const { gate, store } = build()
    expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'R8KD2WQN' })).toMatchObject({
      event: 'boarded',
      passenger: { seat: '6C' },
    })
    expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'R8KD2WQN' })).toMatchObject({
      event: 'rejected',
      reason: 'ALREADY_BOARDED',
    })
    expect(await store.listEvents('flt-fy204')).toHaveLength(2)
    expect((await store.getCheckIn(await idOf(store, 'SA224B')))?.status).toBe('boarded')
  })

  it('scan rejects wrong gate with the correct gate, not found and on hold', async () => {
    const { gate } = build()
    expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'P6KA2CXF' })).toMatchObject({
      reason: 'WRONG_GATE',
      correctGate: 'A2',
    })
    expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'Q7M4K2XX' })).toMatchObject({
      reason: 'NOT_FOUND',
    })
    expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'H3VN8PLA' })).toMatchObject({
      reason: 'ON_HOLD',
    })
  })

  it('a hold that arrives after the pass makes the gate reject the scan', async () => {
    const { gate, store, screening } = build()
    const somchai = BOOKINGS.find((b) => b.pnr === 'SA224B')!
    // Feature 7 re-screened the passenger after the pass was issued and holds them.
    await screening.check({ passengerId: somchai.passengerId, flightId: 'flt-fy204', numberLast4: '0000', lastName: somchai.lastName })
    expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'R8KD2WQN' })).toMatchObject({ reason: 'ON_HOLD' })
    expect((await store.getCheckIn(await idOf(store, 'SA224B')))?.status).toBe('on_hold')
  })

  it('the pass of a booking cancelled after check-in is rejected as CANCELLED', async () => {
    const { gate, store } = build()
    const booking = BOOKINGS.find((b) => b.pnr === 'SA224B')!
    booking.cancelled = true
    try {
      expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'R8KD2WQN' })).toMatchObject({ reason: 'CANCELLED' })
    } finally {
      booking.cancelled = false
    }
    expect((await store.getCheckIn(await idOf(store, 'SA224B')))?.status).toBe('cancelled')
  })

  it('a held passenger security has since cleared boards at the gate', async () => {
    const { gate, store, screening } = build()
    jest.spyOn(screening, 'status').mockResolvedValue('clear')
    expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'H3VN8PLA' })).toMatchObject({ event: 'boarded' })
    expect((await store.getCheckIn(await idOf(store, 'HD224H')))?.status).toBe('boarded')
  })

  it('a rescan after the booking was cancelled leaves a boarded passenger boarded, bags on board', async () => {
    const { gate, counter, store } = build()
    const id = await idOf(store, 'SA224B')
    const weighed = await counter.weighBag(staff, id, { weightKg: 10, lengthCm: 60, widthCm: 40, heightCm: 20 })
    const tagged = await counter.tagBag(staff, weighed.bags[0].id)
    await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'R8KD2WQN' })
    const booking = BOOKINGS.find((b) => b.pnr === 'SA224B')!
    booking.cancelled = true
    try {
      expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'R8KD2WQN' })).toMatchObject({
        reason: 'ALREADY_BOARDED',
      })
    } finally {
      booking.cancelled = false
    }
    expect((await store.getCheckIn(id))?.status).toBe('boarded')
    expect((await store.getBag(tagged.bag.id))?.status).toBe('tagged')
  })

  it('a pass of another flight that boards at this gate is the wrong flight', async () => {
    const { gate, store } = build()
    // FY 318 now boards at A1 as well, so the passenger is on the wrong flight, not the wrong gate.
    await store.updateFlightBoarding('flt-fy318', { gate_id: 'gate-a1' })
    expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'P6KA2CXF' })).toMatchObject({
      reason: 'WRONG_FLIGHT',
    })
  })

  it('a simultaneous second scan loses on the unique index and is logged as ALREADY_BOARDED', async () => {
    const { gate, store } = build()
    const pass = await store.passByReference('R8KD2WQN')
    if (!pass) throw new Error('the seeded pass is missing')
    // Another agent boarded this pass a moment earlier.
    await store.appendEvent({
      flight_id: 'flt-fy204',
      gate_id: 'gate-a1',
      boarding_pass_id: pass.id,
      scanned_reference: 'R8KD2WQN',
      event: 'boarded',
      reason: null,
      staff_id: 'staff-other',
      occurred_at: new Date(),
    })
    expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'R8KD2WQN' })).toMatchObject({
      event: 'rejected',
      reason: 'ALREADY_BOARDED',
    })
    expect(await store.listEvents('flt-fy204')).toHaveLength(2)
  })

  it('a scan that loses the race on the unique index is recorded as ALREADY_BOARDED', async () => {
    const { gate, store } = build()
    const original = store.appendEvent.bind(store)
    const before = (await store.listEvents('flt-fy204')).length
    jest.spyOn(store, 'appendEvent').mockImplementation(async (input) => {
      if (input.event !== 'boarded') return original(input)
      // The database wrote the rejection in its own row and handed it back.
      await original({ ...input, event: 'rejected', reason: 'ALREADY_BOARDED' })
      return { ...input, id: 'ev-race', created_at: new Date(), event: 'rejected', reason: 'ALREADY_BOARDED' }
    })
    expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'R8KD2WQN' })).toMatchObject({
      event: 'rejected',
      reason: 'ALREADY_BOARDED',
    })
    expect((await store.getCheckIn(await idOf(store, 'SA224B')))?.status).not.toBe('boarded')
    expect(await store.listEvents('flt-fy204')).toHaveLength(before + 1)
  })

  it('scan rejects a closed gate', async () => {
    const { gate } = build()
    await gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 0 })
    await gate.closeGate(staff, 'flt-fy204', {})
    expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'R8KD2WQN' })).toMatchObject({
      reason: 'GATE_CLOSED',
    })
  })

  it('a customer cannot use the gate screens', async () => {
    const { gate } = build()
    await expect(gate.passengerList(cust, 'gate-a1', 'flt-fy204')).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(gate.scan(cust, 'gate-a1', { flightId: 'flt-fy204', reference: 'R8KD2WQN' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('scan rejects the pass of a cancelled check-in with CANCELLED', async () => {
    const { gate, store } = build()
    await store.updateCheckIn(await idOf(store, 'SA224B'), { status: 'cancelled' })
    expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'R8KD2WQN' })).toMatchObject({
      event: 'rejected',
      reason: 'CANCELLED',
    })
  })
})

describe('GateService notifications', () => {
  it('notifies with the F13 type codes', async () => {
    const { gate, notify } = build()
    const spy = jest.spyOn(notify, 'send')
    await gate.addGates(staff, 'BKK', ['D1'])
    await gate.setGate(staff, 'flt-fy204', { gateId: 'gate-bkk-d1' })
    expect(spy).toHaveBeenCalledWith('gate_changed', expect.objectContaining({ flightId: 'flt-fy204' }))
    await gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 0 })
    await gate.closeGate(staff, 'flt-fy204', {})
    expect(spy).toHaveBeenCalledWith('boarding_call', expect.objectContaining({ flightId: 'flt-fy204' }))
  })
})

describe('GateService.setGate', () => {
  it('setGate moves the flight, notifies and audits; refuses a closed flight', async () => {
    const { gate, checkins, store, notify, audit } = build()
    const notifySpy = jest.spyOn(notify, 'send')
    const auditSpy = jest.spyOn(audit, 'record')
    await gate.addGates(staff, 'BKK', ['D1'])
    await gate.setGate(staff, 'flt-fy204', { gateId: 'gate-bkk-d1' })
    expect((await gate.passengerList(staff, 'gate-bkk-d1', 'flt-fy204')).gate.code).toBe('D1')
    expect(notifySpy).toHaveBeenCalledWith('gate_changed', expect.objectContaining({ flightId: 'flt-fy204' }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'gate.change' }))
    expect((await checkins.boardingPass(staff, await idOf(store, 'SA224B'))).gate).toBe('D1')
  })

  it('setGate to the same gate is a no-op and an unknown gate is refused', async () => {
    const { gate, notify } = build()
    const spy = jest.spyOn(notify, 'send')
    await gate.setGate(staff, 'flt-fy204', { gateId: 'gate-a1' })
    expect(spy).not.toHaveBeenCalled()
    await expect(gate.setGate(staff, 'flt-fy204', { gateId: 'gate-zz' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('setGate refuses a closed flight', async () => {
    const { gate } = build()
    await gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 0 })
    await gate.closeGate(staff, 'flt-fy204', {})
    await expect(gate.setGate(staff, 'flt-fy204', { gateId: 'gate-a2' })).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })

  it('a cancelled flight cannot be scanned, counted or closed, and nobody on it becomes a no-show', async () => {
    const { gate, store, flights } = build()
    const original = flights.byId.bind(flights)
    jest.spyOn(flights, 'byId').mockImplementation(async (id: string) => {
      const flight = await original(id)
      return flight && id === 'flt-fy204' ? { ...flight, status: 'cancelled' } : flight
    })
    await expect(gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'R8KD2WQN' })).rejects.toMatchObject({
      code: 'INVALID_STATE',
    })
    await expect(gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 0 })).rejects.toMatchObject({ code: 'INVALID_STATE' })
    await store.updateFlightBoarding('flt-fy204', { manual_count: 0 })
    await expect(gate.closeGate(staff, 'flt-fy204', { confirmMismatch: true })).rejects.toMatchObject({ code: 'INVALID_STATE' })
    expect((await store.getCheckIn(await idOf(store, 'SA224B')))?.status).toBe('checked_in')
    expect((await store.listEvents('flt-fy204')).filter((e) => e.event === 'boarded' || e.event === 'no_show')).toHaveLength(0)
  })

  it('setGate refuses a cancelled flight its first gate and writes nothing', async () => {
    const { gate, store, flights } = build()
    const original = flights.byId.bind(flights)
    jest.spyOn(flights, 'byId').mockImplementation(async (id: string) => {
      if (id !== 'flt-cancelled') return original(id)
      const flight = await original('flt-fy204')
      if (!flight) return null
      return { ...flight, id: 'flt-cancelled', flightNumber: 'FY 999', status: 'cancelled' }
    })
    await gate.addGates(staff, 'BKK', ['D1'])
    const error = await gate.setGate(staff, 'flt-cancelled', { gateId: 'gate-bkk-d1' }).catch((err: unknown) => err)
    expect(error).toMatchObject({ code: 'INVALID_STATE' })
    expect((error as CheckInError).getResponse()).toMatchObject({
      error: { message: 'A cancelled or departed flight cannot be given a gate' },
    })
    expect(await store.flightBoarding('flt-cancelled')).toBeNull()
  })
})

describe('GateService.gates', () => {
  it('lists the gates of one airport, number-aware, with the open flight', async () => {
    const { gate } = build()
    await gate.addGates(staff, 'BKK', ['A10', 'A3'])
    const gates = await gate.gates('BKK')
    expect(gates.map((g) => g.code)).toEqual(['A1', 'A2', 'A3', 'A10'])
    expect(gates.find((g) => g.code === 'A1')?.flight).toMatchObject({ id: 'flt-fy204', flightNumber: 'FY 204' })
    expect(gates.find((g) => g.code === 'A3')?.flight).toBeNull()
  })

  it('hides turned-off gates unless all is asked', async () => {
    const { gate } = build()
    await gate.addGates(staff, 'BKK', ['D1'])
    await gate.setGateActive(staff, 'gate-bkk-d1', false)
    expect((await gate.gates('BKK')).map((g) => g.code)).toEqual(['A1', 'A2'])
    expect((await gate.gates('BKK', true)).map((g) => g.code)).toEqual(['A1', 'A2', 'D1'])
  })

  it('counts turned-on gates for every airport, zero included', async () => {
    const { gate } = build()
    expect(await gate.gateCounts()).toEqual([
      { airportCode: 'BKK', city: 'Bangkok', gates: 2 },
      { airportCode: 'ICN', city: 'Seoul Incheon', gates: 0 },
      { airportCode: 'NRT', city: 'Tokyo Narita', gates: 0 },
    ])
  })
})

describe('GateService.addGates', () => {
  it('adds gates, skips the ones already there and audits', async () => {
    const { gate, audit } = build()
    const spy = jest.spyOn(audit, 'record')
    const result = await gate.addGates(staff, 'BKK', ['A2', 'D1'])
    expect(result.added.map((g) => g.code)).toEqual(['D1'])
    expect(result.skipped).toEqual(['A2'])
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ action: 'gate.create' }))
  })

  it('refuses when every code exists', async () => {
    const { gate } = build()
    await expect(gate.addGates(staff, 'BKK', ['A1', 'A2'])).rejects.toMatchObject({
      code: 'GATE_EXISTS',
      details: { skipped: ['A1', 'A2'] },
    })
  })

  it('refuses a bad code and adds nothing', async () => {
    const { gate, store } = build()
    await expect(gate.addGates(staff, 'BKK', ['D1', 'd2', 'TOOLONG'])).rejects.toMatchObject({
      code: 'INVALID_GATE_CODE',
      details: { codes: ['d2', 'TOOLONG'] },
    })
    expect((await store.listGates()).map((g) => g.code)).toEqual(['A1', 'A2'])
  })

  it('refuses an unknown airport', async () => {
    const { gate } = build()
    await expect(gate.addGates(staff, 'XXX', ['D1'])).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('the same code twice in one request is added once', async () => {
    const { gate } = build()
    const result = await gate.addGates(staff, 'BKK', ['D1', 'D1'])
    expect(result.added.map((g) => g.code)).toEqual(['D1'])
    expect(result.skipped).toEqual([])
  })

  it('a request that loses the race on the same codes is refused and audits nothing', async () => {
    const { gate, store, audit } = build()
    const spy = jest.spyOn(audit, 'record')
    // Another agent added the same codes a moment earlier.
    jest.spyOn(store, 'createGates').mockResolvedValue([])
    await expect(gate.addGates(staff, 'BKK', ['D1'])).rejects.toMatchObject({
      code: 'GATE_EXISTS',
      details: { skipped: ['D1'] },
    })
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'gate.create' }))
  })
})

describe('GateService.setGateActive', () => {
  it('a gate with an open flight cannot be turned off', async () => {
    const { gate } = build()
    await expect(gate.setGateActive(staff, 'gate-a1', false)).rejects.toMatchObject({
      code: 'GATE_IN_USE',
      details: { flightNumber: 'FY 204' },
    })
  })

  it('a gate whose flight is closed can be turned off and on again', async () => {
    const { gate, store } = build()
    await store.updateFlightBoarding('flt-fy204', { closed_at: new Date() })
    expect(await gate.setGateActive(staff, 'gate-a1', false)).toMatchObject({ code: 'A1', isActive: false })
    expect(await gate.setGateActive(staff, 'gate-a1', true)).toMatchObject({ isActive: true })
  })

  it.each(['cancelled', 'departed', 'arrived'])('a flight that is %s and was never closed frees its gate', async (status) => {
    const { gate } = build()
    const flight = FLIGHTS.find((f) => f.id === 'flt-fy204')!
    flight.status = status as typeof flight.status
    try {
      expect(await gate.setGateActive(staff, 'gate-a1', false)).toMatchObject({ isActive: false })
      await gate.setGateActive(staff, 'gate-a1', true)
      expect(await gate.setGate(staff, 'flt-fy318', { gateId: 'gate-a1' })).toMatchObject({ gate: { code: 'A1' } })
    } finally {
      flight.status = 'scheduled'
    }
  })

  it('a flight past its departure time that nobody closed frees its gate, whatever its status says', async () => {
    const { gate, clock } = build()
    // FY 204 left at 03:25Z; no job has written "departed" yet and nobody closed gate A1.
    clock.set(new Date('2026-11-11T03:30:00.000Z'))
    expect(await gate.setGate(staff, 'flt-fy318', { gateId: 'gate-a1' })).toMatchObject({ gate: { code: 'A1' } })
    await gate.setGate(staff, 'flt-fy318', { gateId: 'gate-a2' })
    expect(await gate.setGateActive(staff, 'gate-a1', false)).toMatchObject({ isActive: false })
  })

  it('a flight that left and was never closed still shows at its gate, so the agent can open it and close it', async () => {
    const { gate, store, clock } = build()
    clock.set(new Date('2026-11-11T03:30:00.000Z'))
    const a1 = async () => (await gate.gates('BKK')).find((g) => g.id === 'gate-a1')?.flight ?? null
    expect(await a1()).toMatchObject({ id: 'flt-fy204' })
    // A flight that still boards wins the gate; the one that left comes back once that flight moved on.
    await gate.setGate(staff, 'flt-fy318', { gateId: 'gate-a1' })
    expect(await a1()).toMatchObject({ id: 'flt-fy318' })
    await gate.setGate(staff, 'flt-fy318', { gateId: 'gate-a2' })
    expect(await a1()).toMatchObject({ id: 'flt-fy204' })
    await gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 0 })
    await gate.closeGate(staff, 'flt-fy204', { confirmMismatch: true })
    expect((await store.getCheckIn(await idOf(store, 'SA224B')))?.status).toBe('no_show')
    expect(await a1()).toBeNull()
  })

  it('a cancelled flight never shows at its gate: there is nothing to close', async () => {
    const { gate } = build()
    const flight = FLIGHTS.find((f) => f.id === 'flt-fy204')!
    flight.status = 'cancelled'
    try {
      expect((await gate.gates('BKK')).find((g) => g.id === 'gate-a1')?.flight).toBeNull()
    } finally {
      flight.status = 'scheduled'
    }
  })

  it('the open flights of the gates are read in one go, not one flight at a time', async () => {
    const { gate, flights } = build()
    const one = jest.spyOn(flights, 'byId')
    const gates = await gate.gates('BKK')
    expect(gates.find((g) => g.id === 'gate-a1')?.flight).toMatchObject({ id: 'flt-fy204' })
    expect(one).not.toHaveBeenCalled()
  })

  it('a gate whose flight is closed can take another flight', async () => {
    const { gate, store } = build()
    await store.updateFlightBoarding('flt-fy204', { closed_at: new Date() })
    await gate.setGateActive(staff, 'gate-a1', false)
    await gate.setGateActive(staff, 'gate-a1', true)
    expect(await gate.setGate(staff, 'flt-fy318', { gateId: 'gate-a1' })).toMatchObject({ gate: { code: 'A1' } })
  })

  it('turns a gate off and audits it', async () => {
    const { gate, audit } = build()
    const spy = jest.spyOn(audit, 'record')
    await gate.addGates(staff, 'BKK', ['D1'])
    await gate.setGateActive(staff, 'gate-bkk-d1', false)
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ action: 'gate.update' }))
  })

  it('an unknown gate is a 404', async () => {
    const { gate } = build()
    await expect(gate.setGateActive(staff, 'gate-zz', false)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('GateService.setGate and the gate rules', () => {
  it('moving to a gate another open flight uses is refused', async () => {
    const { gate } = build()
    await expect(gate.setGate(staff, 'flt-fy204', { gateId: 'gate-a2' })).rejects.toMatchObject({
      code: 'GATE_TAKEN',
      details: { flightNumber: 'FY 318' },
    })
  })

  it('moving to a turned-off gate is refused', async () => {
    const { gate } = build()
    await gate.addGates(staff, 'BKK', ['D1'])
    await gate.setGateActive(staff, 'gate-bkk-d1', false)
    await expect(gate.setGate(staff, 'flt-fy204', { gateId: 'gate-bkk-d1' })).rejects.toMatchObject({
      code: 'GATE_INACTIVE',
    })
  })

  it('moving to a gate at another airport is refused', async () => {
    const { gate } = build()
    await gate.addGates(staff, 'NRT', ['N1'])
    await expect(gate.setGate(staff, 'flt-fy204', { gateId: 'gate-nrt-n1' })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
  })

  it('moving a flight to the gate it is already on returns the flight', async () => {
    const { gate, notify } = build()
    const spy = jest.spyOn(notify, 'send')
    expect(await gate.setGate(staff, 'flt-fy204', { gateId: 'gate-a1' })).toMatchObject({ gate: { code: 'A1' } })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('GateService head-count and close', () => {
  it('sensor headcount reads the sensor; sensor down is a validation error', async () => {
    const { gate, sensor } = build()
    sensor.setOverride('gate-a1', 5)
    expect(await gate.setHeadcount(staff, 'flt-fy204', { source: 'sensor' })).toMatchObject({ sensorCount: 5 })
    sensor.setOverride('gate-a1', null)
    await expect(gate.setHeadcount(staff, 'flt-fy204', { source: 'sensor' })).rejects.toMatchObject({
      code: 'VALIDATION',
      details: { reason: 'sensor_unavailable' },
    })
  })

  it('a manual count must be a whole number of zero or more', async () => {
    const { gate } = build()
    await expect(gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: -1 })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    await expect(gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 1.5 })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
  })

  it('the head-count is audited', async () => {
    const { gate, audit } = build()
    const spy = jest.spyOn(audit, 'record')
    await gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 3 })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ action: 'gate.headcount', entityType: 'flight', entityId: 'flt-fy204' }))
  })

  it('a bag offloaded by the gate close is never removed', async () => {
    const { gate, counter, store } = build()
    const pim = await idOf(store, 'EC224G')
    const weighed = await counter.weighBag(staff, pim, { weightKg: 10, lengthCm: 60, widthCm: 40, heightCm: 20 })
    const tagged = await counter.tagBag(staff, weighed.bags[0].id)
    await gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 0 })
    await gate.closeGate(staff, 'flt-fy204', {})
    expect((await store.getBag(tagged.bag.id))?.status).toBe('offloaded')
    await expect(counter.removeBag(staff, tagged.bag.id)).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })

  it('closing the gate frees the seat of a held passenger with a pass', async () => {
    const { gate, store, seats } = build()
    const dana = BOOKINGS.find((b) => b.pnr === 'HD224H')!
    expect(await seats.assigned(dana.bookingPassengerId, 'flt-fy204')).toMatchObject({ seatCode: '11D' })
    await gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 0 })
    await gate.closeGate(staff, 'flt-fy204', { confirmMismatch: true })
    expect((await store.getCheckIn(await idOf(store, 'HD224H')))?.status).toBe('no_show')
    expect(await seats.assigned(dana.bookingPassengerId, 'flt-fy204')).toBeNull()
  })

  it('a held passenger who boarded while the gate closed keeps the seat', async () => {
    const { gate, store, seats } = build()
    const dana = BOOKINGS.find((b) => b.pnr === 'HD224H')!
    const original = store.appendEvent.bind(store)
    const pass = await store.passByReference('H3VN8PLA')
    if (!pass) throw new Error('the seeded pass is missing')
    // Security cleared the passenger and the gate boarded them in the instant the close wrote its no-shows.
    jest.spyOn(store, 'appendEvent').mockImplementation((input) => {
      if (input.event !== 'no_show' || input.boarding_pass_id !== pass.id) return original(input)
      return Promise.resolve({ ...input, id: 'ev-race', created_at: new Date(), event: 'rejected', reason: 'ALREADY_BOARDED' })
    })
    await gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 0 })
    await gate.closeGate(staff, 'flt-fy204', { confirmMismatch: true })
    expect(await seats.assigned(dana.bookingPassengerId, 'flt-fy204')).toMatchObject({ seatCode: '11D' })
  })

  it('a pass that boarded while the gate closed is not a no-show', async () => {
    const { gate, store, notify } = build()
    const original = store.appendEvent.bind(store)
    const pass = await store.passByReference('R8KD2WQN')
    if (!pass) throw new Error('the seeded pass is missing')
    jest.spyOn(store, 'appendEvent').mockImplementation(async (input) => {
      if (input.event !== 'no_show' || input.boarding_pass_id !== pass.id) return original(input)
      // The database wrote the rejection in its own row and handed it back.
      await original({ ...input, event: 'rejected', reason: 'ALREADY_BOARDED' })
      return { ...input, id: 'ev-race', created_at: new Date(), event: 'rejected', reason: 'ALREADY_BOARDED' }
    })
    await gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 0 })
    const notifySpy = jest.spyOn(notify, 'send')
    await gate.closeGate(staff, 'flt-fy204', { confirmMismatch: true })
    expect((await store.getCheckIn(await idOf(store, 'SA224B')))?.status).not.toBe('no_show')
    expect(notifySpy).toHaveBeenCalledWith('boarding_call', expect.objectContaining({ noShow: 7 }))
  })

  it('closing the gate cancels the check-in of a booking cancelled since, never a no-show', async () => {
    const { gate, store, notify, audit } = build()
    const notifySpy = jest.spyOn(notify, 'send')
    const auditSpy = jest.spyOn(audit, 'record')
    const id = await idOf(store, 'SA224B')
    const booking = BOOKINGS.find((b) => b.pnr === 'SA224B')!
    booking.cancelled = true
    try {
      await gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 0 })
      await gate.closeGate(staff, 'flt-fy204', { confirmMismatch: true })
    } finally {
      booking.cancelled = false
    }
    expect((await store.getCheckIn(id))?.status).toBe('cancelled')
    expect(notifySpy).toHaveBeenCalledWith(
      'check_in_cancelled',
      expect.objectContaining({ checkInId: id, reason: 'the booking was cancelled' }),
    )
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'check_in.cancel', entityId: id, actorType: 'staff' }))
    const pass = (await store.passesForCheckIn(id))[0]
    expect((await store.listEvents('flt-fy204')).filter((e) => e.boarding_pass_id === pass.id && e.event === 'no_show')).toHaveLength(0)
  })

  it('a cancelled check-in with a pass is not turned into a no-show', async () => {
    const { gate, store } = build()
    const pim = await idOf(store, 'EC224G')
    await store.updateCheckIn(pim, { status: 'cancelled' })
    await gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 0 })
    await gate.closeGate(staff, 'flt-fy204', { confirmMismatch: true })
    expect((await store.getCheckIn(pim))?.status).toBe('cancelled')
    const pass = (await store.passesForCheckIn(pim))[0]
    expect((await store.listEvents('flt-fy204')).filter((e) => e.boarding_pass_id === pass.id)).toHaveLength(0)
  })

  it('close needs a count, shows a mismatch, confirms, freezes, marks no-shows and offloads bags', async () => {
    const { gate, counter, store } = build()
    const pim = await idOf(store, 'EC224G')
    const weighed = await counter.weighBag(staff, pim, { weightKg: 10, lengthCm: 60, widthCm: 40, heightCm: 20 })
    const tagged = await counter.tagBag(staff, weighed.bags[0].id)

    await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'R8KD2WQN' })
    await expect(gate.closeGate(staff, 'flt-fy204', {})).rejects.toMatchObject({ code: 'VALIDATION' })
    await gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 2 })
    await expect(gate.closeGate(staff, 'flt-fy204', {})).rejects.toMatchObject({
      code: 'HEADCOUNT_MISMATCH',
      details: { boardedCount: 1, count: 2 },
    })

    const head = await gate.closeGate(staff, 'flt-fy204', { confirmMismatch: true })
    expect(head).toMatchObject({ boardedCount: 1, closedAt: '2026-11-11T01:00:00.000Z' })
    expect((await store.getCheckIn(pim))?.status).toBe('no_show')
    expect((await store.getCheckIn(await idOf(store, 'SA224B')))?.status).toBe('boarded')
    expect((await store.listEvents('flt-fy204')).filter((e) => e.event === 'no_show')).toHaveLength(7)
    expect((await store.getBag(tagged.bag.id))?.status).toBe('offloaded')
  })

  it('a closed gate cannot be closed twice and cannot take a new head-count', async () => {
    const { gate } = build()
    await gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 0 })
    await gate.closeGate(staff, 'flt-fy204', {})
    await expect(gate.closeGate(staff, 'flt-fy204', {})).rejects.toMatchObject({ code: 'INVALID_STATE' })
    await expect(gate.setHeadcount(staff, 'flt-fy204', { source: 'manual', count: 1 })).rejects.toMatchObject({
      code: 'INVALID_STATE',
    })
  })
})
