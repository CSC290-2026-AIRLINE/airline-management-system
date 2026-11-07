import { Injectable } from '@nestjs/common'
import type { FlightAvailability, FlightAvailabilityRequest, InventoryPort } from '../contracts'

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

  seatsLeft(): Promise<number> {
    return Promise.resolve(0)
  }

  availability(flights: FlightAvailabilityRequest[]): Promise<FlightAvailability[]> {
    return Promise.resolve(flights.map((flight) => ({ flightId: flight.flightId, cabin: flight.cabin, seatsLeft: 0 })))
  }
}
