import { ForbiddenException } from '@nestjs/common'
import { BiDashboardsController } from './bi-dashboards.controller'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/modules/admin-console/admin-console.service', () => ({ AdminConsoleService: class {} }))
jest.mock('@backend/modules/aircraft-management/aircraft.service', () => ({ AircraftService: class {} }))
jest.mock('./bi-etl.service', () => ({ BiEtlService: class {} }))
jest.mock('./bi-query.service', () => ({ BiQueryService: class {} }))
jest.mock('./bi-panels.service', () => ({ BiPanelsService: class {} }))

const body = { maintenance_type: 'c_check' as const, planned_start_date: '2026-12-01', planned_end_date: '2026-12-05' }

function setup(staffId: string | null, isAdmin = true) {
  const etl = {
    staffIdForUser: jest.fn().mockResolvedValue(staffId),
    isAdminStaff: jest.fn().mockResolvedValue(isAdmin),
    refreshWhenFree: jest.fn().mockResolvedValue({ id: 'run-1' }),
    simulationNow: () => '2026-11-25T00:00:00Z',
  }
  const aircraft = { createMaintenance: jest.fn().mockResolvedValue({ id: 'maintenance-1' }) }
  const controller = new BiDashboardsController(etl as never, {} as never, {} as never, {} as never, aircraft as never)
  return { controller, etl, aircraft }
}

describe('BiDashboardsController.markMaintenance', () => {
  it('creates the period through Feature 9, then refreshes the copy as the same staff member', async () => {
    const { controller, etl, aircraft } = setup('staff-1')
    const result = await controller.markMaintenance('aircraft-1', body, { id: 'user-1', email: 'staff@example.test' })
    expect(aircraft.createMaintenance).toHaveBeenCalledWith('aircraft-1', body, 'staff-1')
    expect(etl.refreshWhenFree).toHaveBeenCalledWith('manual', 'staff-1')
    expect(result).toEqual({ id: 'maintenance-1' })
  })

  it('refuses a staff member whose role is not an admin role, and writes nothing', async () => {
    const { controller, etl, aircraft } = setup('staff-2', false)
    await expect(controller.markMaintenance('aircraft-1', body, { id: 'user-3', email: 'staff2@example.test' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(aircraft.createMaintenance).not.toHaveBeenCalled()
    expect(etl.refreshWhenFree).not.toHaveBeenCalled()
  })

  it('refuses a user who is not staff, and writes nothing', async () => {
    const { controller, etl, aircraft } = setup(null)
    await expect(controller.markMaintenance('aircraft-1', body, { id: 'user-2', email: 'customer@example.test' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(aircraft.createMaintenance).not.toHaveBeenCalled()
    expect(etl.refreshWhenFree).not.toHaveBeenCalled()
  })
})
