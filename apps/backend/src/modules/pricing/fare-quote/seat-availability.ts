import { Injectable } from '@nestjs/common'

// How fare quotes learn how full a flight is, for the load rules. Feature 3b owns seat inventory.
// A thrown error becomes 502 UPSTREAM_UNAVAILABLE on the quote.
export abstract class SeatAvailability {
  abstract seatsLeftPct(flightId: string): Promise<number> // 0 to 100
}

// Stand-in until Feature 3b exists. The spec says load is never guessed, so with no seat inventory to ask, every new
// quote is refused with 502 UPSTREAM_UNAVAILABLE rather than priced on a made-up number. When 3b is ready, write a
// provider that calls it and swap it in pricing.module.ts; nothing else changes. The staff simulator is unaffected:
// staff type the seats left there.
@Injectable()
export class NoBookingsSeatAvailability extends SeatAvailability {
  seatsLeftPct(): Promise<number> {
    return Promise.reject(new Error('Feature 3b seat availability is not connected'))
  }
}
