import type { BookingTransaction, ServiceRequestInput } from '../contracts'
import { AssistanceService } from './assistance.service'

describe('AssistanceService', () => {
  const now = new Date('2026-11-01T00:00:00Z')
  const passenger = { findFirst: jest.fn() }
  const segment = { findMany: jest.fn() }
  const flight = { findMany: jest.fn() }
  const seat = { findMany: jest.fn() }
  const requests = { create: jest.fn() }
  const tx = {
    booking_passenger: passenger,
    booking_segment: segment,
    flight,
    seat_assignment: seat,
    booking_service_request: requests,
  } as unknown as BookingTransaction
  const maps = { getSeatMap: jest.fn() }
  const service = new AssistanceService({ now: () => now }, maps)
  const input: ServiceRequestInput = {
    bookingId: 'booking',
    bookingPassengerId: 'passenger',
    bookingSegmentId: 'segment',
    serviceCode: 'WCHR',
    requestedAt: now,
  }

  beforeEach(() => {
    jest.resetAllMocks()
    passenger.findFirst.mockResolvedValue({ passenger: { date_of_birth: new Date('2018-06-01T00:00:00Z') } })
    segment.findMany.mockResolvedValue([{ id: 'segment', flight_id: 'flight' }])
    flight.findMany.mockResolvedValue([
      { id: 'flight', dep_at: new Date('2026-11-04T00:00:00Z'), service_date: new Date('2026-11-04T00:00:00Z') },
    ])
    seat.findMany.mockResolvedValue([])
    requests.create.mockResolvedValue({})
  })

  it('creates a requested assistance record using the booking clock', async () => {
    await service.createForHold(tx, [input])
    expect(requests.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'requested', service_code: 'WCHR', requested_at: now }),
    })
  })

  it('rejects requests that miss their lead time', async () => {
    flight.findMany.mockResolvedValue([{ id: 'flight', dep_at: new Date('2026-11-01T23:00:00Z'), service_date: now }])
    await expect(service.createForHold(tx, [input])).rejects.toMatchObject({ code: 'ASSISTANCE_TOO_LATE' })
    expect(requests.create).not.toHaveBeenCalled()
  })

  it('requires a medical note and validates unaccompanied minor age', async () => {
    await expect(service.createForHold(tx, [{ ...input, serviceCode: 'MEDA', note: '  ' }])).rejects.toThrow('note')
    passenger.findFirst.mockResolvedValue({ passenger: { date_of_birth: new Date('2000-01-01T00:00:00Z') } })
    await expect(service.createForHold(tx, [{ ...input, serviceCode: 'UMNR', note: 'Guardian contact' }])).rejects.toThrow('aged 5–11')
  })

  it('rejects an assistance request if the passenger already holds an exit-row seat', async () => {
    seat.findMany.mockResolvedValue([{ flight_id: 'flight', seat_code: '12A' }])
    maps.getSeatMap.mockResolvedValue({ rows: [{ seats: [{ seatCode: '12A', type: 'exit' }] }] })
    await expect(service.createForHold(tx, [input])).rejects.toMatchObject({ code: 'SEAT_NOT_ALLOWED' })
    expect(requests.create).not.toHaveBeenCalled()
  })

  it('accepts a medical request exactly 48 hours before departure', async () => {
    flight.findMany.mockResolvedValue([
      { id: 'flight', dep_at: new Date('2026-11-03T00:00:00Z'), service_date: new Date('2026-11-03T00:00:00Z') },
    ])
    await service.createForHold(tx, [{ ...input, serviceCode: 'MEDA', note: 'Needs assistance' }])
    expect(requests.create).toHaveBeenCalledTimes(1)
  })

  it('refuses requests for a passenger who is not part of the booking', async () => {
    passenger.findFirst.mockResolvedValue(null)
    await expect(service.createForHold(tx, [input])).rejects.toThrow('Passenger does not belong')
    expect(requests.create).not.toHaveBeenCalled()
  })

  it('does not allow the unsupported STCR code', async () => {
    await expect(service.createForHold(tx, [{ ...input, serviceCode: 'STCR' as ServiceRequestInput['serviceCode'] }])).rejects.toThrow(
      'Unsupported',
    )
    expect(requests.create).not.toHaveBeenCalled()
  })
})
