jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

import { BaggageCustomerGuard, type BaggageCustomer } from './guards/baggage-customer.guard'
import { PassengerLostReportTravellersController } from './passenger-lost-report-travellers.controller'
import { ReportService } from './report.service'

describe('PassengerLostReportTravellersController', () => {
  const customer = {
    id: '33333333-3333-4333-8333-333333333333',
    customerId: '44444444-4444-4444-8444-444444444444',
    passengerId: '55555555-5555-4555-8555-555555555555',
    email: 'passenger@example.com',
    type: 'customer',
  } as BaggageCustomer

  it('verifies with the guard-derived passenger ID, never a client-supplied one', async () => {
    const listEligibleTravellers = jest.fn().mockResolvedValue([])
    const controller = new PassengerLostReportTravellersController({ listEligibleTravellers } as unknown as ReportService)

    await controller.list(customer, {
      bookingReference: 'ABC123',
      surname: 'Smith',
      passengerId: '66666666-6666-4666-8666-666666666666',
    } as never)

    expect(listEligibleTravellers).toHaveBeenCalledWith({ bookingReference: 'ABC123', surname: 'Smith', passengerId: customer.passengerId })
  })

  it('returns the service result unchanged', async () => {
    const travellers = [{ bookingPassengerId: 'a', displayName: 'Anna Eriksson', isYou: true, flights: [] }]
    const controller = new PassengerLostReportTravellersController({
      listEligibleTravellers: jest.fn().mockResolvedValue(travellers),
    } as unknown as ReportService)

    await expect(controller.list(customer, { bookingReference: 'ABC123', surname: 'Smith' })).resolves.toBe(travellers)
  })

  it('is protected by the customer guard', () => {
    expect(Reflect.getMetadata('__guards__', PassengerLostReportTravellersController)).toContain(BaggageCustomerGuard)
  })
})
