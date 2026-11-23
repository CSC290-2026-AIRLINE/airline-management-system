import { Injectable } from '@nestjs/common'
import type { BookingClock } from '../contracts'

@Injectable()
export class SystemBookingClock implements BookingClock {
  now(): Date {
    return new Date()
  }
}
