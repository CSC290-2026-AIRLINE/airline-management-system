import { Inject, Injectable } from '@nestjs/common'
import { BOOKING_PROVIDER, BOOKING_READ_PORT, type BookingDetail, type BookingReadPort, type FlightPassengerDto } from '../contracts'

export interface BookingProvider {
  getBooking: (reference: string) => Promise<BookingDetail | null>
  findBookingByReferenceAndSurname: (reference: string, surname: string) => Promise<BookingDetail | null>
  listFlightPassengers: (flightId: string) => Promise<FlightPassengerDto[]>
}

@Injectable()
export class BookingProviderAdapter implements BookingProvider {
  constructor(@Inject(BOOKING_READ_PORT) private readonly readPort: BookingReadPort) {}

  getBooking(reference: string): Promise<BookingDetail | null> {
    return this.readPort.getBooking(reference)
  }

  findBookingByReferenceAndSurname(reference: string, surname: string): Promise<BookingDetail | null> {
    return this.readPort.findBookingByReferenceAndSurname(reference, surname)
  }

  listFlightPassengers(flightId: string): Promise<FlightPassengerDto[]> {
    return this.readPort.listFlightPassengers(flightId)
  }
}

export { BOOKING_PROVIDER }
