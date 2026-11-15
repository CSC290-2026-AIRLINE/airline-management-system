import type { LineType } from '../payment-state'

/**
 * The in-process contract between 5a and a selling feature (3b, 6, 12, 17). The seller gives the lines, the amount,
 * the deadline and a confirm method; 5a never prices anything. These are service methods, not HTTP routes.
 */
export interface PurchaseLine {
  lineType: LineType
  bookingId?: string | null
  bookingCouponId?: string | null
  sourceRef?: string | null
  description: string
  amountCents: number
}

export interface Purchase {
  sourceFeature: 3 | 6 | 12 | 17
  purchaseRef: string
  /** The customer who owns the purchase (the payer). */
  customerId: string
  bookingId: string | null
  cargoBookingId: string | null
  /** Whether the seller will take money for it now (for a booking: held). */
  payable: boolean
  /** The hold end or the seller's deadline; becomes payment.expires_at. */
  expiresAt: Date
  currency: string
  lines: PurchaseLine[]
  /** A miles booking: the receipt adds "Paid with N miles" and a 0.00 total is allowed. */
  milesBooking: boolean
  /** Human label for the hosted page and receipts, e.g. the booking reference. */
  label: string
  /** customer-web path to send the customer back to when they cancel on the hosted page. */
  cancelPath: string
}

/** Codes a seller may refuse a confirm with. Anything else is treated as a refusal too. */
export type ConfirmRefusal = 'SEAT_UNAVAILABLE' | 'HOLD_EXPIRED' | 'FLIGHT_NOT_FOR_SALE' | 'REDEMPTION_LAPSED' | 'CARGO_NOT_PAYABLE'

export type ConfirmAnswer = { ok: true } | { ok: false; code: ConfirmRefusal; message: string }

export interface PurchaseSeller {
  readonly sourceFeature: 3 | 6 | 12 | 17
  /** Called only from `authorised` (or for a zero-cash payment). A repeat call for a confirmed purchase answers yes. */
  confirm(purchaseRef: string, paymentId: string): Promise<ConfirmAnswer>
  /** The payment ended failed or expired: the seller may end its hold early. Must tolerate repeats. */
  release(purchaseRef: string): Promise<void>
  /** The money was captured (feature 17 sets payment_id and issues the Air Waybill here). Must tolerate repeats. */
  onCaptured(purchaseRef: string, paymentId: string): Promise<void>
}

export const BOOKING_SELLER = Symbol('BOOKING_SELLER')
export const CARGO_SELLER = Symbol('CARGO_SELLER')

/** Feature 3b: getBooking(ref) plus the confirm contract. */
export interface BookingSeller extends PurchaseSeller {
  getBooking(reference: string): Promise<Purchase | null>
}

/** Feature 17: the cargo booking read plus the confirm contract. */
export interface CargoSeller extends PurchaseSeller {
  getCargoBooking(id: string): Promise<Purchase | null>
}
