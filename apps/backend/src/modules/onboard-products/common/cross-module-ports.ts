// Cross-module ports. Bookings (F3b) and tier (F11) are read from their tables,
// read-only. Payments (F5) has no module yet, so that port is still a stub: swap
// the implementation when F5 ships and the rest of F12 stays unchanged.
// booking_passenger_id and payment_id are opaque ids with no foreign key.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { isUuid } from './mapping'
import type { F12Cabin } from './mapping'

export interface BookingPassenger {
  id: string
  name: string
}

export interface BookingSnapshot {
  id: string
  // null while F3b has no schema to read. The order service treats a
  // null owner as "ownership cannot be checked".
  customerId: string | null
  // The flights this booking flies, with the cabin of each.
  segments: { flightId: string; cabin: F12Cabin }[]
  status: 'confirmed' | 'cancelled' | 'pending'
  passengers: BookingPassenger[]
}

export interface BookingsPort {
  getBooking(bookingId: string): Promise<BookingSnapshot | null>
}

@Injectable()
export class DbBookingsService implements BookingsPort {
  constructor(private readonly db: DbService) {}

  async getBooking(bookingId: string): Promise<BookingSnapshot | null> {
    if (!isUuid(bookingId)) return null
    const row = await this.db.booking.findUnique({
      where: { id: bookingId },
      include: {
        booking_segment: { orderBy: { segment_order: 'asc' } },
        booking_passenger: { include: { passenger: true } },
      },
    })
    if (!row) return null
    return {
      id: row.id,
      customerId: row.customer_id,
      segments: row.booking_segment.map((s) => ({ flightId: s.flight_id, cabin: s.cabin as F12Cabin })),
      status: row.status === 'confirmed' ? 'confirmed' : row.status === 'held' ? 'pending' : 'cancelled',
      passengers: row.booking_passenger
        .filter((p) => p.passenger_type !== 'infant')
        .map((p) => ({ id: p.id, name: `${p.passenger.first_name} ${p.passenger.last_name}` })),
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
  // null for an on-board sale, which has no customer.
  customerId: string | null
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
  // Collect an on-board sale after the flight. F5 answers at once: paid or failed.
  collect(request: PaymentRequest): Promise<PaymentStartResult>
  // Record the result F5 reported for a payment.
  settle(paymentId: string, result: 'paid' | 'failed'): Promise<void>
  // Ask F5 to refund a paid order (customer cancel, or a payment that
  // arrived after the order expired).
  refund(paymentId: string, amount: number, reason: string): Promise<boolean>
}

// F5 has its tables (`payment`) but no service yet, so F12 writes the payment row itself with provider 'fake'. Swap this
// class for F5's service when it ships; nothing else in F12 changes.
@Injectable()
export class StubPaymentsService implements PaymentsPort {
  constructor(private readonly db: DbService) {}

  async isPaymentConfirmed(paymentId: string): Promise<boolean> {
    if (!isUuid(paymentId)) return false
    const row = await this.db.payment.findUnique({ where: { id: paymentId }, select: { status: true } })
    return row?.status === 'captured'
  }

  async startPayment(request: PaymentRequest): Promise<PaymentStartResult> {
    // A retry of the same checkout reuses the same payment (the idempotency key is the order reference).
    const key = `f12:${request.reference}`
    const existing = await this.db.payment.findFirst({ where: { payer_customer_id: request.customerId, idempotency_key: key } })
    if (existing) return { paymentId: existing.id, status: 'pending' }
    const now = new Date()
    const row = await this.db.payment.create({
      data: {
        source_feature: 12,
        purchase_ref: request.reference,
        payer_customer_id: request.customerId,
        idempotency_key: key,
        status: 'created',
        provider: 'fake',
        currency: request.currency,
        amount_total: request.amount,
        card_amount: request.amount,
        started_at: now,
        expires_at: new Date(now.getTime() + 60 * 60_000),
      },
    })
    // F5 confirms later through POST /payment-events.
    return { paymentId: row.id, status: 'pending' }
  }

  async collect(request: PaymentRequest): Promise<PaymentStartResult> {
    const now = new Date()
    const row = await this.db.payment.create({
      data: {
        source_feature: 12,
        purchase_ref: request.reference,
        payer_customer_id: request.customerId,
        idempotency_key: `f12:${request.reference}`,
        status: 'captured',
        provider: 'fake',
        currency: request.currency,
        amount_total: request.amount,
        card_amount: request.amount,
        started_at: now,
        expires_at: new Date(now.getTime() + 60 * 60_000),
        authorised_at: now,
        captured_at: now,
      },
    })
    return { paymentId: row.id, status: 'paid' }
  }

  async settle(paymentId: string, result: 'paid' | 'failed'): Promise<void> {
    if (!isUuid(paymentId)) return
    const now = new Date()
    await this.db.payment.updateMany({
      where: { id: paymentId, status: 'created' },
      data: result === 'paid' ? { status: 'captured', authorised_at: now, captured_at: now } : { status: 'failed' },
    })
  }

  async refund(paymentId: string, amount: number, reason: string): Promise<boolean> {
    void amount
    void reason
    if (!isUuid(paymentId)) return false
    await this.db.payment.updateMany({ where: { id: paymentId, status: 'captured' }, data: { status: 'reversed' } })
    return true
  }
}

// 'none' or the F11 tier code. A missing or lapsed tier is 'none' and never blocks an order.
export type TierStatus = string

export interface TierPort {
  getTierForCustomer(customerId: string): Promise<TierStatus>
}

@Injectable()
export class DbTierService implements TierPort {
  constructor(private readonly db: DbService) {}

  async getTierForCustomer(customerId: string): Promise<TierStatus> {
    try {
      const member = await this.db.loyalty_member.findUnique({
        where: { customer_id: customerId },
        select: { tier_code: true, tier_expires_at: true },
      })
      if (!member?.tier_code) return 'none'
      if (member.tier_expires_at && member.tier_expires_at.getTime() < Date.now()) return 'none'
      return member.tier_code
    } catch {
      return 'none'
    }
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
