jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))
jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }))
jest.mock('@backend/modules/admin-console/audit/audit.module', () => ({ AuditModule: class AuditModule {} }))
jest.mock('./baggage.module', () => ({ BaggageModule: class BaggageModule {} }))
jest.mock('@backend/modules/admin-console/simulation-clock', () => ({ SimulationClock: class SimulationClock {} }))
jest.mock('./prisma-report.repository', () => ({ PrismaReportRepository: class PrismaReportRepository {} }))
jest.mock('./prisma-booking.verification', () => ({ PrismaBookingVerification: class PrismaBookingVerification {} }))
jest.mock('./prisma-checked-bag.lookup', () => ({ PrismaCheckedBagLookup: class PrismaCheckedBagLookup {} }))
jest.mock('./prisma-case-number.sequence', () => ({ PrismaCaseNumberSequence: class PrismaCaseNumberSequence {} }))
jest.mock('./lost-report-photo.storage', () => ({ LostReportPhotoStorage: class LostReportPhotoStorage {} }))
jest.mock('./guards/baggage-customer.guard', () => ({
  BaggageCustomerGuard: class BaggageCustomerGuard {},
  CurrentBaggageCustomer: () => jest.fn(),
}))
jest.mock('./passenger-delivery-choice.service', () => ({ PassengerDeliveryChoiceService: class PassengerDeliveryChoiceService {} }))
jest.mock('./passenger-case-summary.service', () => ({ PassengerCaseSummaryService: class PassengerCaseSummaryService {} }))
jest.mock('./guest-booking-lookup.service', () => ({ GuestBookingLookupService: class GuestBookingLookupService {} }))
jest.mock('./guest-case-lookup.service', () => ({ GuestCaseLookupService: class GuestCaseLookupService {} }))

import { RequestMethod } from '@nestjs/common'
import { GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { IS_PUBLIC_KEY } from '@backend/auth/decorators/public.decorator'
import { PassengerLostReportModule } from './passenger-lost-report.module'
import { GuestLostReportController } from './guest-lost-report.controller'
import { GuestLostReportFlightsController } from './guest-lost-report-flights.controller'
import { GuestLostReportTravellersController } from './guest-lost-report-travellers.controller'
import { GuestLostReportCaseLookupController } from './guest-lost-report-case-lookup.controller'

describe('Guest routes retired', () => {
  const guestControllers = [
    GuestLostReportController,
    GuestLostReportFlightsController,
    GuestLostReportTravellersController,
    GuestLostReportCaseLookupController,
  ]

  for (const Controller of guestControllers) {
    it(`${Controller.name} still exists but is NOT registered in PassengerLostReportModule`, () => {
      // The controller class still exists (source preserved)
      expect(Controller).toBeDefined()
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, Controller)).toBe(true)
    })
  }

  it('PassengerLostReportModule does NOT include guest controllers in its controllers array', () => {
    const moduleMetadata = Reflect.getMetadata('controllers', PassengerLostReportModule)
    expect(moduleMetadata).toBeDefined()

    const controllerNames = moduleMetadata.map((c: unknown) => (c as { name: string }).name)

    const guestControllerNames = [
      'GuestLostReportController',
      'GuestLostReportFlightsController',
      'GuestLostReportTravellersController',
      'GuestLostReportCaseLookupController',
    ]

    for (const guestName of guestControllerNames) {
      expect(controllerNames).not.toContain(guestName)
    }

    // Authenticated controllers SHOULD still be registered
    const authenticatedNames = [
      'PassengerLostReportController',
      'PassengerLostReportFlightsController',
      'PassengerLostReportTravellersController',
    ]

    for (const authName of authenticatedNames) {
      expect(controllerNames).toContain(authName)
    }
  })

  it('guest controllers still have correct @Public() and route metadata (preserved for history)', () => {
    const expectedMetadata = [
      { controller: GuestLostReportController, path: 'guest/lost-reports', method: RequestMethod.POST, status: 201 },
      { controller: GuestLostReportFlightsController, path: 'guest/lost-report-flights', method: RequestMethod.POST, status: 200 },
      { controller: GuestLostReportTravellersController, path: 'guest/lost-report-travellers', method: RequestMethod.POST, status: 200 },
      { controller: GuestLostReportCaseLookupController, path: 'guest/lost-report-case-lookup', method: RequestMethod.POST, status: 200 },
    ]

    for (const { controller, path, method, status } of expectedMetadata) {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, controller)).toBe(true)
      expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(path)

      // Check at least one handler has correct method/status
      const prototype = controller.prototype
      const handlerNames = Object.getOwnPropertyNames(prototype).filter((name) => name !== 'constructor')
      expect(handlerNames.length).toBeGreaterThan(0)

      const handler = Object.getOwnPropertyDescriptor(prototype, handlerNames[0])?.value
      if (handler) {
        expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method)
        expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(status)
      }

      // No guards on guest controllers
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toBeUndefined()
    }
  })
})
