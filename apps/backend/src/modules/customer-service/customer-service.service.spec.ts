import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import type { DbService } from '@backend/db/db.service'
import type { SimulationClock } from '../admin-console/simulation-clock'
import type { AuditService } from '../admin-console/audit/audit.service'
import { CustomerServiceService } from './customer-service.service'
import { CreateComplaintDto } from './dto/create-complaint.dto'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests pass a mock `db` instead.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const USER_ID = '11111111-1111-1111-1111-111111111111'
const STAFF_ID = '22222222-2222-2222-2222-222222222222'
const CASE_ID = '33333333-3333-3333-3333-333333333333'
const CUSTOMER = { id: '44444444-4444-4444-4444-444444444444', passenger_id: '55555555-5555-5555-5555-555555555555' }
const NOW = new Date('2026-11-12T08:00:00Z')
const AGENT = { id: STAFF_ID, role: { code: 'cs-agent', is_admin: false } }
const SUPERVISOR = { id: '66666666-6666-6666-6666-666666666666', role: { code: 'cs-supervisor', is_admin: false } }
const DAY_MS = 24 * 60 * 60 * 1000
const DESCRIPTION = 'The gate agent was rude when I asked about boarding.'

function caseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CASE_ID,
    case_number: 'CS-2026-000001',
    type: 'employee',
    status: 'with_supervisor',
    contact_email: 'pax@example.com',
    opened_at: NOW,
    resolved_at: null,
    closed_at: null,
    updated_at: NOW,
    passenger: { first_name: 'Ann', last_name: 'Lee' },
    staff: null,
    employee_complaint: { location: 'gate', staff_name: null, description: DESCRIPTION },
    flight_complaint: null,
    food_complaint: null,
    case_event: [
      {
        id: 'e1',
        event_type: 'created',
        actor_type: 'complainant',
        staff: null,
        from_value: null,
        to_value: null,
        note: null,
        is_internal: false,
        occurred_at: NOW,
      },
      {
        id: 'e2',
        event_type: 'note_added',
        actor_type: 'staff',
        staff: { first_name: 'Sam', last_name: 'Ng' },
        from_value: null,
        to_value: null,
        note: 'Called the pax',
        is_internal: true,
        occurred_at: NOW,
      },
    ],
    ...overrides,
  }
}

async function errorsFor(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(CreateComplaintDto, body))
  return errors.map((e) => e.property).sort()
}

describe('CreateComplaintDto', () => {
  it('accepts an employee complaint without flight fields', async () => {
    expect(await errorsFor({ type: 'employee', location: 'gate', description: DESCRIPTION })).toEqual([])
  })

  it('requires the flight, date and issue for flight and food complaints', async () => {
    expect(await errorsFor({ type: 'food', description: DESCRIPTION })).toEqual(['flight_number', 'issue', 'service_date'])
  })

  it('drops spaces from the flight number, so "fy 204" matches FY 204', () => {
    expect(plainToInstance(CreateComplaintDto, { type: 'flight', flight_number: ' fy 204 ' }).flight_number).toBe('FY204')
  })

  it('rejects a short description and an unknown location', async () => {
    expect(await errorsFor({ type: 'employee', location: 'lounge', description: 'too short' })).toEqual(['description', 'location'])
  })
})

describe('CustomerServiceService', () => {
  const tx = {
    $queryRaw: jest.fn(),
    complaint_case: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    employee_complaint: { create: jest.fn() },
    flight_complaint: { create: jest.fn() },
    food_complaint: { create: jest.fn() },
    case_event: { create: jest.fn() },
  }
  const db = {
    customer: { findFirst: jest.fn() },
    staff: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    complaint_case: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    case_event: { create: jest.fn() },
    booking_segment: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  }
  const audit = { resolveActor: jest.fn(), write: jest.fn() }
  const clock = { now: () => NOW }
  let service: CustomerServiceService

  beforeEach(() => {
    jest.resetAllMocks()
    // A callback runs on the mock transaction client; an array (batch) just resolves.
    db.$transaction.mockImplementation((work: unknown) => (typeof work === 'function' ? work(tx) : Promise.all(work as unknown[])))
    db.customer.findFirst.mockResolvedValue(CUSTOMER)
    db.staff.findFirst.mockResolvedValue(AGENT)
    service = new CustomerServiceService(db as unknown as DbService, clock as unknown as SimulationClock, audit as unknown as AuditService)
  })

  describe('create', () => {
    beforeEach(() => {
      tx.$queryRaw.mockResolvedValue([{ n: 42n }])
      tx.complaint_case.create.mockResolvedValue({ id: CASE_ID })
      db.complaint_case.findFirst.mockResolvedValue(caseRow({ case_number: 'CS-2026-000042' }))
    })

    it('writes the case, its employee details and a created event in one transaction', async () => {
      const view = await service.create(USER_ID, 'pax@example.com', { type: 'employee', location: 'gate', description: DESCRIPTION })

      expect(tx.complaint_case.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            case_number: 'CS-2026-000042',
            type: 'employee',
            passenger_id: CUSTOMER.passenger_id,
            customer_id: CUSTOMER.id,
            contact_email: 'pax@example.com',
            opened_at: NOW,
          }),
        }),
      )
      expect(tx.employee_complaint.create).toHaveBeenCalledWith({
        data: { case_id: CASE_ID, location: 'gate', staff_name: null, description: DESCRIPTION },
      })
      expect(tx.case_event.create).toHaveBeenCalledWith({
        data: { case_id: CASE_ID, event_type: 'created', actor_type: 'complainant', occurred_at: NOW },
      })
      expect(view.caseNumber).toBe('CS-2026-000042')
    })

    it('links a flight complaint to the flight found by number and date', async () => {
      db.$queryRaw.mockResolvedValue([{ id: 'flight-1' }])
      db.booking_segment.findFirst.mockResolvedValue({ id: 'seg-1' })
      await service.create(USER_ID, 'pax@example.com', {
        type: 'flight',
        flight_number: 'FL101',
        service_date: '2026-11-01',
        issue: 'delay',
        description: DESCRIPTION,
      })
      // Tagged template: the values come after the SQL fragments.
      expect(db.$queryRaw.mock.calls[0].slice(1)).toEqual(['FL101', '2026-11-01'])
      expect(tx.flight_complaint.create).toHaveBeenCalledWith({
        data: { case_id: CASE_ID, flight_id: 'flight-1', issue: 'delay', details: DESCRIPTION },
      })
    })

    it('checks the flight is on the customer’s own bookings even without a booking reference', async () => {
      db.$queryRaw.mockResolvedValue([{ id: 'flight-1' }])
      db.booking_segment.findFirst.mockResolvedValue(null)
      const dto = { type: 'food' as const, flight_number: 'FL1', service_date: '2026-11-01', issue: 'quality', description: DESCRIPTION }

      await expect(service.create(USER_ID, 'pax@example.com', dto)).rejects.toThrow('FLIGHT_NOT_ON_BOOKING')
      expect(db.booking_segment.findFirst).toHaveBeenCalledWith({
        where: {
          flight_id: 'flight-1',
          booking: { OR: [{ customer_id: CUSTOMER.id }, { booking_passenger: { some: { passenger_id: CUSTOMER.passenger_id } } }] },
        },
        select: { id: true },
      })
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('narrows the check to the named booking when a reference is sent', async () => {
      db.$queryRaw.mockResolvedValue([{ id: 'flight-1' }])
      db.booking_segment.findFirst.mockResolvedValue({ id: 'seg-1' })
      await service.create(USER_ID, 'pax@example.com', {
        type: 'flight',
        flight_number: 'FL1',
        service_date: '2026-11-01',
        issue: 'delay',
        booking_reference: ' abc123 ',
        description: DESCRIPTION,
      })
      expect(db.booking_segment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ booking: expect.objectContaining({ booking_reference: 'ABC123' }) }) }),
      )
    })

    it('says so when the flight does not exist, and writes nothing', async () => {
      db.$queryRaw.mockResolvedValue([])
      const dto = { type: 'food' as const, flight_number: 'FL9', service_date: '2026-11-01', issue: 'quality', description: DESCRIPTION }
      await expect(service.create(USER_ID, 'pax@example.com', dto)).rejects.toThrow(NotFoundException)
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('rejects a food issue on a flight complaint', async () => {
      const dto = {
        type: 'flight' as const,
        flight_number: 'FL1',
        service_date: '2026-11-01',
        issue: 'wrong_meal',
        description: DESCRIPTION,
      }
      await expect(service.create(USER_ID, 'pax@example.com', dto)).rejects.toThrow(BadRequestException)
    })

    it('refuses a caller with no customer account', async () => {
      db.customer.findFirst.mockResolvedValue(null)
      await expect(
        service.create(USER_ID, 'x@example.com', { type: 'employee', location: 'gate', description: DESCRIPTION }),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  describe('getForCustomer', () => {
    it('only looks up the caller’s own cases and hides internal events and staff names', async () => {
      db.complaint_case.findFirst.mockResolvedValue(caseRow({ staff: { first_name: 'Sam', last_name: 'Ng' } }))
      const view = await service.getForCustomer(USER_ID, 'cs-2026-000001')

      expect(db.complaint_case.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { case_number: 'CS-2026-000001', customer_id: CUSTOMER.id } }),
      )
      expect(view.events?.map((e) => e.type)).toEqual(['created'])
      expect(view.ownerName).toBeNull()
    })

    it('is a 404 for a case that is not theirs', async () => {
      db.complaint_case.findFirst.mockResolvedValue(null)
      await expect(service.getForCustomer(USER_ID, 'CS-2026-000099')).rejects.toThrow(NotFoundException)
    })
  })

  describe('getForStaff', () => {
    it('shows internal notes with the staff member’s name', async () => {
      db.complaint_case.findUnique.mockResolvedValue(caseRow())
      const view = await service.getForStaff(USER_ID, CASE_ID)
      expect(view.events?.[1]).toMatchObject({ type: 'note_added', actorName: 'Sam Ng', isInternal: true })
    })

    it('refuses a caller who is not staff', async () => {
      db.staff.findFirst.mockResolvedValue(null)
      await expect(service.getForStaff(USER_ID, CASE_ID)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('reopenForCustomer', () => {
    beforeEach(() => {
      tx.complaint_case.updateMany.mockResolvedValue({ count: 1 })
      db.complaint_case.findFirst.mockResolvedValue(caseRow())
    })

    it('reopens a closed case within 7 days of closing and sends it back to the supervisor', async () => {
      db.complaint_case.findFirst.mockResolvedValueOnce({ id: CASE_ID, status: 'closed', closed_at: new Date(NOW.getTime() - 6 * DAY_MS) })
      await service.reopenForCustomer(USER_ID, 'CS-2026-000001')
      expect(tx.complaint_case.updateMany).toHaveBeenCalledWith({
        where: { id: CASE_ID, status: 'closed' },
        data: expect.objectContaining({ status: 'with_supervisor', owner_staff_id: null, resolved_at: null, closed_at: null }),
      })
      expect(tx.case_event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ event_type: 'reopened', actor_type: 'complainant' }),
      })
    })

    it('refuses a resolved case that is not closed yet', async () => {
      db.complaint_case.findFirst.mockResolvedValueOnce({ id: CASE_ID, status: 'resolved', closed_at: null })
      await expect(service.reopenForCustomer(USER_ID, 'CS-2026-000001')).rejects.toThrow('INVALID_STATUS')
    })

    it('refuses more than 7 days after closing', async () => {
      db.complaint_case.findFirst.mockResolvedValueOnce({ id: CASE_ID, status: 'closed', closed_at: new Date(NOW.getTime() - 8 * DAY_MS) })
      await expect(service.reopenForCustomer(USER_ID, 'CS-2026-000001')).rejects.toThrow('CANNOT_REOPEN_AFTER_7_DAYS')
      expect(db.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('setStatus', () => {
    beforeEach(() => {
      tx.complaint_case.updateMany.mockResolvedValue({ count: 1 })
    })

    function givenCase(status: string, owner: string | null) {
      db.complaint_case.findUnique
        .mockResolvedValueOnce({ status, owner_staff_id: owner, case_number: 'CS-2026-000001' })
        .mockResolvedValue(caseRow())
    }

    it('lets the owning agent resolve their case and records the event', async () => {
      givenCase('assigned', STAFF_ID)
      await service.setStatus(USER_ID, CASE_ID, 'resolved', 'Apologised')
      expect(tx.complaint_case.updateMany).toHaveBeenCalledWith({
        where: { id: CASE_ID, status: 'assigned', owner_staff_id: STAFF_ID },
        data: expect.objectContaining({ status: 'resolved', resolved_at: NOW }),
      })
      expect(tx.case_event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ event_type: 'status_changed', from_value: 'assigned', to_value: 'resolved', note: 'Apologised' }),
      })
    })

    it('refuses an agent who does not own the case', async () => {
      givenCase('assigned', SUPERVISOR.id)
      await expect(service.setStatus(USER_ID, CASE_ID, 'resolved')).rejects.toThrow(ForbiddenException)
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('lets the supervisor close a case they do not own', async () => {
      db.staff.findFirst.mockResolvedValue(SUPERVISOR)
      givenCase('resolved', STAFF_ID)
      await service.setStatus(USER_ID, CASE_ID, 'closed')
      expect(tx.complaint_case.updateMany).toHaveBeenCalledWith({
        where: { id: CASE_ID, status: 'resolved', owner_staff_id: STAFF_ID },
        data: expect.objectContaining({ status: 'closed', closed_at: NOW }),
      })
    })

    it.each([
      ['with_supervisor', 'assigned'],
      ['resolved', 'with_supervisor'],
      ['closed', 'with_supervisor'],
      ['assigned', 'closed'],
    ] as const)('refuses %s → %s even for the supervisor (assign and reopen have their own routes)', async (from, to) => {
      db.staff.findFirst.mockResolvedValue(SUPERVISOR)
      givenCase(from, STAFF_ID)
      await expect(service.setStatus(USER_ID, CASE_ID, to)).rejects.toThrow(ConflictException)
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('reports a conflict when someone else changed the case first', async () => {
      givenCase('assigned', STAFF_ID)
      tx.complaint_case.updateMany.mockResolvedValue({ count: 0 })
      await expect(service.setStatus(USER_ID, CASE_ID, 'resolved')).rejects.toThrow(ConflictException)
    })
  })

  describe('addNote', () => {
    it('stores the note as an internal staff event and audits it in the same transaction', async () => {
      db.complaint_case.findUnique.mockResolvedValueOnce({ id: CASE_ID, case_number: 'CS-2026-000001' }).mockResolvedValue(caseRow())
      tx.case_event.create.mockResolvedValue({ id: 'event-1' })
      audit.resolveActor.mockResolvedValue({ kind: 'staff' })

      await service.addNote(USER_ID, CASE_ID, 'Called the pax')

      expect(tx.case_event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ event_type: 'note_added', actor_staff_id: STAFF_ID, note: 'Called the pax', is_internal: true }),
        select: { id: true },
      })
      expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'case_event', entityId: 'event-1' }), tx)
    })
  })

  describe('getChartsForStaff', () => {
    it('reports real values only: no average, flights or weekly counts when there are no cases', async () => {
      db.complaint_case.findMany.mockResolvedValue([])
      const charts = await service.getChartsForStaff(USER_ID)
      expect(charts.avgDaysToClose).toBe('–')
      expect(charts.topFlights).toEqual([])
      expect(charts.weeklyData).toHaveLength(8)
      expect(charts.weeklyData.every((w) => w.count === 0)).toBe(true)
    })

    it('counts cases into Monday-start weeks by opened_at and labels flights by their own date', async () => {
      // NOW is Thursday 12 Nov 2026, so this week starts Monday 9 Nov.
      const flight = {
        id: 'f1',
        flight_number: 'FY308',
        service_date: new Date('2026-11-03'),
        route: { origin: 'BKK', destination: 'NRT' },
      }
      db.complaint_case.findMany.mockResolvedValue([
        { ...caseRow({ type: 'food', opened_at: new Date('2026-11-09T00:00:00Z') }), case_compensation: [], food_complaint: { flight } },
        { ...caseRow({ type: 'food', opened_at: new Date('2026-11-08T23:59:00Z') }), case_compensation: [], food_complaint: { flight } },
      ])
      const charts = await service.getChartsForStaff(USER_ID)
      expect(charts.weeklyData.slice(-2)).toEqual([
        { week: '2 Nov', count: 1, latest: false },
        { week: '9 Nov', count: 1, latest: true },
      ])
      expect(charts.topFlights).toEqual([{ flight: 'FY308', date: '3 Nov', route: 'BKK → NRT', type: 'Food', cases: 2 }])
    })
  })
})
