import { cn } from '@staff-web/lib/utils'
import { formatDateTime } from '../payment-copy'
import type { PaymentStateStepDto } from '../types'

interface PaymentStateHistoryProps {
  steps: PaymentStateStepDto[]
}

/**
 * The state history the frames put on the payment record.
 *
 * Every step the payment went through, oldest first, with the moment it happened. It is read-only by design: the
 * states come from the provider's events and from the booking, never from a person typing.
 */
export function PaymentStateHistory({ steps }: PaymentStateHistoryProps) {
  if (steps.length === 0) {
    return <p className="m-0 text-sm text-muted-foreground">This payment has not moved yet.</p>
  }

  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {steps.map((step, index) => {
        const last = index === steps.length - 1
        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn('mt-1 size-2.5 shrink-0 rounded-full', last ? 'bg-primary ring-4 ring-primary/15' : 'bg-border')}
                aria-hidden="true"
              />
              {!last && <span className="w-px flex-1 bg-border" aria-hidden="true" />}
            </div>
            <div className={cn('flex flex-1 flex-col gap-0.5 pb-5', last && 'pb-0')}>
              <span className={cn('text-sm', last ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{step.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(step.at)}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
