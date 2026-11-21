import { Badge } from '@staff-web/components/ui/badge'
import { formatShortDateTime, STATE_STEP_BADGE_CLASSES } from '../payment-copy'
import type { PaymentStateStepDto } from '../types'

interface PaymentStateHistoryProps {
  steps: PaymentStateStepDto[]
}

/**
 * The state history the frames put on the payment record.
 *
 * Every step the payment went through, oldest first: the moment it happened on the left, the step's name in a pill on
 * the right. It is read-only by design — the states come from the provider's events and from the booking, never from a
 * person typing.
 */
export function PaymentStateHistory({ steps }: PaymentStateHistoryProps) {
  if (steps.length === 0) {
    return <p className="m-0 text-sm text-muted-foreground">This payment has not moved yet.</p>
  }

  return (
    <ol className="m-0 list-none p-0">
      {steps.map((step) => (
        <li key={step.key} className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0 last:pb-0">
          <span className="text-sm text-muted-foreground tabular-nums">{formatShortDateTime(step.at)}</span>
          {/* The frames write the step in lower case, whatever the API calls it. */}
          <Badge className={`lowercase ${STATE_STEP_BADGE_CLASSES[step.key] ?? 'bg-secondary text-muted-foreground'}`}>{step.label}</Badge>
        </li>
      ))}
    </ol>
  )
}
