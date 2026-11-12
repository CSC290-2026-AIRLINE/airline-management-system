import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import type { DbService } from '@backend/db/db.service'
import type { SimulationClock } from '../admin-console/simulation-clock'
import { CustomerServiceService } from './customer-service.service'
import { CreateComplaintDto } from './dto/create-complaint.dto'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests pass a mock `db` instead.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const USER_ID = '11111111-1111-1111-1111-111111111111'
const STAFF_ID = '22222222-2222-2222-2222-222222222222'
const CASE_ID = '33333333-3333-3333-3333-333333333333'
const CUSTOMER = { id: '44444444-4444-4444-4444-444444444444', passenger_id: '55555555-5555-5555-5555-555555555555' }
const NOW = new Date('2026-11-12T08:00:00Z')
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
    complaint_case: { create: jest.fn(), updateMany: jest.fn() },
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
    $transaction: jest.fn(),
  }
  const clock = { now: () => NOW }
  let service: CustomerServiceService

  beforeEach(() => {
    jest.resetAllMocks()
    // A callback runs on the mock transaction client; an array (batch) just resolves.
    db.$transaction.mockImplementation((work: unknown) => (typeof work === 'function' ? work(tx) : Promise.all(work as unknown[])))
    db.customer.findFirst.mockResolvedValue(CUSTOMER)
    db.staff.findFirst.mockResolvedValue({ id: STAFF_ID })
    service = new CustomerServiceService(db as unknown as DbService, clock as unknown as SimulationClock)
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

  describe('setStatus', () => {
    beforeEach(() => {
      tx.complaint_case.updateMany.mockResolvedValue({ count: 1 })
      db.complaint_case.findUnique.mockResolvedValueOnce({ status: 'with_supervisor', owner_staff_id: null }).mockResolvedValue(caseRow())
    })

    it('assigns a new case to the caller and records an assigned event', async () => {
      await service.setStatus(USER_ID, CASE_ID, 'assigned')
      expect(tx.complaint_case.updateMany).toHaveBeenCalledWith({
        where: { id: CASE_ID, status: 'with_supervisor' },
        data: expect.objectContaining({ status: 'assigned', owner_staff_id: STAFF_ID }),
      })
      expect(tx.case_event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          event_type: 'assigned',
          actor_staff_id: STAFF_ID,
          from_value: 'with_supervisor',
          to_value: 'assigned',
        }),
      })
    })

    it('reopening clears the owner and the resolution', async () => {
      db.complaint_case.findUnique.mockReset()
      db.complaint_case.findUnique.mockResolvedValueOnce({ status: 'closed', owner_staff_id: STAFF_ID }).mockResolvedValue(caseRow())
      await service.setStatus(USER_ID, CASE_ID, 'with_supervisor')
      expect(tx.complaint_case.updateMany).toHaveBeenCalledWith({
        where: { id: CASE_ID, status: 'closed' },
        data: expect.objectContaining({ status: 'with_supervisor', owner_staff_id: null, resolved_at: null, closed_at: null }),
      })
      expect(tx.case_event.create).toHaveBeenCalledWith({ data: expect.objectContaining({ event_type: 'reopened' }) })
    })

    it('rejects skipping a step', async () => {
      await expect(service.setStatus(USER_ID, CASE_ID, 'closed')).rejects.toThrow(ConflictException)
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('reports a conflict when someone else changed the case first', async () => {
      tx.complaint_case.updateMany.mockResolvedValue({ count: 0 })
      await expect(service.setStatus(USER_ID, CASE_ID, 'assigned')).rejects.toThrow(ConflictException)
    })
  })

  describe('addNote', () => {
    it('stores the note as an internal staff event', async () => {
      db.complaint_case.findUnique.mockResolvedValueOnce({ id: CASE_ID }).mockResolvedValue(caseRow())
      await service.addNote(USER_ID, CASE_ID, 'Called the pax')
      expect(db.case_event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ event_type: 'note_added', actor_staff_id: STAFF_ID, note: 'Called the pax', is_internal: true }),
      })
    })
  })
})
