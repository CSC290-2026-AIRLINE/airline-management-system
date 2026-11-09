// Wire shapes for the customer order routes. The parsing lives here
// so the controller stays thin and every boundary check has one home.

import { ApiErrorException } from '../../common/api-error'
import { F12_CABINS, type F12Cabin } from '../../common/mapping'

export interface CheckoutLineInput {
  productId: string
  quantity: number
  bookingPassengerId: string | null
}

export interface CheckoutInput {
  bookingId: string
  flightId: string
  cabin: F12Cabin
  lines: CheckoutLineInput[]
}

export interface ProductOrderLineDto {
  id: string
  productId: string
  productName: string
  category: string
  bookingPassengerId: string | null
  quantity: number
  unitPriceAmount: number
  priceBasis: string
  lineTotal: number
}

export type ProductOrderStatus = 'pending_payment' | 'confirmed' | 'cancelled' | 'expired'
export type ProductOrderPaymentStatus = 'none' | 'pending' | 'paid' | 'failed'

export interface ProductOrderDto {
  id: string
  bookingId: string
  flightId: string
  flightNumber: string
  cabin: string
  status: ProductOrderStatus
  totalAmount: number
  currency: string
  paymentId: string | null
  paymentStatus: ProductOrderPaymentStatus
  paidAt: string | null
  expiresAt: string
  cancelledAt: string | null
  createdAt: string
  lines: ProductOrderLineDto[]
}

export function parseCheckoutInput(body: unknown): CheckoutInput {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('LINE_INVALID', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  if (typeof b.bookingId !== 'string' || b.bookingId.length === 0) {
    throw new ApiErrorException('BOOKING_NOT_CONFIRMED', 'bookingId is required.', 400)
  }
  if (typeof b.flightId !== 'string' || b.flightId.length === 0) {
    throw new ApiErrorException('LINE_INVALID', 'flightId is required.', 400)
  }
  if (!(F12_CABINS as readonly string[]).includes(b.cabin as string)) {
    throw new ApiErrorException('LINE_INVALID', `cabin must be one of ${F12_CABINS.join(', ')}.`, 400)
  }
  if (!Array.isArray(b.lines) || b.lines.length === 0) {
    throw new ApiErrorException('LINE_INVALID', 'lines must be a non-empty array.', 400)
  }
  const lines: CheckoutLineInput[] = b.lines.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new ApiErrorException('LINE_INVALID', `lines[${i}] must be an object.`, 400)
    }
    const l = raw as Record<string, unknown>
    if (typeof l.productId !== 'string' || l.productId.length === 0) {
      throw new ApiErrorException('LINE_INVALID', `lines[${i}].productId is required.`, 400)
    }
    if (typeof l.quantity !== 'number' || !Number.isInteger(l.quantity) || l.quantity <= 0) {
      throw new ApiErrorException('LINE_INVALID', `lines[${i}].quantity must be a positive integer.`, 400)
    }
    const passengerId = typeof l.bookingPassengerId === 'string' && l.bookingPassengerId.length > 0 ? l.bookingPassengerId : null
    return { productId: l.productId, quantity: l.quantity, bookingPassengerId: passengerId }
  })
  return {
    bookingId: b.bookingId,
    flightId: b.flightId,
    cabin: b.cabin as F12Cabin,
    lines,
  }
}
