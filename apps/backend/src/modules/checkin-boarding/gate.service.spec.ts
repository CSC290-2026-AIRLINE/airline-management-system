import type { Actor } from './actor'
import { CheckInService } from './checkin.service'
import { CounterService } from './counter.service'
import { CheckInError } from './errors'
import { GateService } from './gate.service'
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
  const checkins = new CheckInService(
    clock,
    flights,
    bookings,
    new FixturePassengers(),
    seats,
    new FixturePricing(),
    payments,
    new FixtureScreening(),
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
    new FixturePricing(),
    new FixtureTiers(),
    settings,
    payments,
    audit,
    checkins,
    store,
  )
  const gate = new GateService(clock, flights, bookings, new FixturePolice(), seats, sensor, notify, audit, settings, store)
  return { gate, checkins, counter, store, clock, notify, audit, sensor }
}

function idOf(store: CheckInStore, pnr: string): string {
  const record = store.listCheckInsByFlight('flt-fy204').find((c) => c.pnr === pnr)
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
    expect(store.listEvents('flt-fy204')).toHaveLength(2)
    expect(store.getCheckIn(idOf(store, 'SA204B'))?.status).toBe('boarded')
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

  it('a pass of another flight that boards at this gate is the wrong flight', async () => {
    const { gate, store } = build()
    // FY 318 now boards at A1 as well, so the passenger is on the wrong flight, not the wrong gate.
    store.updateFlightBoarding('flt-fy318', { gate_id: 'gate-a1' })
    expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'P6KA2CXF' })).toMatchObject({
      reason: 'WRONG_FLIGHT',
    })
  })

  it('a simultaneous second scan loses on the unique index and is logged as ALREADY_BOARDED', async () => {
    const { gate, store } = build()
    const pass = store.passByReference('R8KD2WQN')
    if (!pass) throw new Error('the seeded pass is missing')
    // Another agent boarded this pass a moment earlier.
    store.appendEvent({
      flight_id: 'flt-fy204',
      gate_id: 'gate-a1',
      boarding_pass_id: pass.id,
      scanned_reference: 'R8KD2WQN',
      event: 'boarded',
      reason: null,
      staff_id: 'staff-other',
    })
    expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'R8KD2WQN' })).toMatchObject({
      event: 'rejected',
      reason: 'ALREADY_BOARDED',
    })
    expect(store.listEvents('flt-fy204')).toHaveLength(2)
  })

  it('a scan that loses the race on the unique index is recorded as ALREADY_BOARDED', async () => {
    const { gate, store } = build()
    const original = store.appendEvent.bind(store)
    jest.spyOn(store, 'appendEvent').mockImplementation((input) => {
      if (input.event === 'boarded') throw new CheckInError(409, 'INVALID_STATE', 'pass already final')
      return original(input)
    })
    expect(await gate.scan(staff, 'gate-a1', { flightId: 'flt-fy204', reference: 'R8KD2WQN' })).toMatchObject({
      event: 'rejected',
      reason: 'ALREADY_BOARDED',
    })
    expect(store.listEvents('flt-fy204').filter((e) => e.event === 'rejected')).toHaveLength(1)
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
})

describe('GateService.setGate', () => {
  it('setGate moves the flight, notifies and audits; refuses a closed flight', async () => {
    const { gate, checkins, store, notify, audit } = build()
    const notifySpy = jest.spyOn(notify, 'send')
    const auditSpy = jest.spyOn(audit, 'record')
    await gate.setGate(staff, 'flt-fy204', { gateId: 'gate-a2' })
    expect((await gate.passengerList(staff, 'gate-a2', 'flt-fy204')).gate.code).toBe('A2')
    expect(notifySpy).toHaveBeenCalledWith('gate_change', expect.objectContaining({ flightId: 'flt-fy204' }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'gate.change' }))
    expect((await checkins.boardingPass(staff, idOf(store, 'SA204B'))).gate).toBe('A2')
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

  it('close needs a count, shows a mismatch, confirms, freezes, marks no-shows and offloads bags', async () => {
    const { gate, counter, store } = build()
    const pim = idOf(store, 'EC204G')
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
    expect(store.getCheckIn(pim)?.status).toBe('no_show')
    expect(store.getCheckIn(idOf(store, 'SA204B'))?.status).toBe('boarded')
    expect(store.listEvents('flt-fy204').filter((e) => e.event === 'no_show')).toHaveLength(7)
    expect(store.getBag(tagged.bag.id)?.status).toBe('offloaded')
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
