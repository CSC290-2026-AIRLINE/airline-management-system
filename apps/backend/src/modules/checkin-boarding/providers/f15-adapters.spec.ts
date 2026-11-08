import type { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { F15Audit, F15Clock, mapAction } from './f15-adapters'

// The audit service pulls the database in, and the generated Prisma client is ESM only.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('mapAction', () => {
  it('maps F6 actions onto the F15 union', () => {
    expect(mapAction('check_in.start')).toBe('create')
    expect(mapAction('boarding.board')).toBe('status_change')
    expect(mapAction('gate.close')).toBe('update')
    expect(mapAction('view_sensitive')).toBe('view_sensitive')
  })

  it('an unknown action is an update', () => {
    expect(mapAction('check_in.seat_confirm')).toBe('update')
  })
})

describe('F15Clock', () => {
  it('follows the simulation clock of feature 15', () => {
    const simulation = new SimulationClock()
    const clock = new F15Clock(simulation)
    const before = clock.now().getTime()
    expect(before).toBeGreaterThan(0)
    simulation.shift(60_000)
    expect(clock.now().getTime()).toBeGreaterThan(before)
  })
})

describe('F15Audit', () => {
  it('writes the F6 action into the summary and the F15 action into the row', async () => {
    const tryWrite = jest.fn().mockResolvedValue(true)
    const audit = new F15Audit({ tryWrite } as unknown as AuditService)
    await audit.record({
      actorType: 'staff',
      actorId: 'u-1',
      action: 'gate.close',
      entityType: 'flight',
      entityId: 'flt-1',
      summary: 'gate closed',
    })
    expect(tryWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { type: 'staff', id: 'u-1', role: null },
        sourceFeature: '6',
        action: 'update',
        entityType: 'flight',
        entityId: 'flt-1',
        summary: '[gate.close] gate closed',
      }),
    )
  })
})
