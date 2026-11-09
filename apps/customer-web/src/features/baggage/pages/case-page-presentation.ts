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

export function canReportBagFoundByPassenger(status: string): boolean {
  return status === 'open'
}
