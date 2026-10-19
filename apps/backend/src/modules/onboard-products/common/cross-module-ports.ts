// Booking/Payment/Tier ports are stubs that satisfy the F12 spec without
// any cross-team dependency. Each port returns a deterministic stub for
// the well-known F12 test fixtures; when the owning modules ship their
// own HTTP APIs, swap the implementation and the rest of F12 stays
// unchanged. F12 never reaches for booking_passenger_id or payment_id
// foreign keys — they are opaque strings persisted on product_order_line
// and product_sale.

import { Injectable } from '@nestjs/common'

export interface BookingsPort {
  isFlightBookable(flightId: string): Promise<boolean>
}

@Injectable()
export class StubBookingsService implements BookingsPort {
  async isFlightBookable(flightId: string): Promise<boolean> {
    // Until F3b ships, we say every flight is bookable; F12 only reads
    // this when deciding whether to show a "Catering order" on a flight.
    await Promise.resolve(flightId)
    return true
  }
}

export interface PaymentsPort {
  isPaymentConfirmed(paymentId: string): Promise<boolean>
}

@Injectable()
export class StubPaymentsService implements PaymentsPort {
  async isPaymentConfirmed(paymentId: string): Promise<boolean> {
    // Treat the spec's well-known sentinel as confirmed; everything
    // else is unknown (treated as not paid yet).
    await Promise.resolve(paymentId)
    return paymentId === 'f5-confirmed'
  }
}

export type TierStatus = 'none' | 'silver' | 'gold' | 'platinum'

export interface TierPort {
  getTierForCustomer(customerId: string): Promise<TierStatus>
}

@Injectable()
export class StubTierService implements TierPort {
  async getTierForCustomer(customerId: string): Promise<TierStatus> {
    // F11 (Loyalty) is not implemented yet. F12 falls back to no tier
    // benefit, so all meal lines are charged at the catalog price.
    await Promise.resolve(customerId)
    return 'none'
  }
}

export interface StoragePort {
  // Returns the image_key that should be persisted on product.image_key.
  // In a real deployment this would PUT the bytes to S3/SeaweedFS and
  // return the resulting object key. F12 currently ships with a no-op
  // implementation that mints a synthetic key from the file name.
  storeImage(fileName: string, data: Buffer): Promise<string>
}

@Injectable()
export class NoopStorageService implements StoragePort {
  async storeImage(fileName: string, data: Buffer): Promise<string> {
    await Promise.resolve(data)
    const safe = fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80)
    return `f12/${Date.now()}-${safe}`
  }
}
