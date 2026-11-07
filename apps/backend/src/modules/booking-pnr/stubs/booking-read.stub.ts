import { Injectable } from '@nestjs/common'
import type {
  BookingDetail,
  BookingListItem,
  BookingListQuery,
  BookingPage,
  BookingReadPort,
  FlightBookingCounts,
  FlightPassengerDto,
  UpcomingFlightDto,
} from '../contracts'

// Stub until B4/B5 land: nothing is found. Replace with B's real read service.
@Injectable()
export class BookingReadStub implements BookingReadPort {
  getBooking(): Promise<BookingDetail | null> {
    return Promise.resolve(null)
  }

  getBookingDetail(): Promise<BookingDetail | null> {
    return Promise.resolve(null)
  }

  findBookingByReferenceAndSurname(): Promise<BookingDetail | null> {
    return Promise.resolve(null)
  }

  getBookingForPassenger(): Promise<BookingDetail | null> {
    return Promise.resolve(null)
  }

  listCustomerBookings(): Promise<BookingListItem[]> {
    return Promise.resolve([])
  }

  listStaffBookings(query: BookingListQuery): Promise<BookingPage> {
    return Promise.resolve({
      items: [],
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      total: 0,
    })
  }

  listFlightPassengers(): Promise<FlightPassengerDto[]> {
    return Promise.resolve([])
  }

  listUpcomingFlights(): Promise<UpcomingFlightDto[]> {
    return Promise.resolve([])
  }

  countBookingsForFlight(): Promise<FlightBookingCounts> {
    return Promise.resolve({ bookings: 0, passengers: 0, openServiceRequests: 0 })
  }
}
