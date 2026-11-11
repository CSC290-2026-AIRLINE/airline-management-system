import { DbAircraftDirectory, PendingAircraftDirectory } from './aircraft-directory'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const AIRCRAFT = '00000000-0000-0000-0000-0000000000a1'
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const FROM = new Date('2026-11-02T09:00:00Z')
const TO = new Date('2026-11-02T11:00:00Z')

describe('DbAircraftDirectory', () => {
  const db = { aircraft: { findFirst: jest.fn(), findMany: jest.fn() }, aircraft_status_period: { findFirst: jest.fn() } }
  const directory = new DbAircraftDirectory(db as never)
  const row = (over: object = {}) => ({
    tail_number: 'ZZ-AAA',
    entry_into_service_date: day('2020-01-01'),
    retired_on: null,
    aircraft_type: { is_active: true, max_range_km: 3000, min_turnaround_minutes: 50 },
    ...over,
  })

  beforeEach(() => {
    jest.clearAllMocks()
    db.aircraft.findFirst.mockResolvedValue(row())
    db.aircraft_status_period.findFirst.mockResolvedValue(null)
  })

  it('is connected, so the gates can pass', () => {
    expect(directory.connected).toBe(true)
  })

  describe('availability', () => {
    it('is available when nothing blocks the window', async () => {
      await expect(directory.availability(AIRCRAFT, FROM, TO)).resolves.toEqual({ kind: 'available' })
    })

    // 2026-11-02 is a Monday.
    it('is available on a listed operating day', async () => {
      db.aircraft.findFirst.mockResolvedValue(row({ aircraft_operating_day: [{ day_of_week: 1 }, { day_of_week: 2 }] }))
      await expect(directory.availability(AIRCRAFT, FROM, TO)).resolves.toEqual({ kind: 'available' })
    })

    it('is unavailable on a weekday the aircraft does not operate', async () => {
      db.aircraft.findFirst.mockResolvedValue(row({ aircraft_operating_day: [{ day_of_week: 2 }] }))
      await expect(directory.availability(AIRCRAFT, FROM, TO)).resolves.toEqual({
        kind: 'unavailable',
        rule: 'not_operating_day',
        detail: 'ZZ-AAA does not operate on Monday (2026-11-02)',
      })
      expect(db.aircraft_status_period.findFirst).not.toHaveBeenCalled()
    })

    it('checks every UTC day a window crosses', async () => {
      db.aircraft.findFirst.mockResolvedValue(row({ aircraft_operating_day: [{ day_of_week: 1 }] }))
      const overnight = await directory.availability(AIRCRAFT, new Date('2026-11-02T22:00:00Z'), new Date('2026-11-03T01:00:00Z'))
      expect(overnight).toMatchObject({ kind: 'unavailable', rule: 'not_operating_day' })
    })

    it('looks for a non in_service period that overlaps the UTC days of the window', async () => {
      await directory.availability(AIRCRAFT, FROM, TO)
      expect(db.aircraft_status_period.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            aircraft_id: AIRCRAFT,
            deleted_at: null,
            status: { not: 'in_service' },
            start_date: { lte: day('2026-11-02') },
            OR: [{ end_date: null }, { end_date: { gte: day('2026-11-02') } }],
          },
        }),
      )
    })

    it('reports a grounded or in-maintenance period with its own rule and reason', async () => {
      db.aircraft_status_period.findFirst.mockResolvedValue({
        status: 'in_maintenance',
        reason: 'c_check',
        start_date: day('2026-11-01'),
        end_date: day('2026-11-05'),
      })
      await expect(directory.availability(AIRCRAFT, FROM, TO)).resolves.toEqual({
        kind: 'unavailable',
        rule: 'in_maintenance',
        detail: 'ZZ-AAA is in maintenance from 2026-11-01 to 2026-11-05: c_check',
      })
    })

    it('says "further notice" for an open-ended period', async () => {
      db.aircraft_status_period.findFirst.mockResolvedValue({
        status: 'grounded',
        reason: null,
        start_date: day('2026-11-02'),
        end_date: null,
      })
      await expect(directory.availability(AIRCRAFT, FROM, TO)).resolves.toMatchObject({
        rule: 'grounded',
        detail: 'ZZ-AAA is grounded from 2026-11-02 to further notice',
      })
    })

    it('is unavailable for an unknown or deleted aircraft', async () => {
      db.aircraft.findFirst.mockResolvedValue(null)
      await expect(directory.availability(AIRCRAFT, FROM, TO)).resolves.toMatchObject({ kind: 'unavailable', rule: 'aircraft_not_found' })
    })

    it('is unavailable before entry into service', async () => {
      db.aircraft.findFirst.mockResolvedValue(row({ entry_into_service_date: day('2026-11-03') }))
      await expect(directory.availability(AIRCRAFT, FROM, TO)).resolves.toMatchObject({ kind: 'unavailable', rule: 'not_in_service' })
    })

    it('treats retired_on as the last day in the fleet', async () => {
      db.aircraft.findFirst.mockResolvedValue(row({ retired_on: day('2026-11-02') }))
      await expect(directory.availability(AIRCRAFT, FROM, TO)).resolves.toEqual({ kind: 'available' })

      db.aircraft.findFirst.mockResolvedValue(row({ retired_on: day('2026-11-01') }))
      await expect(directory.availability(AIRCRAFT, FROM, TO)).resolves.toMatchObject({ kind: 'unavailable', rule: 'retired' })
    })

    it('is unavailable when the aircraft type is not active', async () => {
      db.aircraft.findFirst.mockResolvedValue(row({ aircraft_type: { is_active: false } }))
      await expect(directory.availability(AIRCRAFT, FROM, TO)).resolves.toMatchObject({ kind: 'unavailable', rule: 'type_inactive' })
      expect(db.aircraft_status_period.findFirst).not.toHaveBeenCalled()
    })
  })

  describe('typeFacts', () => {
    it('returns the type’s range and minimum turnaround', async () => {
      await expect(directory.typeFacts(AIRCRAFT)).resolves.toEqual({ maxRangeKm: 3000, minTurnaroundMinutes: 50 })
    })

    it('returns null for an unknown aircraft', async () => {
      db.aircraft.findFirst.mockResolvedValue(null)
      await expect(directory.typeFacts(AIRCRAFT)).resolves.toBeNull()
    })
  })

  describe('list', () => {
    it('lists the fleet by tail number, leaving out deleted and retired aircraft and inactive types', async () => {
      db.aircraft.findMany.mockResolvedValue([
        { id: 'a1', tail_number: 'ZZ-AAA', aircraft_type: { code: 'Z320', model: 'Zed 320', max_range_km: 3000 } },
      ])

      await expect(directory.list()).resolves.toEqual([
        { id: 'a1', tailNumber: 'ZZ-AAA', typeCode: 'Z320', model: 'Zed 320', maxRangeKm: 3000 },
      ])
      expect(db.aircraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deleted_at: null,
            OR: [{ retired_on: null }, { retired_on: { gte: expect.any(Date) } }],
            aircraft_type: { is_active: true, deleted_at: null },
          },
          orderBy: { tail_number: 'asc' },
        }),
      )
    })

    it('is empty while Feature 9 is not connected', async () => {
      await expect(new PendingAircraftDirectory().list()).resolves.toEqual([])
    })
  })
})
