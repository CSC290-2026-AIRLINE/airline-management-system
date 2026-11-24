import { BadRequestException, ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import type { DbService } from '@backend/db/db.service'
import type { SimulationClock } from '../admin-console/simulation-clock'
import type { AuditService } from '../admin-console/audit/audit.service'
import { CustomerServiceService } from './customer-service.service'
import { CreateComplaintDto } from './dto/create-complaint.dto'
import { NotificationService } from './notification.service'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests pass a mock `db` instead.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const USER_ID = '11111111-1111-1111-1111-111111111111'
const STAFF_ID = '22222222-2222-2222-2222-222222222222'
const CASE_ID = '33333333-3333-3333-3333-333333333333'
const CUSTOMER = { id: '44444444-4444-4444-4444-444444444444', passenger_id: '55555555-5555-5555-5555-555555555555', phone: '+66812345678' }
const NOW = new Date('2026-11-12T08:00:00Z')
const AGENT = { id: STAFF_ID, role: { code: 'cs-agent', is_admin: false } }
const SUPERVISOR = { id: '66666666-6666-6666-6666-666666666666', role: { code: 'cs-supervisor', is_admin: false } }
const DAY_MS = 24 * 60 * 60 * 1000
/** A departure before NOW: complaints are only about flights that have left. */
const FLOWN = new Date('2026-11-01T02:00:00Z')
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
    case_compensation: { findFirst: jest.fn(), create: jest.fn() },
    passenger: { findUnique: jest.fn() },
    notification: { findUnique: jest.fn(), update: jest.fn() },
    notification_template: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    notification_preference: { upsert: jest.fn() },
  }
  const db = {
    customer: { findFirst: jest.fn() },
    staff: { findFirst: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn(),
    complaint_case: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    case_event: { create: jest.fn() },
    booking_segment: { findFirst: jest.fn() },
    lost_bag_report: { findUnique: jest.fn() },
    notification_type: { findUnique: jest.fn(), findMany: jest.fn() },
    notification_preference: { findMany: jest.fn() },
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
      db.$queryRaw.mockResolvedValue([{ id: 'flight-1', dep_at: FLOWN }])
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
      db.$queryRaw.mockResolvedValue([{ id: 'flight-1', dep_at: FLOWN }])
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
      db.$queryRaw.mockResolvedValue([{ id: 'flight-1', dep_at: FLOWN }])
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

    it('refuses a complaint about a flight that has not departed yet, and writes nothing', async () => {
      db.$queryRaw.mockResolvedValue([{ id: 'flight-1', dep_at: new Date(NOW.getTime() + DAY_MS) }])
      const dto = { type: 'flight' as const, flight_number: 'FL501', service_date: '2026-11-13', issue: 'delay', description: DESCRIPTION }

      await expect(service.create(USER_ID, 'pax@example.com', dto)).rejects.toThrow('FLIGHT_NOT_DEPARTED')
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

    it('stores the customer’s phone on the case and sends complaint_received to it', async () => {
      const notifications = { handleEvent: jest.fn().mockResolvedValue({ ignored: false }) }
      service = new CustomerServiceService(
        db as unknown as DbService,
        clock as unknown as SimulationClock,
        audit as unknown as AuditService,
        notifications as unknown as NotificationService,
      )
      tx.case_event.create.mockResolvedValue({ id: 'created-evt' })

      await service.create(USER_ID, 'pax@example.com', { type: 'employee', location: 'gate', description: DESCRIPTION })

      expect(tx.complaint_case.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ contact_phone: '+66812345678' }) }),
      )
      expect(notifications.handleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'complaint_received',
          recipients: [expect.objectContaining({ email: 'pax@example.com', phone: '+66812345678', customerId: CUSTOMER.id })],
        }),
      )
    })

    it('stores no phone when the customer has none', async () => {
      db.customer.findFirst.mockResolvedValue({ ...CUSTOMER, phone: '  ' })
      await service.create(USER_ID, 'pax@example.com', { type: 'employee', location: 'gate', description: DESCRIPTION })
      expect(tx.complaint_case.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ contact_phone: null }) }),
      )
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

    it('gives an employee case no flight or meal, and its location and staff name in their own fields', async () => {
      db.complaint_case.findUnique.mockResolvedValue(
        caseRow({ employee_complaint: { location: 'gate', staff_name: 'Gate agent with name tag Nok', description: DESCRIPTION } }),
      )
      const view = await service.getForStaff(USER_ID, CASE_ID)
      expect(view).toMatchObject({ location: 'gate', staffName: 'Gate agent with name tag Nok', mealDetail: null })
      expect(view.flightRoute).toBeUndefined()
    })

    it('shows times in Bangkok time, not UTC', async () => {
      db.complaint_case.findUnique.mockResolvedValue(caseRow())
      const view = await service.getForStaff(USER_ID, CASE_ID)
      // NOW is 08:00 UTC, 15:00 in Bangkok.
      expect(view.openedLabel).toBe('Opened 12 Nov 15:00 by the customer')
      expect(view.events?.[0].timeLabel).toBe('12 Nov 15:00')
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

    it('sends the stored case number in the notification, not the typed one', async () => {
      const notifications = { handleEvent: jest.fn().mockResolvedValue({ ignored: false }) }
      service = new CustomerServiceService(
        db as unknown as DbService,
        clock as unknown as SimulationClock,
        audit as unknown as AuditService,
        notifications as unknown as NotificationService,
      )
      tx.case_event.create.mockResolvedValue({ id: 'reopen-evt' })
      db.complaint_case.findFirst.mockResolvedValueOnce({ id: CASE_ID, status: 'closed', closed_at: new Date(NOW.getTime() - DAY_MS) })

      await service.reopenForCustomer(USER_ID, ' cs-2026-000001 ')

      expect(notifications.handleEvent).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ case_number: 'CS-2026-000001' }) }),
      )
    })

    it('labels a reopen by the complainant as Customer on the staff timeline', async () => {
      const reopened = {
        id: 'e9',
        event_type: 'reopened',
        actor_type: 'complainant',
        staff: null,
        from_value: 'closed',
        to_value: 'with_supervisor',
        note: null,
        is_internal: false,
        occurred_at: NOW,
      }
      db.complaint_case.findUnique.mockResolvedValue(caseRow({ case_event: [reopened] }))
      const view = await service.getForStaff(USER_ID, CASE_ID)
      expect(view.events?.[0]).toMatchObject({ type: 'reopened', actorLabel: 'Customer', title: 'Reopened case' })
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
      ['with_supervisor', 'resolved'],
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
      db.complaint_case.findUnique
        .mockResolvedValueOnce({ id: CASE_ID, case_number: 'CS-2026-000001', owner_staff_id: STAFF_ID })
        .mockResolvedValue(caseRow())
      tx.case_event.create.mockResolvedValue({ id: 'event-1' })
      audit.resolveActor.mockResolvedValue({ kind: 'staff' })

      await service.addNote(USER_ID, CASE_ID, 'Called the pax')

      expect(tx.case_event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ event_type: 'note_added', actor_staff_id: STAFF_ID, note: 'Called the pax', is_internal: true }),
        select: { id: true },
      })
      expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'case_event', entityId: 'event-1' }), tx)
    })

    it('refuses an agent who is not the case owner with 403 NOT_CASE_OWNER', async () => {
      db.complaint_case.findUnique.mockResolvedValueOnce({ id: CASE_ID, case_number: 'CS-2026-000001', owner_staff_id: SUPERVISOR.id })
      await expect(service.addNote(USER_ID, CASE_ID, 'Unauthorized note')).rejects.toThrow(new ForbiddenException('NOT_CASE_OWNER'))
      expect(tx.case_event.create).not.toHaveBeenCalled()
    })

    it('allows a supervisor to add a note to a case they do not own', async () => {
      db.staff.findFirst.mockResolvedValue(SUPERVISOR)
      db.complaint_case.findUnique
        .mockResolvedValueOnce({ id: CASE_ID, case_number: 'CS-2026-000001', owner_staff_id: STAFF_ID })
        .mockResolvedValue(caseRow({ owner_staff_id: STAFF_ID }))
      tx.case_event.create.mockResolvedValue({ id: 'event-sup' })
      audit.resolveActor.mockResolvedValue({ kind: 'staff' })

      await service.addNote(USER_ID, CASE_ID, 'Supervisor note')
      expect(tx.case_event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          event_type: 'note_added',
          actor_staff_id: SUPERVISOR.id,
          note: 'Supervisor note',
          is_internal: true,
        }),
        select: { id: true },
      })
    })
  })

  describe('assignOwner', () => {
    it('refuses assigning to staff who is not cs-agent or cs-supervisor with 400', async () => {
      db.staff.findFirst
        .mockResolvedValueOnce(SUPERVISOR)
        .mockResolvedValueOnce({ id: 'other-staff', first_name: 'Pilot', last_name: 'Bob', role: { code: 'pilot' } })
      await expect(service.assignOwner(USER_ID, CASE_ID, 'other-staff')).rejects.toThrow(
        new BadRequestException('Target staff must have role cs-agent or cs-supervisor'),
      )
      expect(tx.complaint_case.updateMany).not.toHaveBeenCalled()
    })

    it('assigns to a valid cs-agent and records the assigned event', async () => {
      db.staff.findFirst
        .mockResolvedValueOnce(SUPERVISOR)
        .mockResolvedValueOnce({ id: STAFF_ID, first_name: 'Kenji', last_name: 'Sato', role: { code: 'cs-agent' } })
      db.complaint_case.findUnique
        .mockResolvedValueOnce({ id: CASE_ID, status: 'with_supervisor', owner_staff_id: null, case_number: 'CS-2026-000001' })
        .mockResolvedValue(caseRow({ status: 'assigned', owner_staff_id: STAFF_ID }))
      tx.complaint_case.updateMany.mockResolvedValue({ count: 1 })
      tx.case_event.create.mockResolvedValue({ id: 'assign-evt' })

      await service.assignOwner(USER_ID, CASE_ID, STAFF_ID)
      expect(tx.complaint_case.updateMany).toHaveBeenCalledWith({
        where: { id: CASE_ID, status: 'with_supervisor', owner_staff_id: null },
        data: expect.objectContaining({ status: 'assigned', owner_staff_id: STAFF_ID }),
      })
      expect(tx.case_event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ event_type: 'assigned', actor_type: 'staff', note: 'Assigned to Kenji Sato' }),
      })
    })
  })

  describe('assignOwner (status, races and disabled staff)', () => {
    const KENJI = { id: STAFF_ID, first_name: 'Kenji', last_name: 'Sato', role: { code: 'cs-agent' } }

    it.each(['resolved', 'closed'])('refuses a %s case with 409 INVALID_STATUS', async (status) => {
      db.staff.findFirst.mockResolvedValueOnce(SUPERVISOR).mockResolvedValueOnce(KENJI)
      db.complaint_case.findUnique.mockResolvedValueOnce({ status, owner_staff_id: STAFF_ID, case_number: 'CS-2026-000001' })
      await expect(service.assignOwner(USER_ID, CASE_ID, STAFF_ID)).rejects.toThrow(new ConflictException('INVALID_STATUS'))
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('requires the owner it read, so a reassignment in between is a 409 instead of a lost update', async () => {
      db.staff.findFirst.mockResolvedValueOnce(SUPERVISOR).mockResolvedValueOnce(KENJI)
      db.complaint_case.findUnique.mockResolvedValueOnce({
        status: 'assigned',
        owner_staff_id: SUPERVISOR.id,
        case_number: 'CS-2026-000001',
      })
      tx.complaint_case.updateMany.mockResolvedValue({ count: 0 })

      await expect(service.assignOwner(USER_ID, CASE_ID, STAFF_ID)).rejects.toThrow(ConflictException)
      expect(tx.complaint_case.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CASE_ID, status: 'assigned', owner_staff_id: SUPERVISOR.id } }),
      )
      expect(tx.case_event.create).not.toHaveBeenCalled()
    })

    it('does not find a target whose login is disabled or deleted (404)', async () => {
      db.staff.findFirst.mockResolvedValueOnce(SUPERVISOR).mockResolvedValueOnce(null)
      await expect(service.assignOwner(USER_ID, CASE_ID, STAFF_ID)).rejects.toThrow(NotFoundException)
      expect(db.staff.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: STAFF_ID, deleted_at: null, user: { disabled_at: null, deleted_at: null } } }),
      )
    })

    it('lists only CS staff whose login is active as possible owners', async () => {
      db.staff.findMany.mockResolvedValue([])
      await service.getStaffMembers()
      expect(db.staff.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deleted_at: null, user: { disabled_at: null, deleted_at: null }, role: { code: { in: ['cs-agent', 'cs-supervisor'] } } },
        }),
      )
    })
  })

  describe('age label', () => {
    it('is measured against the simulation clock, not the wall clock', async () => {
      db.complaint_case.findUnique.mockResolvedValue(caseRow({ opened_at: new Date(NOW.getTime() - 3 * DAY_MS) }))
      expect((await service.getForStaff(USER_ID, CASE_ID)).age).toBe('3 d')
      db.complaint_case.findUnique.mockResolvedValue(caseRow({ opened_at: new Date(NOW.getTime() - 5 * 60_000) }))
      expect((await service.getForStaff(USER_ID, CASE_ID)).age).toBe('5 min')
    })
  })

  describe('retryNotificationForStaff', () => {
    beforeEach(() => {
      const notifications = new NotificationService(db as unknown as DbService, clock as unknown as SimulationClock)
      service = new CustomerServiceService(
        db as unknown as DbService,
        clock as unknown as SimulationClock,
        audit as unknown as AuditService,
        notifications,
      )
    })

    it('is a 404 for an unknown message, with no audit entry', async () => {
      tx.notification.findUnique.mockResolvedValue(null)
      await expect(service.retryNotificationForStaff(USER_ID, 'missing')).rejects.toThrow(NotFoundException)
      expect(audit.write).not.toHaveBeenCalled()
    })

    it('is a 409 NOT_FAILED for a message that was sent, with no audit entry', async () => {
      tx.notification.findUnique.mockResolvedValue({ id: 'n1', status: 'sent', inbound_event: { payload: {} } })
      await expect(service.retryNotificationForStaff(USER_ID, 'n1')).rejects.toThrow(new ConflictException('NOT_FAILED'))
      expect(tx.notification.update).not.toHaveBeenCalled()
      expect(audit.write).not.toHaveBeenCalled()
    })
  })

  describe('getPreferencesForCustomer', () => {
    it('defaults to email on, SMS and push off, and hides the security types', async () => {
      db.notification_type.findMany.mockResolvedValue([
        { code: 'complaint_received', name: 'Complaint received', source_feature: '13', is_mandatory: true },
        { code: 'gate_changed', name: 'Gate changed', source_feature: '6', is_mandatory: false },
      ])
      db.notification_preference.findMany.mockResolvedValue([{ type_code: 'gate_changed', channel: 'sms', is_enabled: true }])

      const prefs = await service.getPreferencesForCustomer(USER_ID)

      expect(db.notification_type.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: { notIn: ['security_alert', 'security_alert_withdrawn'] } } }),
      )
      expect(db.notification_preference.findMany).toHaveBeenCalledWith({ where: { customer_id: CUSTOMER.id } })
      expect(prefs).toEqual([
        {
          typeCode: 'complaint_received',
          typeName: 'Complaint received',
          service: 'Customer service',
          isMandatory: true,
          smsAvailable: true,
          email: true,
          sms: false,
          push: false,
        },
        {
          typeCode: 'gate_changed',
          typeName: 'Gate changed',
          service: 'Check-in and boarding',
          isMandatory: false,
          smsAvailable: true,
          email: true,
          sms: true,
          push: false,
        },
      ])
    })
  })

  describe('listForStaff', () => {
    it('lists open cases first, unassigned ahead of assigned, then finished cases', async () => {
      db.complaint_case.findMany
        .mockResolvedValueOnce([
          caseRow({ id: 'a1', status: 'assigned' }),
          caseRow({ id: 'u1', status: 'with_supervisor' }),
          caseRow({ id: 'u2', status: 'with_supervisor' }),
        ])
        .mockResolvedValueOnce([caseRow({ id: 'c1', status: 'closed' })])

      const rows = await service.listForStaff(USER_ID)

      expect(rows.map((r) => r.id)).toEqual(['u1', 'u2', 'a1', 'c1'])
      expect(db.complaint_case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: { in: ['with_supervisor', 'assigned'] } } }),
      )
    })
  })

  describe('decideCompensation', () => {
    const dto = { type: 'voucher' as const, amount: 1000, reason: 'Missing meal' }

    it('turns a concurrent decision hitting case_compensation_live_uq into COMPENSATION_EXISTS', async () => {
      db.complaint_case.findUnique.mockResolvedValue({ id: CASE_ID, case_number: 'CS-2026-000001' })
      tx.case_compensation.findFirst.mockResolvedValue(null)
      tx.case_compensation.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))

      await expect(service.decideCompensation(USER_ID, CASE_ID, dto)).rejects.toThrow(new ConflictException('COMPENSATION_EXISTS'))
    })

    it('passes other database errors through unchanged', async () => {
      db.complaint_case.findUnique.mockResolvedValue({ id: CASE_ID, case_number: 'CS-2026-000001' })
      tx.case_compensation.findFirst.mockResolvedValue(null)
      tx.case_compensation.create.mockRejectedValue(new Error('connection lost'))

      await expect(service.decideCompensation(USER_ID, CASE_ID, dto)).rejects.toThrow('connection lost')
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

    it('leaves cases resolved as a duplicate out of the charts', async () => {
      db.complaint_case.findMany.mockResolvedValue([])
      await service.getChartsForStaff(USER_ID)
      expect(db.complaint_case.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { duplicate_of_case_id: null } }))
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

  describe('templates', () => {
    const template = (channel: string, is_active: boolean, subject_template: string | null, body_template: string) => ({
      id: `tpl-${channel}`,
      channel,
      is_active,
      subject_template,
      body_template,
    })
    const savedSms = template('sms', true, null, 'We received your complaint. Case number: {{case_number}}.')

    beforeEach(() => {
      db.notification_type.findUnique.mockResolvedValue({ code: 'complaint_received', source_feature: '13' })
      db.notification_type.findMany.mockResolvedValue([])
      tx.notification_template.update.mockResolvedValue({ id: 'tpl-sms' })
      tx.notification_template.create.mockResolvedValue({ id: 'tpl-new' })
    })

    it('marks ✓ for on, – for switched off and ! for no template, with the real source feature and placeholders', async () => {
      db.notification_type.findMany.mockResolvedValue([
        {
          code: 'flight_delayed',
          source_feature: '2',
          name: 'Flight delayed',
          is_mandatory: true,
          notification_template: [template('email', true, 'Delayed', 'Body'), template('sms', false, null, 'Body')],
        },
      ])
      const [row] = await service.getTemplatesForStaff(USER_ID)
      expect(row).toMatchObject({ feature: 'Feature 2', emailState: '✓', smsState: '–', pushState: '!' })
      expect(row.placeholders).toEqual(['passenger_name', 'flight_number', 'service_date', 'new_departure'])
      expect(row.pushBody).toBeUndefined()
    })

    it('records the staff member on an update', async () => {
      tx.notification_template.findUnique.mockResolvedValue(savedSms)
      await service.updateTemplateForStaff(USER_ID, 'complaint_received', { channel: 'sms', isActive: false })
      expect(tx.notification_template.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ is_active: false, updated_by: STAFF_ID }) }),
      )
    })

    it('records the staff member when it creates a missing template', async () => {
      tx.notification_template.findUnique.mockResolvedValue(null)
      await service.updateTemplateForStaff(USER_ID, 'complaint_received', {
        channel: 'push',
        subjectTemplate: '',
        bodyTemplate: 'Case {{case_number}} received.',
      })
      expect(tx.notification_template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ channel: 'push', subject_template: null, updated_by: STAFF_ID }),
        }),
      )
    })

    it('requires an email subject and a body on every channel', async () => {
      tx.notification_template.findUnique.mockResolvedValue(null)
      await expect(
        service.updateTemplateForStaff(USER_ID, 'complaint_received', { channel: 'email', subjectTemplate: '', bodyTemplate: 'Hi' }),
      ).rejects.toThrow('EMAIL_SUBJECT_REQUIRED')
      await expect(service.updateTemplateForStaff(USER_ID, 'complaint_received', { channel: 'push', isActive: true })).rejects.toThrow(
        'TEMPLATE_BODY_REQUIRED',
      )
      tx.notification_template.findUnique.mockResolvedValue(savedSms)
      await expect(service.updateTemplateForStaff(USER_ID, 'complaint_received', { channel: 'sms', bodyTemplate: '' })).rejects.toThrow(
        'TEMPLATE_BODY_REQUIRED',
      )
      expect(tx.notification_template.create).not.toHaveBeenCalled()
      expect(tx.notification_template.update).not.toHaveBeenCalled()
    })

    it('refuses placeholders the message type does not fill', async () => {
      tx.notification_template.findUnique.mockResolvedValue(savedSms)
      const update = service.updateTemplateForStaff(USER_ID, 'complaint_received', {
        channel: 'sms',
        bodyTemplate: 'Hi {{first_name}}, case {{case_number}} is in.',
      })
      await expect(update).rejects.toBeInstanceOf(BadRequestException)
      await expect(update).rejects.toMatchObject({ response: { message: 'INVALID_PLACEHOLDER', placeholders: ['first_name'] } })
      expect(tx.notification_template.update).not.toHaveBeenCalled()
    })

    it('refuses switching off the email channel for a mandatory notification type with 400 MANDATORY_EMAIL_REQUIRED', async () => {
      db.notification_type.findUnique.mockResolvedValue({ code: 'complaint_received', is_mandatory: true })
      await expect(service.updateTemplateForStaff(USER_ID, 'complaint_received', { channel: 'email', isActive: false })).rejects.toThrow(
        new BadRequestException('MANDATORY_EMAIL_REQUIRED'),
      )
      expect(tx.notification_template.update).not.toHaveBeenCalled()
    })
  })

  describe('customer view of an assigned case', () => {
    it('leaves out the owner’s name and staff id, including the assignment note', async () => {
      const assigned = {
        id: 'e3',
        event_type: 'assigned',
        actor_type: 'staff',
        staff: { first_name: 'Sam', last_name: 'Ng' },
        from_value: 'with_supervisor',
        to_value: 'assigned',
        note: 'Assigned to Kenji Sato',
        is_internal: false,
        occurred_at: NOW,
      }
      const row = caseRow({ staff: { first_name: 'Kenji', last_name: 'Sato' }, owner_staff_id: STAFF_ID, case_event: [assigned] })
      db.complaint_case.findFirst.mockResolvedValue(row)
      db.complaint_case.findUnique.mockResolvedValue(row)

      const customerView = await service.getForCustomer(USER_ID, 'CS-2026-000001')
      expect(customerView.ownerStaffId).toBeUndefined()
      expect(customerView.events?.[0]).toMatchObject({ title: 'Assigned to a Customer Service agent', note: null })

      const staffView = await service.getForStaff(USER_ID, CASE_ID)
      expect(staffView.ownerStaffId).toBe(STAFF_ID)
      expect(staffView.events?.[0]).toMatchObject({ title: 'Assigned to Kenji Sato' })
    })
  })

  describe('notification after a saved change', () => {
    it('logs a failed notification instead of failing the request, and sends a readable status', async () => {
      const notifications = { handleEvent: jest.fn().mockRejectedValue(new Error('provider down')) }
      service = new CustomerServiceService(
        db as unknown as DbService,
        clock as unknown as SimulationClock,
        audit as unknown as AuditService,
        notifications as unknown as NotificationService,
      )
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
      tx.complaint_case.updateMany.mockResolvedValue({ count: 1 })
      tx.case_event.create.mockResolvedValue({ id: 'ev-1' })
      db.complaint_case.findUnique
        .mockResolvedValueOnce({ status: 'assigned', owner_staff_id: STAFF_ID, case_number: 'CS-2026-000001' })
        .mockResolvedValue(caseRow())

      await expect(service.setStatus(USER_ID, CASE_ID, 'resolved', 'Apologised')).resolves.toMatchObject({ id: CASE_ID })
      expect(notifications.handleEvent).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ status: 'Resolved' }) }),
      )
    })
  })

  describe('updatePreferencesForCustomer', () => {
    it('refuses unknown and security types with a 400 and saves nothing', async () => {
      db.notification_type.findMany.mockResolvedValue([{ code: 'flight_delayed' }])
      const preferences = [
        { typeCode: 'flight_delayed', email: true, sms: false, push: false },
        { typeCode: 'no_such_type', email: true, sms: false, push: false },
        { typeCode: 'security_alert', email: false, sms: false, push: false },
      ]

      await expect(service.updatePreferencesForCustomer(USER_ID, { preferences })).rejects.toThrow(
        'Unknown notification type: no_such_type, security_alert',
      )
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('saves every channel of every type inside one transaction', async () => {
      db.notification_type.findMany.mockResolvedValue([{ code: 'flight_delayed' }, { code: 'gate_changed' }])
      db.notification_preference.findMany.mockResolvedValue([])
      const preferences = [
        { typeCode: 'flight_delayed', email: true, sms: true, push: false },
        { typeCode: 'gate_changed', email: false, sms: false, push: true },
      ]

      await service.updatePreferencesForCustomer(USER_ID, { preferences })

      expect(db.$transaction).toHaveBeenCalledTimes(1)
      expect(tx.notification_preference.upsert).toHaveBeenCalledTimes(6)
    })

    it('refuses SMS on an account with no phone number, since those messages would be skipped', async () => {
      db.customer.findFirst.mockResolvedValue({ ...CUSTOMER, phone: null })
      db.notification_type.findMany.mockResolvedValue([{ code: 'flight_delayed' }])
      const preferences = [{ typeCode: 'flight_delayed', email: true, sms: true, push: false }]

      await expect(service.updatePreferencesForCustomer(USER_ID, { preferences })).rejects.toThrow('SMS_NEEDS_PHONE')
      expect(db.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('listForCustomer', () => {
    it('returns the customer view of each case: no internal notes, staff names, staff ids or assignment notes', async () => {
      const assigned = {
        id: 'e3',
        event_type: 'assigned',
        actor_type: 'staff',
        staff: { first_name: 'Sam', last_name: 'Ng' },
        from_value: 'with_supervisor',
        to_value: 'assigned',
        note: 'Assigned to Kenji Sato',
        is_internal: false,
        occurred_at: NOW,
      }
      const row = caseRow({ staff: { first_name: 'Kenji', last_name: 'Sato' }, owner_staff_id: STAFF_ID })
      db.complaint_case.findMany.mockResolvedValue([{ ...row, case_event: [...row.case_event, assigned] }])

      const [view] = await service.listForCustomer(USER_ID)

      expect(view.events?.map((e) => e.type)).toEqual(['created', 'assigned'])
      expect(view.events?.every((e) => e.actorName === null && e.actorLabel === 'Flython Customer Service')).toBe(true)
      expect(view.events?.[1]).toMatchObject({ title: 'Assigned to a Customer Service agent', note: null })
      expect(view.ownerName).toBeNull()
      expect(view.ownerStaffId).toBeUndefined()
      expect(JSON.stringify(view)).not.toMatch(/Kenji|Sam Ng|Called the pax/)
    })
  })

  describe('booking and meal shown on a case', () => {
    const FLIGHT_ID = '77777777-7777-7777-7777-777777777777'
    const flight = { flight_number: 'FY308', service_date: NOW, route: { origin: 'BKK', destination: 'CNX' } }

    it('shows the complainant’s booking that holds the complaint’s flight, not their latest booking', async () => {
      const row = caseRow({
        type: 'food',
        employee_complaint: null,
        food_complaint: { flight_id: FLIGHT_ID, flight, product: null, issue: 'missing', details: DESCRIPTION },
        customer: {
          booking: [
            { booking_reference: 'LATEST', booking_segment: [{ flight_id: 'another-flight' }] },
            { booking_reference: 'HOLDS1', booking_segment: [{ flight_id: FLIGHT_ID }] },
          ],
        },
      })
      db.complaint_case.findUnique.mockResolvedValue(row)

      const view = await service.getForStaff(USER_ID, CASE_ID)
      expect(view.bookingRef).toBe('HOLDS1')
      expect(view.mealDetail).toBeNull()
    })

    it('finds a booking the complainant travels on, and shows none for an employee complaint', async () => {
      const food = caseRow({
        type: 'food',
        employee_complaint: null,
        food_complaint: { flight_id: FLIGHT_ID, flight, product: { name: 'Vegetarian meal' }, issue: 'missing', details: DESCRIPTION },
        passenger: {
          first_name: 'Ann',
          last_name: 'Lee',
          booking_passenger: [{ booking: { booking_reference: 'TRAVEL', booking_segment: [{ flight_id: FLIGHT_ID }] } }],
        },
      })
      db.complaint_case.findUnique.mockResolvedValueOnce(food).mockResolvedValueOnce(caseRow())

      expect(await service.getForStaff(USER_ID, CASE_ID)).toMatchObject({ bookingRef: 'TRAVEL', mealDetail: 'Vegetarian meal' })
      expect((await service.getForStaff(USER_ID, CASE_ID)).bookingRef).toBeNull()
    })
  })
  describe('openLostBagCase', () => {
    const REPORT_ID = '77777777-7777-7777-7777-777777777777'
    const report = (overrides: Record<string, unknown> = {}) => ({
      case_number: 'LB-2026-000009',
      status: 'lost',
      passenger_id: CUSTOMER.passenger_id,
      booking_passenger_id: 'bp-1',
      flight_id: 'flight-1',
      bag_type: 'suitcase',
      colour: 'black',
      brand: null,
      contact_email: 'pax@example.com',
      contact_phone: null,
      passenger: { first_name: 'Ann', last_name: 'Lee', customer: { id: CUSTOMER.id, phone: CUSTOMER.phone } },
      ...overrides,
    })
    let notifications: { handleEvent: jest.Mock }

    beforeEach(() => {
      notifications = { handleEvent: jest.fn().mockResolvedValue({ ignored: false }) }
      service = new CustomerServiceService(
        db as unknown as DbService,
        clock as unknown as SimulationClock,
        audit as unknown as AuditService,
        notifications as unknown as NotificationService,
      )
      tx.$queryRaw.mockResolvedValue([{ n: 7n }])
      tx.complaint_case.create.mockResolvedValue({ id: CASE_ID })
      tx.case_event.create.mockResolvedValue({ id: 'ev-lost' })
    })

    it('opens a lost_bag flight case from Feature 10 and tells the passenger', async () => {
      db.complaint_case.findUnique.mockResolvedValue(null)
      db.lost_bag_report.findUnique.mockResolvedValue(report())

      await expect(service.openLostBagCase(REPORT_ID)).resolves.toEqual({
        caseId: CASE_ID,
        caseNumber: 'CS-2026-000007',
        created: true,
      })
      expect(tx.complaint_case.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'flight',
            source: 'feature_10',
            lost_bag_report_id: REPORT_ID,
            customer_id: CUSTOMER.id,
            contact_phone: CUSTOMER.phone,
          }),
        }),
      )
      expect(tx.flight_complaint.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ issue: 'lost_bag', flight_id: 'flight-1' }) }),
      )
      expect(tx.case_event.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ actor_type: 'system' }) }),
      )
      expect(notifications.handleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'complaint_received',
          caseId: CASE_ID,
          payload: expect.objectContaining({ case_number: 'CS-2026-000007' }),
        }),
      )
    })

    it('returns the case already opened for the report without sending again', async () => {
      db.complaint_case.findUnique.mockResolvedValue({ id: CASE_ID, case_number: 'CS-2026-000003' })

      await expect(service.openLostBagCase(REPORT_ID)).resolves.toEqual({ caseId: CASE_ID, caseNumber: 'CS-2026-000003', created: false })
      expect(db.$transaction).not.toHaveBeenCalled()
      expect(notifications.handleEvent).not.toHaveBeenCalled()
    })

    it('leaves customer_id empty when the passenger has no account', async () => {
      db.complaint_case.findUnique.mockResolvedValue(null)
      db.lost_bag_report.findUnique.mockResolvedValue(report({ passenger: { first_name: 'Ann', last_name: 'Lee', customer: null } }))

      await service.openLostBagCase(REPORT_ID)
      expect(tx.complaint_case.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ customer_id: null, booking_passenger_id: 'bp-1' }) }),
      )
    })

    it('refuses a report that is not lost', async () => {
      db.complaint_case.findUnique.mockResolvedValue(null)
      db.lost_bag_report.findUnique.mockResolvedValue(report({ status: 'open' }))

      await expect(service.openLostBagCase(REPORT_ID)).rejects.toBeInstanceOf(ConflictException)
    })

    it("returns the other call's case when two calls race on the same report", async () => {
      db.complaint_case.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'other', case_number: 'CS-2026-000008' })
      db.lost_bag_report.findUnique.mockResolvedValue(report())
      db.$transaction.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))

      await expect(service.openLostBagCase(REPORT_ID)).resolves.toEqual({ caseId: 'other', caseNumber: 'CS-2026-000008', created: false })
      expect(notifications.handleEvent).not.toHaveBeenCalled()
    })
  })
})
