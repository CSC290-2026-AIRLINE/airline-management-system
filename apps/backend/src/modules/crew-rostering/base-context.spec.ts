import { NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { loadBaseContext } from './base-context'

// The loader only needs `DbService` for its type; the real module is ESM.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

function db(overrides: Record<string, unknown[]> = {}) {
  return {
    crew_setting: {
      findMany: jest.fn().mockResolvedValue(
        overrides.settings ?? [
          { key: 'min_rest_hours', value: '12' },
          { key: 'max_duty_hours', value: 'abc' },
        ],
      ),
    },
    country_legality_rule: {
      findMany: jest.fn().mockResolvedValue([{ country_code: 'jp', min_rest_hours: '12.0', max_duty_hours: '11.5' }]),
    },
    airport: { findMany: jest.fn().mockResolvedValue([{ iata_code: 'BKK', country: 'TH', timezone: 'Asia/Bangkok' }]) },
  }
}

describe('loadBaseContext', () => {
  it('reads settings with a fallback for anything missing or not a number', async () => {
    const context = await loadBaseContext(db() as unknown as DbService, 'BKK')

    expect(context.read('min_rest_hours', 10)).toBe(12)
    expect(context.read('max_duty_hours', 13)).toBe(13)
    expect(context.read('report_minutes', 60)).toBe(60)
  })

  it('returns the country rules as numbers and the airports with lower-case country codes', async () => {
    const context = await loadBaseContext(db() as unknown as DbService, 'BKK')

    expect(context.countryRules.get('jp')).toEqual({ minRestHours: 12, maxDutyHours: 11.5 })
    expect(context.airportCountry.get('BKK')).toBe('th')
    expect(context.timeZone).toBe('Asia/Bangkok')
  })

  it('reads each table once', async () => {
    const mock = db()
    await loadBaseContext(mock as unknown as DbService, 'BKK')

    expect(mock.crew_setting.findMany).toHaveBeenCalledTimes(1)
    expect(mock.country_legality_rule.findMany).toHaveBeenCalledTimes(1)
    expect(mock.airport.findMany).toHaveBeenCalledTimes(1)
  })

  it('refuses a base that is not an airport', async () => {
    await expect(loadBaseContext(db() as unknown as DbService, 'ZZZ')).rejects.toThrow(NotFoundException)
  })
})
