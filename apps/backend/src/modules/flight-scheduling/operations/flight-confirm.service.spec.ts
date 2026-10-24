import { ConflictException, UnprocessableEntityException } from '@nestjs/common'
import { FlightConfirmService } from './flight-confirm.service'
import { MissingScheduleApprovals } from './schedule-approvals'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('../settings.service', () => ({ SettingsService: class {} }))

const ROUTE = '00000000-0000-0000-0000-0000000000r1'
const AIRCRAFT = '00000000-0000-0000-0000-0000000000a1'
const APPROVAL = '00000000-0000-0000-0000-0000000000b1'
const STAFF = 'staff-1'

// Origin in UTC+7: 18:00Z on 2 Nov is 01:00 on 3 Nov locally.
const input = (over: object = {}) => ({
  approval_id: APPROVAL,
  route_id: ROUTE,
  flight_number: 'ZZ101',
  service_date: new Date('2026-11-03T00:00:00Z'),
  aircraft_id: AIRCRAFT,
  scheduled_dep_at: new Date('2026-11-02T18:00:00Z'),
  scheduled_arr_at: new Date('2026-11-02T20:00:00Z'),
  ...over,
})

describe('FlightConfirmService.confirm', () => {
  const order: string[] = []
  const tx = {
    $executeRaw: jest.fn(() => order.push('lock')),
    flight: { create: jest.fn() },
  }
  const db = {
    route: { findUnique: jest.fn() },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => {
      const result = await fn(tx)
      order.push('commit')
      return result
    }),
  }
  const feasibility = { checkAircraftFeasibility: jest.fn() }
  const writer = { append: jest.fn() }
  const publisher = { publishCommitted: jest.fn(() => order.push('publish')) }
  const approvals = { consume: jest.fn(), markConsumed: jest.fn() }
  const service = new FlightConfirmService(db as never, feasibility as never, writer as never, publisher as never, approvals)

  beforeEach(() => {
    jest.clearAllMocks()
    order.length = 0
    db.route.findUnique.mockResolvedValue({
      is_active: true,
      origin: 'ZZB',
      destination: 'ZZC',
      distance_km: 800,
      airport_route_originToairport: { timezone: 'Asia/Bangkok' },
    })
    feasibility.checkAircraftFeasibility.mockImplementation(() => {
      order.push('gates')
      return Promise.resolve({ status: 'feasible', violations: [], pending: [] })
    })
    approvals.consume.mockImplementation(() => {
      order.push('approval')
      return Promise.resolve({ ok: true })
    })
    tx.flight.create.mockImplementation(() => {
      order.push('save')
      return Promise.resolve({ id: 'f-new' })
    })
    writer.append.mockImplementation(() => {
      order.push('event')
      return Promise.resolve({ id: 'e1', type: 'created', seq: 1n, occurred_at: new Date() })
    })
  })

  it('locks, re-runs the gates, checks the approval, saves and writes the event in one transaction, then publishes', async () => {
    const result = await service.confirm(input(), STAFF)

    expect(order).toEqual(['lock', 'gates', 'approval', 'save', 'event', 'commit', 'publish'])
    expect(feasibility.checkAircraftFeasibility).toHaveBeenCalledWith(
      AIRCRAFT,
      expect.objectContaining({ flightId: null, distanceKm: 800 }),
      tx,
    )
    expect(approvals.consume).toHaveBeenCalledWith(tx, expect.objectContaining({ approvalId: APPROVAL, purpose: 'new_flight' }))
    expect(tx.flight.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'scheduled', aircraft_id: AIRCRAFT, dep_at: input().scheduled_dep_at, pattern_id: null }),
    })
    expect(writer.append).toHaveBeenCalledWith(
      tx,
      'f-new',
      expect.objectContaining({ columns: expect.objectContaining({ type: 'created' }) }),
      STAFF,
    )
    expect(publisher.publishCommitted).toHaveBeenCalledWith(['e1'])
    expect(result).not.toHaveProperty('warnings')
  })

  it('is blocked with 409 while schedule_approval is missing; nothing is saved or published', async () => {
    approvals.consume.mockImplementation(() => new MissingScheduleApprovals().consume())

    await expect(service.confirm(input(), STAFF)).rejects.toMatchObject({ response: expect.objectContaining({ rule: 'approval_missing' }) })
    expect(tx.flight.create).not.toHaveBeenCalled()
    expect(publisher.publishCommitted).not.toHaveBeenCalled()
  })

  it('does not save a flight that fails a gate, and does not use the approval', async () => {
    feasibility.checkAircraftFeasibility.mockResolvedValue({ status: 'not_feasible', violations: [{ rule: 'overlap' }], pending: [] })

    await expect(service.confirm(input(), STAFF)).rejects.toThrow(ConflictException)
    expect(approvals.consume).not.toHaveBeenCalled()
    expect(tx.flight.create).not.toHaveBeenCalled()
  })

  it('does not save a flight whose gates Feature 9 could not answer (502), and does not use the approval', async () => {
    feasibility.checkAircraftFeasibility.mockResolvedValue({ status: 'incomplete', violations: [], pending: ['range: pending'] })

    await expect(service.confirm(input(), STAFF)).rejects.toMatchObject({
      status: 502,
      response: expect.objectContaining({ pending: ['range: pending'] }),
    })
    expect(approvals.consume).not.toHaveBeenCalled()
    expect(tx.flight.create).not.toHaveBeenCalled()
    expect(publisher.publishCommitted).not.toHaveBeenCalled()
  })

  it('requires service_date to be the local origin date of departure', async () => {
    await expect(service.confirm(input({ service_date: new Date('2026-11-02T00:00:00Z') }), STAFF)).rejects.toThrow(
      /service_date must be 2026-11-03/,
    )
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('rejects an inactive route with 422', async () => {
    db.route.findUnique.mockResolvedValue({ is_active: false })
    await expect(service.confirm(input(), STAFF)).rejects.toThrow(UnprocessableEntityException)
  })

  it('maps a duplicate flight number and date, and the exclusion constraint, to 409', async () => {
    tx.flight.create.mockRejectedValueOnce({ code: 'P2002' })
    await expect(service.confirm(input(), STAFF)).rejects.toThrow(/already exists/)

    tx.flight.create.mockRejectedValueOnce(
      new Error('conflicting key value violates exclusion constraint "flight_timetable_no_aircraft_overlap"'),
    )
    await expect(service.confirm(input(), STAFF)).rejects.toThrow(ConflictException)
    expect(publisher.publishCommitted).not.toHaveBeenCalled()
  })
})
