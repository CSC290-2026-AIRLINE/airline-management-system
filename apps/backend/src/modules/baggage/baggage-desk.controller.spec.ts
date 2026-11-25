import type { DbService } from '@backend/db/db.service'
import { BaggageDeskController } from './baggage-desk.controller'
import type { BaggageStaff } from './guards/baggage-staff.guard'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('./guards/baggage-staff.guard', () => ({
  BaggageStaffGuard: class {},
  CurrentBaggageStaff: () => () => undefined,
}))

const NOW = new Date('2026-10-21T09:30:00Z')
const STAFF = { staffId: 'staff-1', roleCode: 'baggage' } as BaggageStaff

function makeController(role: { name: string } | null) {
  const db = { role: { findUnique: jest.fn().mockResolvedValue(role) } }
  return { controller: new BaggageDeskController(db as unknown as DbService, { now: () => NOW }), db }
}

describe('BaggageDeskController', () => {
  it('answers the simulation time and the role name', async () => {
    const { controller, db } = makeController({ name: 'Baggage staff' })

    await expect(controller.get(STAFF)).resolves.toEqual({ now: NOW, roleCode: 'baggage', roleName: 'Baggage staff' })
    expect(db.role.findUnique).toHaveBeenCalledWith({ where: { code: 'baggage' }, select: { name: true } })
  })

  it('falls back to the role code when the role row is gone', async () => {
    const { controller } = makeController(null)

    await expect(controller.get(STAFF)).resolves.toMatchObject({ roleName: 'baggage' })
  })
})
