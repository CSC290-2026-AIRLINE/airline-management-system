import type { DbService } from '@backend/db/db.service'
import { AssistanceQueueService } from './assistance-queue.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('AssistanceQueueService', () => {
  const findMany = jest.fn()
  const service = new AssistanceQueueService({ booking_service_request: { findMany } } as unknown as DbService)
  const request = (id: string, departure: string, segment: boolean) => ({
    id,
    booking_passenger_id: 'passenger',
    booking_segment_id: segment ? 'segment' : null,
    service_code: 'WCHR',
    status: 'requested',
    note: null,
    decision_note: null,
    requested_at: new Date('2026-11-01T00:00:00Z'),
    booking_passenger: {
      passenger_type: 'adult',
      passenger: { first_name: 'Alex', last_name: 'Example' },
      booking: {
        booking_reference: 'ABC234',
        booking_segment: [{ flight_id: 'flight', seat_inventory: { flight: { dep_at: new Date(departure) } } }],
      },
    },
    booking_segment: segment ? { seat_inventory: { flight: { flight_number: 'FT100', dep_at: new Date(departure) } } } : null,
  })

  beforeEach(() => findMany.mockReset())

  it('orders requests by departure, including requests covering all flights', async () => {
    findMany.mockResolvedValue([request('later', '2026-11-08T00:00:00Z', true), request('earlier', '2026-11-04T00:00:00Z', false)])
    const result = await service.list()
    expect(result.map((item) => item.serviceRequestId)).toEqual(['earlier', 'later'])
    expect(result[0]).toMatchObject({ passengerName: 'Alex Example', flightNumber: null, depAt: '2026-11-04T00:00:00.000Z' })
  })

  it('filters by status and includes booking-wide requests for the selected flight', async () => {
    findMany.mockResolvedValue([])
    await service.list({ status: 'requested', flightId: 'flight' })
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'requested',
          OR: expect.arrayContaining([
            { booking_segment: { flight_id: 'flight' } },
            { booking_segment_id: null, booking_passenger: { booking: { booking_segment: { some: { flight_id: 'flight' } } } } },
          ]),
        }),
      }),
    )
  })
})
