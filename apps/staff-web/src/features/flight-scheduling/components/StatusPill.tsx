import { capitalize } from '../format'

// Pill for a status value; the colour comes from the fs-status-<status> class in flight-scheduling.css.
export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <span className={`fs-status fs-status-${status}`}>{label ?? capitalize(status)}</span>
}
