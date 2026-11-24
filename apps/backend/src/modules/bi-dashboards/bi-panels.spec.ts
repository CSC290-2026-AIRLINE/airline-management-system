import { daysBetween, extraRevenuePeriods, flyableDays, noShowRate, rate } from './bi-panels'

describe('BI panels helpers', () => {
  describe('rate', () => {
    it('divides by a positive base', () => {
      expect(rate(3, 12)).toBe(0.25)
    })

    it('returns null on a zero base instead of dividing by zero', () => {
      expect(rate(0, 0)).toBeNull()
    })
  })

  describe('daysBetween', () => {
    it('lists both ends inclusive, across a month boundary', () => {
      expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    })

    it('is empty when the range is inverted', () => {
      expect(daysBetween('2026-11-02', '2026-11-01')).toEqual([])
    })
  })

  describe('flyableDays', () => {
    const inService = { in_service_from: '2026-10-01', retired_on: null }

    it('counts every in-service day when there is no downtime', () => {
      expect(flyableDays('2026-10-01', '2026-10-31', inService, [])).toEqual({ available: 31, out_of_service: 0 })
    })

    it('takes grounded and maintenance days out of the flyable count, inclusive of both ends', () => {
      const downtime = [{ start_date: '2026-10-10', end_date: '2026-10-12' }]
      expect(flyableDays('2026-10-01', '2026-10-31', inService, downtime)).toEqual({ available: 28, out_of_service: 3 })
    })

    it('does not count days before entry into service or after retirement', () => {
      const aircraft = { in_service_from: '2026-10-05', retired_on: '2026-10-08' }
      expect(flyableDays('2026-10-01', '2026-10-10', aircraft, [])).toEqual({ available: 3, out_of_service: 0 })
    })

    it('clips downtime to the range and ignores downtime that is not in service anyway', () => {
      const aircraft = { in_service_from: '2026-10-05', retired_on: null }
      const downtime = [{ start_date: '2026-09-01', end_date: '2026-10-06' }]
      expect(flyableDays('2026-10-01', '2026-10-07', aircraft, downtime)).toEqual({ available: 1, out_of_service: 2 })
    })
  })

  describe('extraRevenuePeriods', () => {
    it('sums by type per week, takes refunds off to net, and divides by boarded passengers', () => {
      const lines = [
        { revenue_date: '2026-10-05', line_type: 'baggage', amount: 1000, refund_amount: 100 },
        { revenue_date: '2026-10-07', line_type: 'upgrade', amount: 500, refund_amount: 0 },
        { revenue_date: '2026-10-12', line_type: 'baggage', amount: 300, refund_amount: 0 },
      ]
      const passengers = [
        { flight_date: '2026-10-05', boarded: 60 },
        { flight_date: '2026-10-07', boarded: 40 },
        { flight_date: '2026-10-12', boarded: 50 },
      ]
      const periods = extraRevenuePeriods(lines, passengers, 'week')
      expect(periods).toHaveLength(2)
      expect(periods[0]).toEqual({
        period: '2026-10-05',
        by_type: { baggage: 1000, upgrade: 500 },
        refunds_by_type: { baggage: 100, upgrade: 0 },
        gross: 1500,
        refunds: 100,
        net: 1400,
        passengers: 100,
        per_passenger: 14,
      })
      expect(periods[1].period).toBe('2026-10-12')
      expect(periods[1].per_passenger).toBe(6)
    })

    it('keeps a period that has passengers but no extra revenue, with a zero net', () => {
      const periods = extraRevenuePeriods([], [{ flight_date: '2026-10-05', boarded: 80 }], 'week')
      expect(periods).toEqual([
        { period: '2026-10-05', by_type: {}, refunds_by_type: {}, gross: 0, refunds: 0, net: 0, passengers: 80, per_passenger: 0 },
      ])
    })

    it('gives a null per-passenger figure when no passengers flew in the period', () => {
      const periods = extraRevenuePeriods(
        [{ revenue_date: '2026-10-05', line_type: 'insurance', amount: 200, refund_amount: 0 }],
        [],
        'week',
      )
      expect(periods[0].per_passenger).toBeNull()
    })
  })

  describe('noShowRate', () => {
    it('is no-shows over booked passengers', () => {
      expect(noShowRate({ booked: 200, boarded: 180, denied: 2, no_show: 18 })).toBe(0.09)
    })

    it('is null when nothing was booked', () => {
      expect(noShowRate({ booked: 0, boarded: 0, denied: 0, no_show: 0 })).toBeNull()
    })
  })
})
