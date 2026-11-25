import { CheckIcon } from 'lucide-react'
import { cn } from '@customer-web/lib/utils'

/**
 * The one stepper (redesign board 7), for every multi-step flow: Search, Check-in, Review and pay.
 * An ordered list. The active step is a filled navy circle with bold navy text, finished steps show a check, upcoming
 * steps are outlined and muted. Orange marks progress only, as the line behind finished steps. On a phone it becomes a
 * counter and a progress bar, so five labels never wrap; the list itself stays for screen readers.
 */
export function Stepper({
  steps,
  current,
  onStepClick,
  isClickable = (index) => index < current,
  className,
  'aria-label': ariaLabel = 'Progress',
}: {
  /** The step names, in order. */
  steps: readonly string[]
  /** The index of the active step, starting at 0. */
  current: number
  /** Makes a step a button, for flows where the customer can go back (or jump) to a step. */
  onStepClick?: (index: number) => void
  /** Which steps are buttons when `onStepClick` is set. By default the finished ones. */
  isClickable?: (index: number) => boolean
  className?: string
  'aria-label'?: string
}) {
  const next = steps[current + 1]
  return (
    <nav aria-label={ariaLabel} className={className}>
      <ol className="flex w-full items-center max-sm:sr-only">
        {steps.map((step, index) => {
          const done = index < current
          const active = index === current
          const marker = (
            <span
              aria-hidden
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold',
                active && 'border-navy bg-navy text-white',
                done && 'border-navy bg-card text-navy',
                !active && !done && 'border-control bg-card text-muted-foreground',
              )}
            >
              {done ? <CheckIcon className="size-4" /> : index + 1}
            </span>
          )
          const label = (
            <span
              className={cn(
                'text-sm whitespace-nowrap',
                active ? 'font-semibold text-navy' : done ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {step}
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
          )
          return (
            <li key={step} aria-current={active ? 'step' : undefined} className={cn('flex items-center gap-2.5', index > 0 && 'flex-1')}>
              {index > 0 ? (
                <span
                  aria-hidden
                  className={cn('mx-1 h-0.5 min-w-4 flex-1 rounded-full', index <= current ? 'bg-brand-accent' : 'bg-line')}
                />
              ) : null}
              {onStepClick && isClickable(index) && !active ? (
                <button
                  type="button"
                  onClick={() => onStepClick(index)}
                  aria-label={done ? `Go back to ${step}` : `Go to ${step}`}
                  className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md outline-none hover:[&>span:first-child]:border-link focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {marker}
                  {label}
                </button>
              ) : (
                <>
                  {marker}
                  {label}
                </>
              )}
            </li>
          )
        })}
      </ol>
      <div aria-hidden className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-semibold text-navy">
            Step {current + 1} of {steps.length}: {steps[current]}
          </span>
          {next ? <span className="text-muted-foreground">Next: {next}</span> : null}
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-line">
          <div className="h-full rounded-full bg-brand-accent" style={{ width: `${((current + 1) / steps.length) * 100}%` }} />
        </div>
      </div>
    </nav>
  )
}
