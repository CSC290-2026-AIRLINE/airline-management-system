import { Injectable } from '@nestjs/common'
import type { CancelForFlightPort, CancelForFlightResult, FlightEvent } from '../contracts'

// Stub until B14 lands: no booking is affected.
@Injectable()
export class CancelForFlightStub implements CancelForFlightPort {
  cancelBookingsForFlight(_tx: unknown, _flightId: string, event: FlightEvent): Promise<CancelForFlightResult> {
    void _tx
    void _flightId
    return Promise.resolve({
      eventId: event.id,
      affectedBookingIds: [],
      cancelledCouponIds: [],
    })
  }
}
