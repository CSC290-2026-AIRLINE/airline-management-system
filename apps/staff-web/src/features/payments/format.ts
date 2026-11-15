import type { PaymentStatus, RefundStatus, VoucherStatus } from './api'

export function formatMoney(amount: string | number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount))
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info'

/** Badge classes per tone, on the app's soft status colours. */
export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-secondary text-muted-foreground',
  info: 'bg-secondary text-foreground',
  good: 'bg-success-soft text-success-strong',
  warn: 'bg-warning-soft text-warning',
  bad: 'bg-danger-soft text-danger',
}

export function paymentStatus(status: PaymentStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'created':
      return { label: 'Created', tone: 'neutral' }
    case 'authorised':
      return { label: 'Authorised', tone: 'warn' }
    case 'captured':
      return { label: 'Captured', tone: 'good' }
    case 'reversed':
      return { label: 'Reversed', tone: 'info' }
    case 'failed':
      return { label: 'Failed', tone: 'bad' }
    case 'voided':
      return { label: 'Voided', tone: 'bad' }
    case 'expired':
      return { label: 'Expired', tone: 'neutral' }
    default: {
      const unknown: never = status
      return { label: unknown, tone: 'neutral' }
    }
  }
}

export function refundStatus(status: RefundStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'requested':
      return { label: 'Requested', tone: 'info' }
    case 'pending_approval':
      return { label: 'Needs approval', tone: 'warn' }
    case 'approved':
      return { label: 'Approved', tone: 'info' }
    case 'processing':
      return { label: 'Processing', tone: 'info' }
    case 'succeeded':
      return { label: 'Succeeded', tone: 'good' }
    case 'failed':
      return { label: 'Failed', tone: 'bad' }
    case 'rejected':
      return { label: 'Rejected', tone: 'neutral' }
    default: {
      const unknown: never = status
      return { label: unknown, tone: 'neutral' }
    }
  }
}

export function voucherStatus(status: VoucherStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'active':
      return { label: 'Active', tone: 'good' }
    case 'redeemed':
      return { label: 'Redeemed', tone: 'neutral' }
    case 'expired':
      return { label: 'Expired', tone: 'neutral' }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'bad' }
    default: {
      const unknown: never = status
      return { label: unknown, tone: 'neutral' }
    }
  }
}

const REASONS: Record<string, string> = {
  customer_cancel: 'Customer cancel',
  flight_cancelled: 'Flight cancelled',
  rebook_difference: 'Rebook difference',
  customer_request: 'Customer request',
  staff_adjustment: 'Staff adjustment',
  compensation: 'Compensation',
  cargo_cancel: 'Cargo cancel',
  cargo_rejected: 'Cargo rejected',
  cargo_reweigh: 'Cargo re-weigh',
}

export function reasonLabel(reason: string): string {
  return REASONS[reason] ?? reason
}

export function purchaseLabel(p: { booking_reference?: string | null; cargo_booking_ref?: string | null; purchase_ref: string }): string {
  if (p.booking_reference) return `Booking ${p.booking_reference}`
  if (p.cargo_booking_ref) return `Cargo ${p.cargo_booking_ref}`
  return p.purchase_ref
}
