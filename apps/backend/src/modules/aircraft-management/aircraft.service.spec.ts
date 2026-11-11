import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { AircraftService } from './aircraft.service'
import { AuditService } from './audit.service'
import { SimulationClockService } from './simulation-clock.service'

// ESM-only dependencies that Jest cannot load here; the service under test never calls into them.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

function dateOnly(offsetDays: number): Date {
  const today = new Date()
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offsetDays))
}

describe('AircraftService', () => {
  let db: {
    aircraft: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock }
    aircraft_type: { findFirst: jest.Mock }
    airport: { findUnique: jest.Mock }
    aircraft_status_period: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock }
    aircraft_maintenance: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock }
    aircraft_operating_day: { findMany: jest.Mock; deleteMany: jest.Mock; createMany: jest.Mock }
    flight: { count: jest.Mock }
    $transaction: jest.Mock
  }
  let audit: AuditService
  let auditRecord: jest.SpyInstance
  let tx: {
    aircraft: { create: jest.Mock }
    aircraft_status_period: { create: jest.Mock; update: jest.Mock; findMany: jest.Mock }
    aircraft_maintenance: { create: jest.Mock; update: jest.Mock }
    aircraft_operating_day: { deleteMany: jest.Mock; createMany: jest.Mock; findMany: jest.Mock }
  }
  let service: AircraftService

  const aircraftRow = (periods: unknown[]) => ({
    id: 'a1',
    tail_number: 'HS-ABF',
    aircraft_type_id: 't1',
    entry_into_service_date: dateOnly(-1000),
    retired_on: null,
    base_airport_code: 'BKK',
    aircraft_type: { id: 't1', code: 'A320', model: 'A320' },
    aircraft_status_period: periods,
  })

  beforeEach(() => {
    tx = {
      aircraft: { create: jest.fn() },
      aircraft_status_period: { create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      aircraft_maintenance: { create: jest.fn(), update: jest.fn() },
      aircraft_operating_day: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
    }
    db = {
      aircraft: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      aircraft_type: { findFirst: jest.fn() },
      airport: { findUnique: jest.fn() },
      aircraft_status_period: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      aircraft_maintenance: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      aircraft_operating_day: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
      flight: { count: jest.fn() },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => Promise.resolve(callback(tx))),
    }
    audit = new AuditService()
    auditRecord = jest.spyOn(audit, 'record')
    service = new AircraftService(db as unknown as DbService, new SimulationClockService(), audit)
  })

  describe('findAll', () => {
    it('keeps a status period that ends today, because end_date is inclusive', async () => {
      db.aircraft.findMany.mockResolvedValue([
        aircraftRow([
          {
            id: 'p1',
            status: 'grounded',
            origin: 'manual',
            reason: 'inspection',
            start_date: dateOnly(-1),
            end_date: dateOnly(0),
            deleted_at: null,
          },
        ]),
      ])

      const [aircraft] = await service.findAll({})

      expect(aircraft.current_status).toBe('grounded')
    })

    it('falls back to in_service when no period covers today', async () => {
      db.aircraft.findMany.mockResolvedValue([
        aircraftRow([
          {
            id: 'p1',
            status: 'grounded',
            origin: 'manual',
            reason: null,
            start_date: dateOnly(-10),
            end_date: dateOnly(-1),
            deleted_at: null,
          },
        ]),
      ])

      const [aircraft] = await service.findAll({})

      expect(aircraft.current_status).toBe('in_service')
    })
  })

  describe('create', () => {
    const dto = {
      tail_number: 'HS-ABF',
      aircraft_type_id: 't1',
      base_airport_code: 'bkk',
      entry_into_service_date: '2026-01-01',
    }

    beforeEach(() => {
      db.aircraft_type.findFirst.mockResolvedValue({ id: 't1', code: 'A320', is_active: true })
      db.airport.findUnique.mockResolvedValue({ iata_code: 'BKK' })
      tx.aircraft.create.mockResolvedValue({ id: 'a1' })
      db.aircraft.findFirst.mockResolvedValue(aircraftRow([]))
    })

    it('registers the aircraft and opens an in_service period', async () => {
      await service.create(dto, 'staff-1')

      expect(tx.aircraft.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tail_number: 'HS-ABF', base_airport_code: 'BKK' }) }),
      )
      expect(tx.aircraft_status_period.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'in_service', created_by: 'staff-1' }) }),
      )
    })

    it('reports a duplicate tail number as a conflict', async () => {
      tx.aircraft.create.mockRejectedValue({ code: 'P2002' })

      await expect(service.create(dto, 'staff-1')).rejects.toBeInstanceOf(ConflictException)
    })

    it('refuses a retired aircraft type', async () => {
      db.aircraft_type.findFirst.mockResolvedValue({ id: 't1', code: 'A320', is_active: false })

      await expect(service.create(dto, 'staff-1')).rejects.toBeInstanceOf(ConflictException)
      expect(tx.aircraft.create).not.toHaveBeenCalled()
    })

    it('reports an unknown aircraft type', async () => {
      db.aircraft_type.findFirst.mockResolvedValue(null)

      await expect(service.create(dto, 'staff-1')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('removeStatus', () => {
    it('refuses a period that belongs to another aircraft', async () => {
      db.aircraft_status_period.findFirst.mockResolvedValue(null)

      await expect(service.removeStatus('a1', 'p9')).rejects.toBeInstanceOf(NotFoundException)
      expect(db.aircraft_status_period.update).not.toHaveBeenCalled()
    })

    it('refuses to delete a period that belongs to a maintenance window', async () => {
      db.aircraft_status_period.findFirst.mockResolvedValue({ id: 'p1', origin: 'maintenance' })

      await expect(service.removeStatus('a1', 'p1')).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('getAvailability', () => {
    it('reports the operating day as a failing check', async () => {
      db.aircraft.findFirst.mockResolvedValue({
        ...aircraftRow([]),
        aircraft_type: { id: 't1', code: 'A320', model: 'A320', max_range_km: 6100 },
        aircraft_operating_day: [{ day_of_week: 1 }],
      })

      const result = await service.getAvailability('a1', { dep_date: '2026-01-06' })

      expect(result.available).toBe(false)
      expect(result.failing.map((check) => check.check)).toContain('operating_day')
    })

    it('reports the range as a failing check', async () => {
      db.aircraft.findFirst.mockResolvedValue({
        ...aircraftRow([]),
        aircraft_type: { id: 't1', code: 'A320', model: 'A320', max_range_km: 6100 },
        aircraft_operating_day: [],
      })

      const result = await service.getAvailability('a1', { distance_km: 9000 })

      expect(result.available).toBe(false)
      expect(result.failing.map((check) => check.check)).toContain('range')
    })
  })

  describe('setOperatingDays', () => {
    it('stores the days without duplicates', async () => {
      db.aircraft.findFirst.mockResolvedValue({ id: 'a1' })

      const result = await service.setOperatingDays('a1', { days: [3, 1, 3] })

      expect(tx.aircraft_operating_day.createMany).toHaveBeenCalledWith({
        data: [
          { aircraft_id: 'a1', day_of_week: 1 },
          { aircraft_id: 'a1', day_of_week: 3 },
        ],
      })
      expect(result.days).toEqual([1, 3])
    })
  })

  describe('removeStatus', () => {
    const live = (overrides: Record<string, unknown>) => ({
      id: 'p0',
      aircraft_id: 'a1',
      status: 'grounded',
      origin: 'manual',
      start_date: new Date('2026-03-01'),
      end_date: new Date('2026-03-09'),
      ...overrides,
    })
    const deleted = live({ id: 'p1', status: 'in_service', start_date: new Date('2026-03-10'), end_date: null })

    beforeEach(() => {
      db.aircraft_status_period.findFirst.mockResolvedValue(deleted)
    })

    it('marks the period as changed so that the status feed reports the deletion', async () => {
      tx.aircraft_status_period.findMany.mockResolvedValue([])

      await service.removeStatus('a1', 'p1')

      expect(tx.aircraft_status_period.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { deleted_at: expect.any(Date), updated_at: expect.any(Date) },
      })
    })

    it('keeps an aircraft grounded when the period that ended its grounding is deleted', async () => {
      tx.aircraft_status_period.findMany.mockResolvedValue([live({})])

      await service.removeStatus('a1', 'p1')

      expect(tx.aircraft_status_period.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p0' }, data: expect.objectContaining({ end_date: null }) }),
      )
    })

    it('extends the predecessor only up to the next period', async () => {
      tx.aircraft_status_period.findMany.mockResolvedValue([
        live({}),
        live({
          id: 'p2',
          status: 'in_maintenance',
          origin: 'maintenance',
          start_date: new Date('2026-04-01'),
          end_date: new Date('2026-04-05'),
        }),
      ])

      await service.removeStatus('a1', 'p1')

      expect(tx.aircraft_status_period.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p0' }, data: expect.objectContaining({ end_date: new Date('2026-03-31') }) }),
      )
    })

    it.each([
      ['an in_service predecessor, because a gap already means in service', { status: 'in_service' }],
      ['a maintenance predecessor, which has a planned end of its own', { origin: 'maintenance', status: 'in_maintenance' }],
      ['a predecessor that does not end the day before', { end_date: new Date('2026-03-05') }],
    ])('leaves %s alone', async (_name, overrides) => {
      tx.aircraft_status_period.findMany.mockResolvedValue([live(overrides)])

      await service.removeStatus('a1', 'p1')

      expect(tx.aircraft_status_period.update).toHaveBeenCalledTimes(1)
    })
  })

  describe('getStatusChanges', () => {
    it('includes deleted periods, because a deletion changes the status', async () => {
      db.aircraft_status_period.findMany.mockResolvedValue([])

      await service.getStatusChanges({ since: '2026-01-01T00:00:00.000Z' })

      const where = db.aircraft_status_period.findMany.mock.calls[0][0].where
      expect(where).not.toHaveProperty('deleted_at')
    })
  })

  describe('getStatus', () => {
    it('reports an aircraft that does not exist as not found instead of in service', async () => {
      db.aircraft.findFirst.mockResolvedValue(null)

      await expect(service.getStatus('a1')).rejects.toBeInstanceOf(NotFoundException)
      expect(db.aircraft_status_period.findMany).not.toHaveBeenCalled()
    })

    it('reports the current status of an existing aircraft', async () => {
      db.aircraft.findFirst.mockResolvedValue({ id: 'a1' })
      db.aircraft_status_period.findMany.mockResolvedValue([
        { status: 'grounded', origin: 'manual', reason: 'AOG', start_date: new Date(dateOnly(-2)), end_date: null },
      ])

      const status = await service.getStatus('a1')

      expect(status.status).toBe('grounded')
    })
  })

  describe('createStatus', () => {
    const period = (overrides: Record<string, unknown>) => ({
      id: 'p1',
      aircraft_id: 'a1',
      status: 'in_service',
      origin: 'manual',
      reason: null,
      start_date: new Date('2026-01-01'),
      end_date: null,
      created_by: 'staff-1',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    })

    beforeEach(() => {
      db.aircraft.findFirst.mockResolvedValue({ id: 'a1' })
      tx.aircraft_status_period.create.mockResolvedValue({
        id: 'p9',
        aircraft_id: 'a1',
        status: 'grounded',
        origin: 'manual',
        reason: null,
        start_date: new Date('2026-03-10'),
        end_date: null,
        created_by: 'staff-1',
        created_at: new Date('2026-03-01T00:00:00.000Z'),
      })
    })

    it('answers with the created period as plain dates and records an audit entry', async () => {
      tx.aircraft_status_period.findMany.mockResolvedValue([])

      const created = await service.createStatus('a1', { status: 'grounded', start_date: '2026-03-10' }, 'staff-1')

      expect(created).toEqual(expect.objectContaining({ id: 'p9', start_date: '2026-03-10', end_date: null, created_by: 'staff-1' }))
      expect(auditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: 'status_period.created', entity_id: 'p9' }))
    })

    it('names the conflicting period in the details of the conflict', async () => {
      tx.aircraft_status_period.findMany.mockResolvedValue([
        period({
          id: 'p7',
          status: 'in_maintenance',
          origin: 'maintenance',
          end_date: new Date('2026-03-20'),
          start_date: new Date('2026-03-10'),
        }),
      ])

      await expect(service.createStatus('a1', { status: 'grounded', start_date: '2026-03-15' }, 'staff-1')).rejects.toMatchObject({
        response: {
          details: { conflicting_period: expect.objectContaining({ id: 'p7', start_date: '2026-03-10', end_date: '2026-03-20' }) },
        },
      })
    })

    it('closes an open period that started earlier the day before the new one', async () => {
      tx.aircraft_status_period.findMany.mockResolvedValue([period({})])

      await service.createStatus('a1', { status: 'grounded', start_date: '2026-03-10' }, 'staff-1')

      expect(tx.aircraft_status_period.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1' }, data: expect.objectContaining({ end_date: new Date('2026-03-09') }) }),
      )
      expect(tx.aircraft_status_period.create).toHaveBeenCalled()
    })

    it('replaces an open period that starts on the same day instead of ending it before it starts', async () => {
      tx.aircraft_status_period.findMany.mockResolvedValue([period({ start_date: new Date('2026-03-10') })])

      await service.createStatus('a1', { status: 'grounded', start_date: '2026-03-10' }, 'staff-1')

      expect(tx.aircraft_status_period.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1' }, data: expect.objectContaining({ deleted_at: expect.any(Date) }) }),
      )
      expect(tx.aircraft_status_period.create).toHaveBeenCalled()
    })

    it('reports a start date inside a maintenance window as a conflict', async () => {
      tx.aircraft_status_period.findMany.mockResolvedValue([
        period({ status: 'in_maintenance', start_date: new Date('2026-03-10'), end_date: new Date('2026-03-20') }),
      ])

      await expect(service.createStatus('a1', { status: 'grounded', start_date: '2026-03-15' }, 'staff-1')).rejects.toBeInstanceOf(
        ConflictException,
      )
      expect(tx.aircraft_status_period.create).not.toHaveBeenCalled()
    })

    it('reports an open-ended period that would run into a later period as a conflict', async () => {
      tx.aircraft_status_period.findMany.mockResolvedValue([period({ start_date: new Date('2026-06-01') })])

      await expect(service.createStatus('a1', { status: 'grounded', start_date: '2026-03-10' }, 'staff-1')).rejects.toBeInstanceOf(
        ConflictException,
      )
    })

    it('accepts a bounded period that ends before a later open-ended one starts', async () => {
      tx.aircraft_status_period.findMany.mockResolvedValue([period({ start_date: new Date('2026-06-01') })])

      await service.createStatus('a1', { status: 'grounded', start_date: '2026-03-10', end_date: '2026-03-20' }, 'staff-1')

      expect(tx.aircraft_status_period.create).toHaveBeenCalled()
    })
  })

  describe('createMaintenance', () => {
    it('reports a window that overlaps an existing maintenance window as a conflict', async () => {
      db.aircraft.findFirst.mockResolvedValue({ id: 'a1' })
      tx.aircraft_status_period.findMany.mockResolvedValue([
        {
          id: 'p1',
          aircraft_id: 'a1',
          reason: null,
          created_by: 'staff-1',
          created_at: new Date('2026-01-01T00:00:00.000Z'),
          status: 'in_maintenance',
          origin: 'maintenance',
          start_date: new Date('2026-03-10'),
          end_date: new Date('2026-03-20'),
        },
      ])

      await expect(
        service.createMaintenance(
          'a1',
          { maintenance_type: 'a_check', planned_start_date: '2026-03-12', planned_end_date: '2026-03-14' },
          'staff-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException)
      expect(tx.aircraft_maintenance.create).not.toHaveBeenCalled()
    })
  })

  describe('updateMaintenance', () => {
    const maintenanceRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'm1',
      aircraft_id: 'a1',
      status_period_id: 'p1',
      status: 'planned',
      planned_start_date: new Date('2026-03-10'),
      planned_end_date: new Date('2026-03-20'),
      actual_end_date: null,
      ...overrides,
    })

    it('requires an actual end date when a window is completed', async () => {
      db.aircraft_maintenance.findFirst.mockResolvedValue(maintenanceRow())

      await expect(service.updateMaintenance('a1', 'm1', { status: 'completed' })).rejects.toBeInstanceOf(BadRequestException)
    })

    it('refuses an end date before the stored start date', async () => {
      db.aircraft_maintenance.findFirst.mockResolvedValue(maintenanceRow())

      await expect(service.updateMaintenance('a1', 'm1', { planned_end_date: '2026-03-05' })).rejects.toBeInstanceOf(BadRequestException)
      expect(tx.aircraft_maintenance.update).not.toHaveBeenCalled()
    })

    it('refuses a start date after the stored end date', async () => {
      db.aircraft_maintenance.findFirst.mockResolvedValue(maintenanceRow())

      await expect(service.updateMaintenance('a1', 'm1', { planned_start_date: '2026-03-25' })).rejects.toBeInstanceOf(BadRequestException)
    })

    it('refuses an actual end date before the start date', async () => {
      db.aircraft_maintenance.findFirst.mockResolvedValue(maintenanceRow())

      await expect(service.updateMaintenance('a1', 'm1', { status: 'completed', actual_end_date: '2026-03-01' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('refuses to change a cancelled window', async () => {
      db.aircraft_maintenance.findFirst.mockResolvedValue(maintenanceRow({ status: 'cancelled' }))

      await expect(service.updateMaintenance('a1', 'm1', { planned_end_date: '2026-03-25' })).rejects.toBeInstanceOf(ConflictException)
    })

    it('reports new dates that run into another period as a conflict, without conflicting with its own period', async () => {
      db.aircraft_maintenance.findFirst.mockResolvedValue(maintenanceRow())
      tx.aircraft_status_period.findMany.mockResolvedValue([
        {
          id: 'p1',
          aircraft_id: 'a1',
          reason: null,
          created_by: 'staff-1',
          created_at: new Date('2026-01-01T00:00:00.000Z'),
          status: 'in_maintenance',
          origin: 'maintenance',
          start_date: new Date('2026-03-10'),
          end_date: new Date('2026-03-20'),
        },
        {
          id: 'p2',
          aircraft_id: 'a1',
          reason: null,
          created_by: 'staff-1',
          created_at: new Date('2026-01-01T00:00:00.000Z'),
          status: 'grounded',
          origin: 'manual',
          start_date: new Date('2026-03-22'),
          end_date: new Date('2026-03-30'),
        },
      ])

      await expect(service.updateMaintenance('a1', 'm1', { planned_end_date: '2026-03-25' })).rejects.toBeInstanceOf(ConflictException)
    })

    it('moves the window when the new dates are free', async () => {
      db.aircraft_maintenance.findFirst.mockResolvedValue(maintenanceRow())
      tx.aircraft_status_period.findMany.mockResolvedValue([
        { id: 'p1', status: 'in_maintenance', origin: 'maintenance', start_date: new Date('2026-03-10'), end_date: new Date('2026-03-20') },
      ])
      tx.aircraft_maintenance.update.mockResolvedValue(maintenanceRow({ planned_end_date: new Date('2026-03-25') }))

      await service.updateMaintenance('a1', 'm1', { planned_end_date: '2026-03-25' })

      expect(tx.aircraft_status_period.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1' }, data: expect.objectContaining({ end_date: new Date('2026-03-25') }) }),
      )
    })

    it('closes the status period of a cancelled window', async () => {
      db.aircraft_maintenance.findFirst.mockResolvedValue(maintenanceRow())
      tx.aircraft_maintenance.update.mockResolvedValue(maintenanceRow({ status: 'cancelled' }))

      await service.updateMaintenance('a1', 'm1', { status: 'cancelled' })

      expect(tx.aircraft_status_period.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1' }, data: expect.objectContaining({ deleted_at: expect.any(Date) }) }),
      )
    })
  })

  describe('status history', () => {
    it('lists the periods as plain dates, newest first, with who created them', async () => {
      db.aircraft.findFirst.mockResolvedValue({ id: 'a1' })
      db.aircraft_status_period.findMany.mockResolvedValue([
        {
          id: 'p1',
          aircraft_id: 'a1',
          status: 'grounded',
          origin: 'manual',
          reason: 'AOG',
          start_date: new Date('2026-03-10'),
          end_date: null,
          created_by: 'staff-1',
          created_at: new Date('2026-03-01T08:00:00.000Z'),
        },
      ])

      const [period] = await service.getStatusHistory('a1')

      expect(period).toEqual({
        id: 'p1',
        aircraft_id: 'a1',
        status: 'grounded',
        origin: 'manual',
        reason: 'AOG',
        start_date: '2026-03-10',
        end_date: null,
        created_by: 'staff-1',
        created_at: '2026-03-01T08:00:00.000Z',
      })
    })
  })

  describe('maintenance windows', () => {
    const window = (overrides: Record<string, unknown>) => ({
      id: 'm1',
      aircraft_id: 'a1',
      maintenance_type: 'a_check',
      planned_start_date: new Date('2026-03-10'),
      planned_end_date: new Date('2026-03-20'),
      actual_end_date: null,
      status: 'planned',
      status_period_id: 'p1',
      ...overrides,
    })

    it('reports a planned window as in progress from its planned start date, without any staff action', async () => {
      db.aircraft.findFirst.mockResolvedValue({ id: 'a1' })
      db.aircraft_maintenance.findMany.mockResolvedValue([
        window({ id: 'past', planned_start_date: dateOnly(-2), planned_end_date: dateOnly(3) }),
        window({ id: 'future', planned_start_date: dateOnly(5), planned_end_date: dateOnly(9) }),
        window({
          id: 'done',
          planned_start_date: dateOnly(-9),
          planned_end_date: dateOnly(-5),
          status: 'completed',
          actual_end_date: dateOnly(-5),
        }),
      ])

      const windows = await service.getMaintenanceList('a1')

      expect(windows.map((item) => [item.id, item.status])).toEqual([
        ['past', 'in_progress'],
        ['future', 'planned'],
        ['done', 'completed'],
      ])
    })
  })

  describe('update the type of an aircraft', () => {
    beforeEach(() => {
      db.aircraft.findFirst.mockResolvedValue(aircraftRow([]))
      db.aircraft.update.mockResolvedValue({})
    })

    it('changes the type while no flight uses the aircraft', async () => {
      db.aircraft_type.findFirst.mockResolvedValue({ id: 't2', code: 'A321', is_active: true })
      db.flight.count.mockResolvedValue(0)

      await service.update('a1', { aircraft_type_id: 't2' })

      expect(db.aircraft.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ aircraft_type_id: 't2' }) }),
      )
    })

    it('refuses the change once a flight uses the aircraft', async () => {
      db.aircraft_type.findFirst.mockResolvedValue({ id: 't2', code: 'A321', is_active: true })
      db.flight.count.mockResolvedValue(3)

      await expect(service.update('a1', { aircraft_type_id: 't2' })).rejects.toBeInstanceOf(ConflictException)
      expect(db.aircraft.update).not.toHaveBeenCalled()
    })

    it('refuses a retired type and an unknown type', async () => {
      db.aircraft_type.findFirst.mockResolvedValueOnce({ id: 't2', code: 'A321', is_active: false })
      await expect(service.update('a1', { aircraft_type_id: 't2' })).rejects.toBeInstanceOf(ConflictException)

      db.aircraft_type.findFirst.mockResolvedValueOnce(null)
      await expect(service.update('a1', { aircraft_type_id: 't9' })).rejects.toBeInstanceOf(NotFoundException)
    })

    it('does not look at the flights when the type stays the same', async () => {
      await service.update('a1', { aircraft_type_id: 't1' })

      expect(db.flight.count).not.toHaveBeenCalled()
    })
  })

  describe('seat map', () => {
    it('expands the layout of a type once and reuses the grid for every aircraft of it', async () => {
      db.aircraft.findFirst.mockResolvedValue({
        id: 'a1',
        aircraft_type_id: 't1',
        aircraft_type: { layout: { cabins: [{ cabin_class: 'economy', first_row: 1, last_row: 2, columns: ['A', 'B'] }] } },
      })

      const first = await service.getSeatMap('a1')
      const second = await service.getSeatMap('a1')

      expect(first.seats).toHaveLength(4)
      expect(second.seats).toBe(first.seats)
    })
  })
})
