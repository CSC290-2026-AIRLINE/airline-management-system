const STANDARD_PROGRESS_STEPS = ['Searching', 'Bag found', 'On its way', 'Back with you']
const LOST_PROGRESS_STEPS = ['Reported', 'Not found in 21 days']

export interface CaseProgressPresentation {
  steps: string[]
  activeStep: number
}

export function caseStatusLabel(status: string, deliveryStatus: string | null): string {
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'closed' || deliveryStatus === 'delivered') return 'Back with you'
  if (status === 'delivering' || deliveryStatus === 'in_transit' || deliveryStatus === 'ready_for_pickup') {
    return 'Being delivered'
  }
  if (status === 'lost') return 'Lost'
  if (status === 'matched' || deliveryStatus) return 'Owner confirmed'
  if (status === 'open') return 'Open'

  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function caseProgressPresentation(status: string, deliveryStatus: string | null): CaseProgressPresentation {
  if (status === 'closed' || deliveryStatus === 'delivered') return { steps: STANDARD_PROGRESS_STEPS, activeStep: 3 }
  if (status === 'delivering' || deliveryStatus === 'in_transit' || deliveryStatus === 'ready_for_pickup') {
    return { steps: STANDARD_PROGRESS_STEPS, activeStep: 2 }
  }
  if (status === 'lost') return { steps: LOST_PROGRESS_STEPS, activeStep: 1 }
  if (status === 'matched' || deliveryStatus) return { steps: STANDARD_PROGRESS_STEPS, activeStep: 1 }

  return { steps: STANDARD_PROGRESS_STEPS, activeStep: 0 }
}

export function shouldShowNoOpenCase(hasReport: boolean, isLookingUp: boolean, hasError: boolean): boolean {
  return !hasReport && !isLookingUp && !hasError
}

/**
 * The passenger may cancel ("I found it myself") only before staff confirm a found bag as theirs: an open case, or a lost
 * one no bag has been confirmed for. A delivery record only exists after that confirmation, so its presence also closes it.
 */
export function canReportBagFoundByPassenger(status: string, deliveryStatus: string | null = null): boolean {
  return (status === 'open' || status === 'lost') && deliveryStatus === null
}

export const CANCELLATION_UNAVAILABLE_MESSAGE =
  'Online cancellation is unavailable after staff confirms the bag is yours. Please contact airline staff if you need help changing your recovery arrangements.'

/** After staff confirm the bag is the passenger's, and until it is back with them, explain why there is no cancel option. */
export function shouldShowCancellationUnavailable(status: string, deliveryStatus: string | null): boolean {
  if (status === 'cancelled' || status === 'closed' || deliveryStatus === 'delivered') return false
  return status === 'matched' || status === 'delivering' || deliveryStatus !== null
}
