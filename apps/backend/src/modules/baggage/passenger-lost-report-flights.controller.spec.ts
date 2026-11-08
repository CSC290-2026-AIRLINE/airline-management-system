jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

import { BaggageCustomerGuard, type BaggageCustomer } from './guards/baggage-customer.guard'
import { PassengerLostReportFlightsController } from './passenger-lost-report-flights.controller'
import { ReportService } from './report.service'

describe('PassengerLostReportFlightsController', () => {
  it('uses the guard-derived passenger ID and only returns the flight selection fields', async () => {
    const flights = [
      {
        flightId: '22222222-2222-4222-8222-222222222222',
        flightNumber: 'FY 117',
        serviceDate: new Date('2026-10-18T00:00:00.000Z'),
        origin: 'BKK',
        destination: 'SIN',
      },
    ]
    const listConfirmedFlights = jest.fn().mockResolvedValue(flights)
    const reports = { listConfirmedFlights } as unknown as ReportService
    const controller = new PassengerLostReportFlightsController(reports)
    const customer = {
      id: '33333333-3333-4333-8333-333333333333',
      customerId: '44444444-4444-4444-8444-444444444444',
      passengerId: '55555555-5555-4555-8555-555555555555',
      email: 'passenger@example.com',
      type: 'customer',
    } as BaggageCustomer

    const result = await controller.list(customer, {
      bookingReference: 'ABC123',
      surname: 'Smith',
      passengerId: '66666666-6666-4666-8666-666666666666',
    } as never)

    expect(listConfirmedFlights).toHaveBeenCalledWith({
      bookingReference: 'ABC123',
      surname: 'Smith',
      passengerId: customer.passengerId,
    })
    expect(result).toEqual(flights)
    expect(Object.keys(result[0])).toEqual(['flightId', 'flightNumber', 'serviceDate', 'origin', 'destination'])
    expect(Reflect.getMetadata('__guards__', PassengerLostReportFlightsController)).toContain(BaggageCustomerGuard)
  })
})
