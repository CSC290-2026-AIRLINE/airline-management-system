import { Injectable } from '@nestjs/common'
import type { BookingDetail, BookingListQuery, BookingPage, BookingReadPort, FlightPassengerDto, UpcomingFlightDto } from '../contracts'

@Injectable()
export class BookingReadStub implements BookingReadPort {
  getBooking(): Promise<BookingDetail | null> {
    return Promise.resolve(null)
  }

  findBookingByReferenceAndSurname(): Promise<BookingDetail | null> {
    return Promise.resolve(null)
  }

  listFlightPassengers(): Promise<FlightPassengerDto[]> {
    return Promise.resolve([])
  }

  listCustomerBookings(): Promise<UpcomingFlightDto[]> {
    return Promise.resolve([])
  }

  searchStaffBookings(query: BookingListQuery): Promise<BookingPage> {
    return Promise.resolve({
      items: [],
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      total: 0,
    })
  }

  getStaffBookingDetail(): Promise<BookingDetail | null> {
    return Promise.resolve(null)
  }

  getBookingForCustomer(): Promise<BookingDetail | null> {
    return Promise.resolve(null)
  }
}
