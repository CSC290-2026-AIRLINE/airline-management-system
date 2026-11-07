import type { BookingServiceRequest, ServiceCode, ServiceRequestStatus } from '../api/types'

export interface AssistanceQueueProps {
  requests: BookingServiceRequest[]
  statusFilter: ServiceRequestStatus | 'all'
  onStatusFilterChange: (status: ServiceRequestStatus | 'all') => void
  onSelect: (requestId: string) => void
}

export interface AssistanceRequestDetailProps {
  request: BookingServiceRequest
  onAccept: () => void
  onReject: (reason: string) => void
  onComplete: () => void
}

export interface ServiceCodeBadgeProps {
  code: ServiceCode
}
