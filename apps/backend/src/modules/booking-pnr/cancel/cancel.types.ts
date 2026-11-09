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

/** B7 (D8): the amounts the staff dialog shows when the agent ticks "Waive fee". */
export interface StaffFeeWaiver {
  fee: number
  refund: number
}

/**
 * B7: the staff cancellation preview. It is the customer's preview plus the waiver, so the staff dialog can show
 * both the fee and the refund without working the arithmetic out itself.
 */
export interface StaffCancellationPreview extends CancellationPreview {
  feeWaiver: StaffFeeWaiver
}

/** B7: what a staff cancellation did. */
export interface StaffCancelBookingResult extends CancelBookingResult {
  // True when the agent waived the fee of a booking that was really cancelled.
  feeWaived: boolean
}
