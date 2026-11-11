jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

import { BaggageSettingsController } from './baggage-settings.controller'
import type { BaggageSettingsService } from './baggage-settings.service'
import { BaggageAdminGuard } from './guards/baggage-admin.guard'
import { BaggageStaffGuard, type BaggageStaff } from './guards/baggage-staff.guard'

describe('BaggageSettingsController', () => {
  const settings = { lostAfterDays: 21, unclaimedAfterDays: 90, updatedAt: new Date('2026-11-12T00:00:00Z'), updatedBy: null }
  const staff: BaggageStaff = {
    id: 'user-1',
    email: 'admin@flython.example',
    staffId: '00000000-0000-4000-8000-0000000000ad',
    roleCode: 'admin',
  }

  it('runs BaggageStaffGuard and then BaggageAdminGuard on every route', () => {
    expect(Reflect.getMetadata('__guards__', BaggageSettingsController)).toEqual([BaggageStaffGuard, BaggageAdminGuard])
  })

  it('GET returns the stored settings', async () => {
    const service = { get: jest.fn().mockResolvedValue(settings) }
    const controller = new BaggageSettingsController(service as unknown as BaggageSettingsService)

    await expect(controller.get()).resolves.toBe(settings)
  })

  it('PUT passes both values with staff identity and audit actor taken from the guard', async () => {
    const service = { update: jest.fn().mockResolvedValue({ ...settings, lostAfterDays: 30 }) }
    const controller = new BaggageSettingsController(service as unknown as BaggageSettingsService)

    await controller.update(staff, { lostAfterDays: 30, unclaimedAfterDays: 90 })

    expect(service.update).toHaveBeenCalledWith({
      lostAfterDays: 30,
      unclaimedAfterDays: 90,
      staffId: staff.staffId,
      actor: { type: 'staff', id: 'user-1', role: 'admin' },
    })
  })
})
