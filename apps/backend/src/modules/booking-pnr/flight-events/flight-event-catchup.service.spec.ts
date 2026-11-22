import type { DbService } from '@backend/db/db.service'
import { FlightEventCatchupService } from './flight-event-catchup.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('FlightEventCatchupService', () => {
  const findMany = jest.fn()
  const service = new FlightEventCatchupService({ flight_event: { findMany } } as unknown as DbService)
  const event = (seq: bigint) => ({
    id: `event-${seq}`,
    seq,
    flight_id: 'flight',
    type: 'cancelled',
    occurred_at: new Date('2026-11-10T00:00:00Z'),
    old_aircraft_id: null,
    new_aircraft_id: null,
    resolution: 'refund',
    partner_airline: null,
  })

  beforeEach(() => findMany.mockReset())

  it('replays unreceipted events in sequence with contract event names', async () => {
    findMany.mockResolvedValue([event(1n), event(2n)])
    const handle = jest.fn().mockResolvedValue(undefined)
    await service.replay(handle)
    expect(handle.mock.calls.map(([item]) => item.seq)).toEqual([1n, 2n])
    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ type: 'flight.cancelled', resolution: 'refund' }))
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ flight_event_receipt: null }), orderBy: { seq: 'asc' } }),
    )
  })

  it('pages through events using the last processed sequence', async () => {
    findMany.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => event(BigInt(i + 1)))).mockResolvedValueOnce([event(101n)])
    const handle = jest.fn().mockResolvedValue(undefined)
    await service.replay(handle)
    expect(handle).toHaveBeenCalledTimes(101)
    expect(findMany.mock.calls[1][0].where.seq).toEqual({ gt: 100n })
  })

  it('stops on a failed event without handling later ones', async () => {
    findMany.mockResolvedValue([event(1n), event(2n)])
    const handle = jest.fn().mockRejectedValue(new Error('failed'))
    await expect(service.replay(handle)).rejects.toThrow('failed')
    expect(handle).toHaveBeenCalledTimes(1)
  })

  it('does not guess an unknown cancellation resolution', async () => {
    findMany.mockResolvedValue([{ ...event(1n), resolution: 'unknown' }])
    const handle = jest.fn()
    await expect(service.replay(handle)).rejects.toThrow('Unsupported flight-event resolution')
    expect(handle).not.toHaveBeenCalled()
  })
})
