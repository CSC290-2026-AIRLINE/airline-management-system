import type { ServiceRequestStatus } from '../api/types'
import { StatusChip, type ChipTone } from '../components/StatusChip'

const labels: Record<ServiceRequestStatus, string> = {
  requested: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  completed: 'Completed',
}

const tones: Record<ServiceRequestStatus, ChipTone> = {
  requested: 'held',
  accepted: 'confirmed',
  rejected: 'cancelled',
  completed: 'completed',
}

export function AssistanceStatus({ status }: { status: ServiceRequestStatus }) {
  return <StatusChip label={labels[status]} tone={tones[status]} />
}
