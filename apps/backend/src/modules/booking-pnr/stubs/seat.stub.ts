import { Injectable } from '@nestjs/common'
import type { SeatPort } from '../contracts'

@Injectable()
export class SeatStub implements SeatPort {
  holdForBooking(): Promise<void> {
    return Promise.resolve()
  }

  assignForBooking(): Promise<void> {
    return Promise.resolve()
  }

  releaseForBooking(): Promise<void> {
    return Promise.resolve()
  }
}
