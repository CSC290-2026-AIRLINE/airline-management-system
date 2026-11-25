// CabinSettingsService test: the batched order-window lookup the catering list uses gives each flight the same
// shortest window as the single-flight rules (the most specific level wins, the shortest cabin decides).

import type { DbService } from '../../../db/db.service'
import { CabinSettingsService } from './cabin-settings.service'

jest.mock('../../../db/db.service', () => ({ DbService: class {} }))

const row = (over: Record<string, unknown>) => ({
  scope: 'network',
  route_id: null,
  flight_id: null,
  cabin: 'economy',
  meal_service: 'paid',
  meal_selection: 'choose',
  included_per_passenger: 0,
  preorder_enabled: true,
  order_window_hours: 48,
  premium_meals_allowed: true,
  snacks_enabled: true,
  duty_free_enabled: true,
  onboard_buffer_percent: 10,
  ...over,
})

const ROWS = [
  row({ cabin: 'economy' }),
  row({ cabin: 'premium_economy' }),
  row({ cabin: 'business', meal_service: 'complimentary', included_per_passenger: 1 }),
  // Route R2 shortens economy to 36 h; flight F3 shortens business to 24 h.
  row({ scope: 'route', route_id: 'R2', cabin: 'economy', order_window_hours: 36 }),
  row({ scope: 'flight', flight_id: 'F3', cabin: 'business', order_window_hours: 24 }),
]

describe('CabinSettingsService.orderWindowHoursForFlights', () => {
  it('resolves each flight from one query, with the most specific level winning', async () => {
    const db = { cabin_setting: { findMany: jest.fn().mockResolvedValue(ROWS) } }
    const service = new CabinSettingsService(db as unknown as DbService)

    const windows = await service.orderWindowHoursForFlights([
      { id: 'F1', route_id: 'R1' },
      { id: 'F2', route_id: 'R2' },
      { id: 'F3', route_id: 'R1' },
    ])

    expect(db.cabin_setting.findMany).toHaveBeenCalledTimes(1)
    expect(windows.get('F1')).toBe(48)
    expect(windows.get('F2')).toBe(36)
    expect(windows.get('F3')).toBe(24)
  })

  it('makes no query for an empty list', async () => {
    const db = { cabin_setting: { findMany: jest.fn() } }
    const service = new CabinSettingsService(db as unknown as DbService)

    expect((await service.orderWindowHoursForFlights([])).size).toBe(0)
    expect(db.cabin_setting.findMany).not.toHaveBeenCalled()
  })
})
