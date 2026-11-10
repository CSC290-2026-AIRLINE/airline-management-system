import type { BookingDetail, BookingReadPort, FlightPassengerDto } from '../contracts'
import { BookingProviderAdapter } from './booking-provider.adapter'

describe('BookingProviderAdapter', () => {
  const reads = {
    findBookingByReferenceAndSurname: jest.fn(),
    getBookingForPassenger: jest.fn(),
    listFlightPassengers: jest.fn(),
  }
  const adapter = new BookingProviderAdapter(reads as unknown as BookingReadPort)
  const booking = {
    reference: 'ABC123',
    passengers: [{ bookingPassengerId: 'p1', firstName: 'Alex', lastName: 'Lee' }],
    segments: [{ bookingSegmentId: 's1', segmentOrder: 1, cabin: 'economy', fareClassCode: 'Y' }],
    coupons: [
      { bookingPassengerId: 'p1', bookingSegmentId: 's1', passengerId: 'person', flightId: 'f1', status: 'confirmed' },
      { bookingPassengerId: 'p1', bookingSegmentId: 's1', passengerId: 'person', flightId: 'f2', status: 'cancelled' },
    ],
    serviceRequests: [
      { bookingPassengerId: 'p1', bookingSegmentId: null, status: 'accepted', serviceCode: 'WCHR' },
      { bookingPassengerId: 'p1', bookingSegmentId: null, status: 'rejected', serviceCode: 'MEDA' },
    ],
  } as unknown as BookingDetail

  beforeEach(() => jest.resetAllMocks())

  it('finds a booking by reference and surname, with live assistance only', async () => {
    reads.findBookingByReferenceAndSurname.mockResolvedValue(booking)
    const result = await adapter.findByPnrAndLastName('ABC123', 'Lee')
    expect(reads.findBookingByReferenceAndSurname).toHaveBeenCalledWith('ABC123', 'Lee')
    expect(result).toEqual([expect.objectContaining({ pnr: 'ABC123', flightId: 'f1', paid: true, specialAssistance: ['WCHR'] })])
  })

  it('finds the passenger through the read port and handles missing bookings', async () => {
    reads.getBookingForPassenger.mockResolvedValueOnce(booking).mockResolvedValueOnce(null)
    await expect(adapter.byBookingPassengerId('p1')).resolves.toMatchObject({ bookingPassengerId: 'p1', flightId: 'f1' })
    await expect(adapter.byBookingPassengerId('missing')).resolves.toBeNull()
  })

  it('maps the confirmed passenger list supplied by the read port', async () => {
    const passenger = {
      bookingReference: 'ABC123',
      bookingPassengerId: 'p1',
      passengerId: 'person',
      firstName: 'Alex',
      lastName: 'Lee',
      cabin: 'economy',
      fareClassCode: 'Y',
      serviceCodes: ['WCHR'],
    } as FlightPassengerDto
    reads.listFlightPassengers.mockResolvedValue([passenger])
    await expect(adapter.listByFlight('f1')).resolves.toEqual([
      expect.objectContaining({ pnr: 'ABC123', flightId: 'f1', paid: true, specialAssistance: ['WCHR'] }),
    ])
    expect(reads.listFlightPassengers).toHaveBeenCalledWith('f1')
  })
})
