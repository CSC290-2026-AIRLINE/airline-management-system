/** Feature 9's maintenance types, as the Mark for maintenance form offers them. */
export const MAINTENANCE_TYPES: { value: string; label: string }[] = [
  { value: 'a_check', label: 'A-check' },
  { value: 'b_check', label: 'B-check' },
  { value: 'c_check', label: 'C-check' },
  { value: 'd_check', label: 'D-check' },
  { value: 'unscheduled', label: 'Unscheduled' },
]

/**
 * A downtime reason for people: a maintenance type code (`a_check`) becomes its label (A-check); free text written by
 * staff is shown as it is, with its first letter capitalised.
 */
export function maintenanceReason(reason: string | null, status: string): string {
  if (!reason) return status === 'in_maintenance' ? 'In maintenance' : 'Grounded'
  const type = MAINTENANCE_TYPES.find((t) => t.value === reason.trim().toLowerCase())
  if (type) return type.label
  return reason.charAt(0).toUpperCase() + reason.slice(1)
}
