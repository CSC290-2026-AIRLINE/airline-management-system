import type { ServiceRequestStatus } from '../api/types'
import './assistance-status.css'

const labels: Record<ServiceRequestStatus, string> = {
  requested: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  completed: 'Completed',
}

export function AssistanceStatus({ status }: { status: ServiceRequestStatus }) {
  return <span className={`assistance-status assistance-status--${status}`}>{labels[status]}</span>
}
