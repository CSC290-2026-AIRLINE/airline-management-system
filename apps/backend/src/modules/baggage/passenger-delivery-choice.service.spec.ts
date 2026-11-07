import { BagDeliveryService, type DeliveryChoiceResult } from './bag-delivery.service'
import { BAGGAGE_ERROR_CODES, BaggageError } from './common/baggage.errors'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import type { PassengerDeliveryChoiceDto } from './dto/passenger-delivery-choice.dto'
import { ReportService } from './report.service'
import { PassengerDeliveryChoiceService } from './passenger-delivery-choice.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/modules/admin-console/audit/audit.service', () => ({ AuditService: class {} }))

describe('PassengerDeliveryChoiceService', () => {
  const caseNumber = 'LB-2026-000118'
  const access = { bookingReference: 'ABC123', surname: 'Haddad', passengerId: 'passenger-id' }
  const actor = { customerId: 'customer-id', userId: 'user-id' }
  const deliveryId = 'delivery-id'
  const choice: PassengerDeliveryChoiceDto = { deliveryType: 'hotel', address: ' Marina Bay Sands ' }
  let reports: { getDeliveryIdForCaseNumber: jest.Mock }
  let deliveries: { applyChoice: jest.Mock }
  let service: PassengerDeliveryChoiceService

  beforeEach(() => {
    reports = { getDeliveryIdForCaseNumber: jest.fn().mockResolvedValue(deliveryId) }
    deliveries = {
      applyChoice: jest.fn().mockResolvedValue({
        id: deliveryId,
        reportId: 'report-id',
        status: 'preparing',
        deliveryType: 'hotel',
        address: 'Marina Bay Sands',
        pickupAirport: null,
        updatedAt: new Date('2026-10-21T10:00:00Z'),
      } satisfies DeliveryChoiceResult),
    }
    service = new PassengerDeliveryChoiceService(reports as unknown as ReportService, deliveries as unknown as BagDeliveryService)
  })

  it('uses the owned case delivery and authenticated passenger actor', async () => {
    const result = await service.saveChoice(caseNumber, access, actor, choice)

    expect(reports.getDeliveryIdForCaseNumber).toHaveBeenCalledWith(caseNumber, access)
    expect(deliveries.applyChoice).toHaveBeenCalledWith(
      { type: 'passenger', id: actor.customerId, userId: actor.userId },
      { deliveryId, deliveryType: 'hotel', address: ' Marina Bay Sands ', pickupAirport: undefined },
    )
    expect(result).toMatchObject({ id: deliveryId, status: 'preparing', deliveryType: 'hotel' })
  })

  it('rejects a case the passenger does not own before calling the delivery service', async () => {
    reports.getDeliveryIdForCaseNumber.mockRejectedValue(new BaggageError(BAGGAGE_ERROR_CODES.REPORT_NOT_FOUND, 'Not found'))

    await expect(service.saveChoice(caseNumber, access, actor, choice)).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
    expect(deliveries.applyChoice).not.toHaveBeenCalled()
  })

  it('rejects a report with no associated delivery', async () => {
    reports.getDeliveryIdForCaseNumber.mockResolvedValue(null)

    await expect(service.saveChoice(caseNumber, access, actor, choice)).rejects.toMatchObject({ code: 'DELIVERY_NOT_FOUND' })
    expect(deliveries.applyChoice).not.toHaveBeenCalled()
  })

  it('propagates the shared service rejection when choice is locked after dispatch', async () => {
    deliveries.applyChoice.mockRejectedValue(new FoundBagError(FOUND_BAG_ERROR_CODES.ALREADY_SENT, 'The bag is already on its way'))

    await expect(service.saveChoice(caseNumber, access, actor, choice)).rejects.toMatchObject({ code: 'ALREADY_SENT' })
  })
})
