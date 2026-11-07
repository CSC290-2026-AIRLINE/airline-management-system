import { Injectable } from '@nestjs/common'
import type { FlightAvailability, FlightAvailabilityRequest, InventoryPort } from '../contracts'

const STUB_SEATS_LEFT = 9

@Injectable()
export class InventoryStub implements InventoryPort {
  lock(): Promise<void> {
    return Promise.resolve()
  }

  hold(): Promise<void> {
    return Promise.resolve()
  }

  sell(): Promise<void> {
    return Promise.resolve()
  }

  release(): Promise<void> {
    return Promise.resolve()
  }

  returnSold(): Promise<void> {
    return Promise.resolve()
  }

  createForFlight(): Promise<void> {
    return Promise.resolve()
  }

  setCapacity(): Promise<void> {
    return Promise.resolve()
  }

  setAwardSeats(): Promise<void> {
    return Promise.resolve()
  }

  // Stub until A1 lands: every cabin has 9 seats left, so search and the booking pages have something to show.
  seatsLeft(): Promise<number> {
    return Promise.resolve(STUB_SEATS_LEFT)
  }

  availability(flights: FlightAvailabilityRequest[]): Promise<FlightAvailability[]> {
    return Promise.resolve(flights.map((flight) => ({ flightId: flight.flightId, cabin: flight.cabin, seatsLeft: STUB_SEATS_LEFT })))
  }
}
