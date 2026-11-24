import { Badge } from '@staff-web/components/ui/badge'
import { formatShortDateTime, STATE_STEP_BADGE_VARIANTS } from '../payment-copy'
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
    return <p className="text-sm text-muted-foreground">This payment has not moved yet.</p>
  }

  return (
    <ol>
      {steps.map((step) => (
        <li key={step.key} className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0 last:pb-0">
          <span className="text-sm text-muted-foreground tabular-nums">{formatShortDateTime(step.at)}</span>
          {/* The frames write the step in lower case, whatever the API calls it. */}
          <Badge variant={STATE_STEP_BADGE_VARIANTS[step.key] ?? 'secondary'} className="lowercase">
            {step.label}
          </Badge>
        </li>
      ))}
    </ol>
  )
}
