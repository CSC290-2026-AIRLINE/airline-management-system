import { Injectable, Logger } from '@nestjs/common'

// How fare quotes learn how full a flight is, for the load rules. Feature 3b owns seat inventory.
// A thrown error becomes 502 UPSTREAM_UNAVAILABLE on the quote.
export abstract class SeatAvailability {
  abstract seatsLeftPct(flightId: string): Promise<number> // 0 to 100
}

// Stand-in until Feature 3b exists: there is no booking or seat table yet, so nothing can be sold and every flight is
// empty. When 3b is ready, write a provider that calls it and swap it in pricing.module.ts; nothing else changes.
@Injectable()
export class NoBookingsSeatAvailability extends SeatAvailability {
  private readonly logger = new Logger(NoBookingsSeatAvailability.name)
  private warned = false

  seatsLeftPct(): Promise<number> {
    if (!this.warned) {
      this.warned = true
      this.logger.warn('Feature 3b is not connected: quoting every flight as 100% seats left, so load rules cannot match full flights')
    }
    return Promise.resolve(100)
  }
}
