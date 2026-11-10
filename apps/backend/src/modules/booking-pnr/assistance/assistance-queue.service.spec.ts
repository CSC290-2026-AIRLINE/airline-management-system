import type { DbService } from '@backend/db/db.service'
import type { BookingReadPort } from '../contracts'
import { AssistanceQueueService } from './assistance-queue.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('AssistanceQueueService', () => {
  const findMany = jest.fn()
  const getBookingForPassenger = jest.fn()
  const service = new AssistanceQueueService(
    { booking_service_request: { findMany } } as unknown as DbService,
    { getBookingForPassenger } as unknown as BookingReadPort,
  )
  const request = (id: string, bookingId: string, segmentId: string | null) => ({
    id,
    booking_id: bookingId,
    booking_passenger_id: `passenger-${bookingId}`,
    booking_segment_id: segmentId,
    service_code: 'WCHR',
    status: 'requested',
    note: null,
    decision_note: null,
    requested_at: new Date('2026-11-01T00:00:00Z'),
  })
  const booking = (id: string, departure: string) => ({
    reference: `REF-${id}`,
    passengers: [{ bookingPassengerId: `passenger-${id}`, firstName: 'Alex', lastName: 'Example', passengerType: 'adult' }],
    segments: [{ bookingSegmentId: `segment-${id}`, flightId: `flight-${id}`, flightNumber: `FT-${id}`, depAt: new Date(departure) }],
  })

  beforeEach(() => {
    findMany.mockReset()
    getBookingForPassenger.mockReset()
    getBookingForPassenger.mockImplementation((id: string) =>
      Promise.resolve(id === 'passenger-a' ? booking('a', '2026-11-08T00:00:00Z') : booking('b', '2026-11-04T00:00:00Z')),
    )
  })

  it('orders requests by departure, including requests covering all flights', async () => {
    findMany.mockResolvedValue([request('later', 'a', 'segment-a'), request('earlier', 'b', null)])
    const result = await service.list()
    expect(result.map((item) => item.serviceRequestId)).toEqual(['earlier', 'later'])
    expect(result[0]).toMatchObject({ passengerName: 'Alex Example', flightNumber: null, depAt: '2026-11-04T00:00:00.000Z' })
  })

  it('filters by flight including booking-wide requests and asks B for booking data', async () => {
    findMany.mockResolvedValue([request('a', 'a', 'segment-a'), request('b', 'b', null)])
    const result = await service.list({ status: 'requested', flightId: 'flight-b' })
    expect(result.map((item) => item.serviceRequestId)).toEqual(['b'])
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'requested' } }))
    expect(getBookingForPassenger).toHaveBeenCalledTimes(2)
  })

  it('reads each booking only once when several requests belong to it', async () => {
    findMany.mockResolvedValue([request('first', 'a', 'segment-a'), request('second', 'a', null)])
    await service.list()
    expect(getBookingForPassenger).toHaveBeenCalledTimes(1)
  })
})
