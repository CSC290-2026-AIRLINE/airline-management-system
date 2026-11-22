import type { CSSProperties } from 'react'
import { Card } from '@staff-web/components/ui/card'
import { Check } from 'lucide-react'
import type { StaffBookingStage } from './booking-stages'

interface StaffBookingStepperProps {
  stages: readonly StaffBookingStage[]
  /** The zero-based index of the stage the staff member is on. */
  current: number
}

/**
 * The progress bar of the staff booking flow: four stages on one rail that fills up to the current stage.
 *
 * The stages are not links. Staff move between them with the buttons of the step itself, so a click can never
 * lose the traveller details or the chosen seats.
 */
export function StaffBookingStepper({ stages, current }: StaffBookingStepperProps) {
  const style = { '--staff-step-progress': current } as CSSProperties

  return (
    <Card className="px-4 py-4 sm:px-6" role="navigation" aria-label="Staff booking progress">
      <p className="mb-3 text-xs text-muted-foreground sm:hidden">
        Step {current + 1} of {stages.length} · <strong className="font-semibold text-foreground">{stages[current]?.label}</strong>
      </p>
      <ol
        className="relative m-0 grid list-none grid-cols-4 p-0 before:absolute before:top-3.5 before:right-[12.5%] before:left-[12.5%] before:h-0.5 before:bg-border after:absolute after:top-3.5 after:left-[12.5%] after:h-0.5 after:w-[calc(var(--staff-step-progress)*25%)] after:bg-primary after:transition-[width] after:duration-300 motion-reduce:after:transition-none"
        style={style}
      >
        {stages.map((stage, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'upcoming'
          return (
            <li
              key={stage.label}
              className="relative z-10 flex flex-col items-center gap-1.5 px-1.5 text-center"
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span
                className={`flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold [&_svg]:size-3.5 ${
                  state === 'upcoming'
                    ? 'border-border bg-background text-muted-foreground'
                    : state === 'current'
                      ? 'border-primary bg-background text-primary ring-4 ring-primary/15'
                      : 'border-primary bg-primary text-primary-foreground'
                }`}
                aria-hidden="true"
              >
                {state === 'done' ? <Check /> : index + 1}
              </span>
              <span
                className={`hidden text-sm sm:block ${state === 'upcoming' ? 'text-muted-foreground' : state === 'current' ? 'font-semibold' : ''}`}
              >
                {stage.label}
              </span>
              <span className="hidden text-xs text-muted-foreground lg:block">{stage.hint}</span>
              <span className="sr-only">
                Step {index + 1} of {stages.length}
                {state === 'done' ? ', completed' : state === 'current' ? ', current step' : ', not started'}
              </span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
