import type { PaymentStatus, RefundStatus, VoucherStatus } from './api'

export function formatMoney(amount: string | number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount))
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value))
}

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export type Tone = 'neutral' | 'good' | 'warn' | 'bad'

export function paymentStatusLabel(status: PaymentStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'created':
      return { label: 'Awaiting payment', tone: 'neutral' }
    case 'authorised':
      return { label: 'Processing', tone: 'warn' }
    case 'captured':
      return { label: 'Paid', tone: 'good' }
    case 'reversed':
      return { label: 'Refunded', tone: 'neutral' }
    case 'failed':
      return { label: 'Failed', tone: 'bad' }
    case 'voided':
      return { label: 'Cancelled, not charged', tone: 'bad' }
    case 'expired':
      return { label: 'Expired', tone: 'bad' }
    default: {
      const unknown: never = status
      return { label: unknown, tone: 'neutral' }
    }
  }
}

export function refundStatusLabel(status: RefundStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'requested':
      return { label: 'Requested', tone: 'neutral' }
    case 'pending_approval':
      return { label: 'Awaiting approval', tone: 'warn' }
    case 'approved':
    case 'processing':
      return { label: 'Processing', tone: 'warn' }
    case 'succeeded':
      return { label: 'Refunded', tone: 'good' }
    case 'failed':
      return { label: 'Failed', tone: 'bad' }
    case 'rejected':
      return { label: 'Declined', tone: 'bad' }
    default: {
      const unknown: never = status
      return { label: unknown, tone: 'neutral' }
    }
  }
}

export function voucherStatusLabel(status: VoucherStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'active':
      return { label: 'Active', tone: 'good' }
    case 'redeemed':
      return { label: 'Used', tone: 'neutral' }
    case 'expired':
      return { label: 'Expired', tone: 'bad' }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'bad' }
    default: {
      const unknown: never = status
      return { label: unknown, tone: 'neutral' }
    }
  }
}

const REASON_LABELS: Record<string, string> = {
  customer_cancel: 'Booking cancelled',
  flight_cancelled: 'Flight cancelled by the airline',
  rebook_difference: 'Rebooking difference',
  customer_request: 'Your request',
  staff_adjustment: 'Adjustment',
  compensation: 'Compensation',
  cargo_cancel: 'Cargo booking cancelled',
  cargo_rejected: 'Shipment rejected',
  cargo_reweigh: 'Re-weighed lower',
}

export function refundReasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason
}

const LINE_LABELS: Record<string, string> = {
  fare: 'Fare',
  award_fee: 'Taxes and carrier charges',
  seat_fee: 'Seat',
  baggage: 'Extra baggage',
  upgrade: 'Upgrade',
  onboard_order: 'Onboard order',
  insurance: 'Insurance',
  cargo_freight: 'Freight',
  cargo_surcharge: 'Surcharge',
}

export function lineTypeLabel(type: string): string {
  return LINE_LABELS[type] ?? type
}
