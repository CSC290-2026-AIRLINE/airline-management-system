import type { ServiceCode, ServiceRequestQueueItem, ServiceRequestStatus } from '../api/types'

export interface AssistanceQueueProps {
  requests: ServiceRequestQueueItem[]
  statusFilter: ServiceRequestStatus | 'all'
  onStatusFilterChange: (status: ServiceRequestStatus | 'all') => void
  onSelect: (requestId: string) => void
}

export interface AssistanceRequestDetailProps {
  request: ServiceRequestQueueItem
  onAccept: () => void
  onReject: (reason: string) => void
  onComplete: () => void
}

export interface ServiceCodeBadgeProps {
  code: ServiceCode
}
