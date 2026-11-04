import { BadGatewayException, NotFoundException } from '@nestjs/common'
import { FlightInsightService } from './flight-insight.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const FLIGHT = '00000000-0000-0000-0000-0000000000f1'
const day = new Date('2026-11-02T00:00:00Z')

describe('FlightInsightService', () => {
  const db = { flight: { findUnique: jest.fn() }, airport_fee: { findMany: jest.fn() } }
  const service = new FlightInsightService(db as never)

  const flight = (over: object = {}) => ({
    id: FLIGHT,
    flight_number: 'ZZ101',
    service_date: day,
    actual_destination: null,
    route: { origin: 'ZZB', destination: 'ZZC', block_time_min: 90 },
    aircraft: { aircraft_type: { operating_cost_per_hour: '1000.00', cost_currency: 'THB', max_takeoff_weight_kg: 70000 } },
    ...over,
  })
  const fee = (over: object = {}) => ({
    airport: 'ZZB',
    fee_type: 'landing',
    applies_on: 'departure',
    amount: '500.00',
    unit: 'per_flight',
    currency: 'THB',
    ...over,
  })

  beforeEach(() => {
    jest.resetAllMocks()
    db.flight.findUnique.mockResolvedValue(flight())
    db.airport_fee.findMany.mockResolvedValue([])
  })

  describe('costEstimate', () => {
    it('prices the block time at the aircraft type’s hourly cost, and says revenue is not connected', async () => {
      const result = await service.costEstimate(FLIGHT)

      expect(result).toMatchObject({
        flight_id: FLIGHT,
        block_hours: 1.5,
        lines: [{ item: 'Operating cost', amount: 1500, currency: 'THB' }],
        total: { amount: 1500, currency: 'THB' },
      })
      expect(result.pending).toEqual([expect.stringContaining('seats sold (Feature 3b)')])
    })

    it('looks for departure fees at the origin and arrival fees at the destination in force on the service date', async () => {
      await service.costEstimate(FLIGHT)
      expect(db.airport_fee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            effective_from: { lte: day },
            OR: [{ effective_to: null }, { effective_to: { gte: day } }],
            AND: [
              {
                OR: [
                  { airport: 'ZZB', applies_on: 'departure' },
                  { airport: 'ZZC', applies_on: 'arrival' },
                ],
              },
            ],
          },
        }),
      )
    })

    it('uses the diverted destination for arrival fees', async () => {
      db.flight.findUnique.mockResolvedValue(flight({ actual_destination: 'ZZD' }))
      await service.costEstimate(FLIGHT)
      expect(db.airport_fee.findMany.mock.calls[0][0].where.AND[0].OR[1]).toEqual({ airport: 'ZZD', applies_on: 'arrival' })
    })

    it('adds per-flight fees and per-tonne fees (at the maximum take-off weight), and totals them', async () => {
      db.airport_fee.findMany.mockResolvedValue([
        fee(),
        fee({ airport: 'ZZC', applies_on: 'arrival', fee_type: 'navigation', unit: 'per_tonne', amount: '2.50' }),
      ])

      const result = await service.costEstimate(FLIGHT)

      expect(result.lines.map((l) => [l.item, l.amount])).toEqual([
        ['Operating cost', 1500],
        ['ZZB landing fee, departure', 500],
        ['ZZC navigation fee, arrival', 175],
      ])
      expect(result.total).toEqual({ amount: 2175, currency: 'THB' })
    })

    it('does not guess a per-hour fee: it lists it as pending', async () => {
      db.airport_fee.findMany.mockResolvedValue([fee({ fee_type: 'parking', unit: 'per_hour' })])
      const result = await service.costEstimate(FLIGHT)
      expect(result.lines).toHaveLength(1)
      expect(result.pending).toEqual(expect.arrayContaining([expect.stringContaining('ZZB parking fee, departure: charged per hour')]))
    })

    it('leaves out the total when the lines are in different currencies', async () => {
      db.airport_fee.findMany.mockResolvedValue([fee({ currency: 'USD' })])
      expect((await service.costEstimate(FLIGHT)).total).toBeNull()
    })

    it('returns 404 for an unknown or malformed flight id', async () => {
      await expect(service.costEstimate('nope')).rejects.toThrow(NotFoundException)
      db.flight.findUnique.mockResolvedValue(null)
      await expect(service.costEstimate(FLIGHT)).rejects.toThrow(NotFoundException)
    })
  })

  describe('impact', () => {
    it('answers 502 and says which counts are missing, for a flight that exists', async () => {
      db.flight.findUnique.mockResolvedValue({ id: FLIGHT })
      const error = await service.impact(FLIGHT).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(BadGatewayException)
      expect((error as BadGatewayException).getResponse()).toMatchObject({
        pending: expect.arrayContaining([expect.stringContaining('bookings')]),
      })
    })

    it('returns 404 for an unknown flight rather than 502', async () => {
      db.flight.findUnique.mockResolvedValue(null)
      await expect(service.impact(FLIGHT)).rejects.toThrow(NotFoundException)
      await expect(service.impact('nope')).rejects.toThrow(NotFoundException)
    })
  })
})
