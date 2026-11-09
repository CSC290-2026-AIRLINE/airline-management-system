export interface CancellationPreview {
  fee: number
  refund: number
  currency: string
  // Feature 11 supplies the miles; null until B8 wires the loyalty cancellation methods.
  milesReturned?: number | null
}

export interface CancelBookingResult {
  reference: string
  status: 'cancelled' | 'expired'
  fee: number
  refund: number
  currency: string
  milesReturned?: number | null
}
