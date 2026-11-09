// Booking/Payment/Tier ports are stubs that satisfy the F12 spec without
// any cross-team dependency. Each port returns a deterministic stub for
// the well-known F12 test fixtures; when the owning modules ship their
// own HTTP APIs, swap the implementation and the rest of F12 stays
// unchanged. F12 never reaches for booking_passenger_id or payment_id
// foreign keys — they are opaque strings persisted on product_order_line
// and product_sale.

import { Injectable } from '@nestjs/common'
import { isUuid } from './mapping'
import type { F12Cabin } from './mapping'

export interface BookingPassenger {
  id: string
  name: string
}

export interface BookingSnapshot {
  id: string
  // null while F3b has no schema to read. The order service treats a
  // null owner as "ownership cannot be checked yet" and relies on the
  // authenticated customer for the rest; the port swap makes it real.
  customerId: string | null
  flightId: string | null
  cabin: F12Cabin | null
  status: 'confirmed' | 'cancelled' | 'pending'
  passengers: BookingPassenger[]
}

export interface BookingsPort {
  isFlightBookable(flightId: string): Promise<boolean>
  getBooking(bookingId: string): Promise<BookingSnapshot | null>
}

@Injectable()
export class StubBookingsService implements BookingsPort {
  async isFlightBookable(flightId: string): Promise<boolean> {
    // Until F3b ships, we say every flight is bookable; F12 only reads
    // this when deciding whether to show a "Catering order" on a flight.
    await Promise.resolve(flightId)
    return true
  }

  async getBooking(bookingId: string): Promise<BookingSnapshot | null> {
    // A booking id that is not a UUID cannot be a real booking, so the
    // order is refused with BOOKING_NOT_CONFIRMED. Anything else is
    // treated as a confirmed booking that F3b has not modelled yet.
    await Promise.resolve(bookingId)
    if (!isUuid(bookingId)) return null
    return {
      id: bookingId,
      customerId: null,
      flightId: null,
      cabin: null,
      status: 'confirmed',
      passengers: [],
    }
  }
}

export type PaymentStatus = 'pending' | 'paid' | 'failed'

export interface PaymentRequest {
  // F12 sends the order id as the reference, the total, the currency
  // and the customer id. F5 owns the payment and any refund.
  reference: string
  amount: number
  currency: string
  customerId: string
}

export interface PaymentStartResult {
  paymentId: string
  status: PaymentStatus
}

export interface PaymentsPort {
  isPaymentConfirmed(paymentId: string): Promise<boolean>
  // Start collecting a total. Returns the payment id F12 stores on the
  // order and the status F5 reports first.
  startPayment(request: PaymentRequest): Promise<PaymentStartResult>
  // Ask F5 to refund a paid order (customer cancel, or a payment that
  // arrived after the order expired).
  refund(paymentId: string, amount: number, reason: string): Promise<boolean>
}

@Injectable()
export class StubPaymentsService implements PaymentsPort {
  async isPaymentConfirmed(paymentId: string): Promise<boolean> {
    // Treat the spec's well-known sentinel as confirmed; everything
    // else is unknown (treated as not paid yet).
    await Promise.resolve(paymentId)
    return paymentId === 'f5-confirmed'
  }

  async startPayment(request: PaymentRequest): Promise<PaymentStartResult> {
    // F5 does not exist yet. Mint a deterministic payment id from the
    // order reference so a retry of the checkout reuses the same id,
    // and report the payment as pending: F5 confirms it later through
    // POST /payment-events.
    await Promise.resolve(request)
    return { paymentId: deterministicPaymentId(request.reference), status: 'pending' }
  }

  async refund(paymentId: string, amount: number, reason: string): Promise<boolean> {
    await Promise.resolve({ paymentId, amount, reason })
    return true
  }
}

// A stable UUID-shaped payment id derived from the order id, so the
// same order always maps to the same payment.
export function deterministicPaymentId(reference: string): string {
  let hash = 0
  for (let i = 0; i < reference.length; i++) {
    hash = (hash * 31 + reference.charCodeAt(i)) >>> 0
  }
  const hex = hash.toString(16).padStart(8, '0')
  return `f5000000-0000-4000-8000-${hex.repeat(4).slice(0, 12)}`
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
