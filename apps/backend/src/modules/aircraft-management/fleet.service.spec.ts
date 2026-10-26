import type { DbService } from '@backend/db/db.service'
import { AuditService } from './audit.service'
import { FleetService } from './fleet.service'

// ESM-only dependencies that Jest cannot load here; the service under test never calls into them.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

function dateOnly(offsetDays: number): string {
  const today = new Date()
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offsetDays)).toISOString().slice(0, 10)
}

describe('FleetService', () => {
  let db: {
    fleet_setting: { findMany: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock }
    aircraft: { findMany: jest.Mock }
  }
  let service: FleetService

  const aircraft = (overrides: Record<string, unknown> = {}) => ({
    id: 'a1',
    entry_into_service_date: new Date('2020-01-01'),
    retired_on: null,
    aircraft_status_period: [],
    aircraft_operating_day: [],
    ...overrides,
  })

  beforeEach(() => {
    db = {
      fleet_setting: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
      aircraft: { findMany: jest.fn() },
    }
    service = new FleetService(db as unknown as DbService, new AuditService())
  })

  it('uses the stored reserve ratio', async () => {
    db.fleet_setting.findUnique.mockResolvedValue({ key: 'reserve_ratio', value: '1.10' })
    db.aircraft.findMany.mockResolvedValue([aircraft()])

    const reserve = await service.getReserve(dateOnly(0), 10)

    expect(reserve.reserve_ratio).toBe(1.1)
    expect(reserve.target).toBe(11)
    expect(reserve.ready).toBe(1)
    expect(reserve.shortfall).toBe(10)
  })

  it('falls back to the default ratio when the setting is missing', async () => {
    db.fleet_setting.findUnique.mockResolvedValue(null)
    db.aircraft.findMany.mockResolvedValue([])

    const reserve = await service.getReserve(dateOnly(0), 10)

    expect(reserve.reserve_ratio).toBe(1.1)
    expect(reserve.ready).toBe(0)
  })

  it('does not count an aircraft that is blocked by a status period', async () => {
    db.fleet_setting.findUnique.mockResolvedValue({ key: 'reserve_ratio', value: '1.10' })
    db.aircraft.findMany.mockResolvedValue([
      aircraft({
        aircraft_status_period: [
          {
            id: 'p1',
            status: 'in_maintenance',
            origin: 'maintenance',
            reason: null,
            start_date: new Date(dateOnly(-1)),
            end_date: new Date(dateOnly(1)),
            deleted_at: null,
          },
        ],
      }),
    ])

    const reserve = await service.getReserve(dateOnly(0), 1)

    expect(reserve.ready).toBe(0)
  })

  it('does not count an aircraft that may not fly on that weekday', async () => {
    db.fleet_setting.findUnique.mockResolvedValue({ key: 'reserve_ratio', value: '1.00' })
    // 2026-01-06 is a Tuesday, so an aircraft restricted to Monday is not ready.
    db.aircraft.findMany.mockResolvedValue([aircraft({ aircraft_operating_day: [{ day_of_week: 1 }] })])

    const reserve = await service.getReserve('2026-01-06', 1)

    expect(reserve.ready).toBe(0)
  })

  it('stores the reserve ratio with the staff member who changed it', async () => {
    db.fleet_setting.upsert.mockResolvedValue({
      key: 'reserve_ratio',
      value: '1.25',
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_by: 'staff-1',
    })

    const setting = await service.updateReserveRatio(1.25, 'staff-1')

    expect(db.fleet_setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ value: '1.25', updated_by: 'staff-1' }) }),
    )
    expect(setting.value).toBe('1.25')
  })
})
