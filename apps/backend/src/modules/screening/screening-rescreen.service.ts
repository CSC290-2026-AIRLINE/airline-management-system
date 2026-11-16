import { Injectable } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { ScreeningCheckService } from './screening-check.service'

export interface UpcomingPassengerFlight {
  passengerId: string
  flightId: string
  pnrId?: string
}
export abstract class BookingsPort {
  // F3b must return ALL active upcoming passenger-flight pairs, including checked-in
  // passengers and those without screening history. The transaction sees identity writes.
  abstract listUpcomingPassengerFlights(tx: Prisma.TransactionClient, now: Date): Promise<UpcomingPassengerFlight[]>
}
@Injectable()
export class StubBookingsPort extends BookingsPort {
  listUpcomingPassengerFlights(): Promise<UpcomingPassengerFlight[]> {
    return Promise.resolve([])
  }
}
@Injectable()
export class ScreeningRescreenService {
  constructor(
    private readonly bookings: BookingsPort,
    private readonly checks: ScreeningCheckService,
  ) {}

  async run(
    tx: Prisma.TransactionClient,
    now: Date,
    source: string,
    triggerPoint: 'new_entry' | 'entry_change' | 'identity_change',
    passengerId?: string,
    entryId?: string,
  ) {
    const pairs = await this.bookings.listUpcomingPassengerFlights(tx, now)
    const seen = new Set<string>()
    let runs = 0
    for (const pair of pairs) {
      if (passengerId && pair.passengerId !== passengerId) continue
      const key = pair.passengerId + ':' + pair.flightId + ':' + (pair.pnrId ?? '')
      if (seen.has(key)) continue
      seen.add(key)
      await this.checks.checkSystemInTransaction(tx, now, source, { ...pair, triggerPoint }, entryId)
      runs++
    }
    return { runs, bookingSource: this.bookings instanceof StubBookingsPort ? ('stub' as const) : ('connected' as const) }
  }
}
