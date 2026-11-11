import type { AircraftStatus } from '../types'

interface StatusDescriptor {
  label: string
  variant: 'green' | 'amber' | 'red'
}

/**
 * The `never` default makes a new backend status a compile error here instead of a blank badge.
 * At runtime the unknown value is shown as-is, so nothing disappears silently.
 */
function statusDescriptor(status: AircraftStatus): StatusDescriptor {
  switch (status) {
    case 'in_service':
      return { label: 'In service', variant: 'green' }
    case 'in_maintenance':
      return { label: 'In maintenance', variant: 'amber' }
    case 'grounded':
      return { label: 'Grounded', variant: 'red' }
    default: {
      const exhaustive: never = status
      return { label: exhaustive, variant: 'red' }
    }
  }
}

export function StatusBadge({ status }: { status: AircraftStatus }) {
  const descriptor = statusDescriptor(status)
  return <span className={`f9-badge f9-badge--${descriptor.variant}`}>{descriptor.label}</span>
}
