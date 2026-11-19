import { Injectable } from '@nestjs/common'
import { BagDeliveryService, type DeliveryChoiceResult } from './bag-delivery.service'
import { BAGGAGE_ERROR_CODES, BaggageError } from './common/baggage.errors'
import type { DeliveryChoiceSnapshot } from './common/report.ports'
import type { PassengerDeliveryChoiceDto } from './dto/passenger-delivery-choice.dto'
import { ReportService, type ReportAccessInput } from './report.service'

interface PassengerDeliveryActor {
  customerId: string
  userId: string
}

@Injectable()
export class PassengerDeliveryChoiceService {
  constructor(
    private readonly reports: ReportService,
    private readonly deliveries: BagDeliveryService,
  ) {}

  async getChoice(caseNumber: string, access: ReportAccessInput): Promise<DeliveryChoiceSnapshot> {
    const choice = await this.reports.getDeliveryChoiceForCaseNumber(caseNumber, access)

    if (!choice) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.DELIVERY_NOT_FOUND, 'No delivery is available for this lost baggage case')
    }

    if (choice.deliveryType === null) {
      return { deliveryType: null, address: null, pickupAirport: null, status: choice.status }
    }

    return choice
  }

  async saveChoice(
    caseNumber: string,
    access: ReportAccessInput,
    actor: PassengerDeliveryActor,
    choice: PassengerDeliveryChoiceDto,
  ): Promise<DeliveryChoiceResult> {
    const deliveryId = await this.reports.getDeliveryIdForCaseNumber(caseNumber, access)

    if (!deliveryId) {
      throw new BaggageError(BAGGAGE_ERROR_CODES.DELIVERY_NOT_FOUND, 'No delivery is available for this lost baggage case')
    }

    return this.deliveries.applyChoice(
      { type: 'passenger', id: actor.customerId, userId: actor.userId },
      {
        deliveryId,
        deliveryType: choice.deliveryType,
        address: choice.address,
        pickupAirport: choice.pickupAirport,
      },
    )
  }
}
