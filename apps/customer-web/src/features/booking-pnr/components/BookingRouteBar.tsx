import type { CSSProperties } from 'react'
import { Armchair, Check, CreditCard, Plane, Users, type LucideIcon } from 'lucide-react'

export type BookingStep = 1 | 2 | 3 | 4

/** The marker inside the circle: an icon per step, or the step number. */
export type RouteBarMarker = 'icons' | 'numbers'

interface RouteStep {
  step: BookingStep
  label: string
  icon: LucideIcon
}

const ROUTE: RouteStep[] = [
  { step: 1, label: 'Flights', icon: Plane },
  { step: 2, label: 'Passengers', icon: Users },
  { step: 3, label: 'Seats', icon: Armchair },
  { step: 4, label: 'Review & pay', icon: CreditCard },
]

export interface BookingRouteBarProps {
  currentStep: BookingStep
  /** Called when a step is clicked, to go back to it. */
  onStepClick?: (step: BookingStep) => void
  /**
   * The steps that can be clicked. Without it only the finished steps are clickable, because a step the customer has
   * not reached cannot be opened. The review page names them all, so the customer can walk back and forth.
   */
  clickableSteps?: readonly BookingStep[]
  marker?: RouteBarMarker
}

// The circle of each step: done and current are filled, upcoming is an outline.
const MARKER: Record<'done' | 'current' | 'upcoming', string> = {
  done: 'border-primary bg-primary text-primary-foreground',
  current: 'border-primary bg-background text-primary ring-4 ring-primary/15',
  upcoming: 'border-border bg-background text-muted-foreground',
}
const LABEL: Record<'done' | 'current' | 'upcoming', string> = {
  done: 'text-foreground',
  current: 'font-semibold text-foreground',
  upcoming: 'text-muted-foreground',
}

export function BookingRouteBar({ currentStep, onStepClick, clickableSteps, marker = 'icons' }: BookingRouteBarProps) {
  const current = ROUTE.find((item) => item.step === currentStep) ?? ROUTE[0]
  // The rail fills from the first marker to the current one: 0, 1, 2 or 3 steps of 4.
  const style = { '--route-progress': currentStep - 1 } as CSSProperties

  return (
    <nav className="rounded-xl border bg-card px-4 py-4 text-left shadow-xs sm:px-6" aria-label="Booking progress">
      <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
        <span>Step {currentStep} of 4</span>
        <span aria-hidden="true">·</span>
        <strong className="font-semibold text-foreground">{current.label}</strong>
      </p>
      <ol
        className="relative grid list-none grid-cols-4 p-0 before:absolute before:top-4 before:right-[12.5%] before:left-[12.5%] before:h-0.5 before:bg-border after:absolute after:top-4 after:left-[12.5%] after:h-0.5 after:w-[calc(var(--route-progress)*25%)] after:bg-primary after:transition-[width] after:duration-300 motion-reduce:after:transition-none"
        style={style}
      >
        {ROUTE.map((item) => {
          const state = item.step < currentStep ? 'done' : item.step === currentStep ? 'current' : 'upcoming'
          const glyph =
            state === 'done' ? (
              <Check aria-hidden="true" />
            ) : marker === 'numbers' ? (
              <span aria-hidden="true">{item.step}</span>
            ) : (
              <item.icon aria-hidden="true" />
            )
          // A finished step can always be opened. The review page opens more than that, so it names the steps.
          const clickable = clickableSteps ? clickableSteps.includes(item.step) : state === 'done'
          const body = (
            <>
              <span
                className={`relative z-10 flex size-8 items-center justify-center rounded-full border-2 text-xs font-semibold [&_svg]:size-4 ${MARKER[state]}`}
              >
                {glyph}
              </span>
              <span className={`hidden text-xs sm:block sm:text-sm ${LABEL[state]}`}>{item.label}</span>
            </>
          )
          return (
            <li key={item.step} className="flex justify-center" aria-current={state === 'current' ? 'step' : undefined}>
              <span className="sr-only">
                Step {item.step} of 4{state === 'done' ? ', completed' : ''}
              </span>
              {clickable && onStepClick ? (
                <button
                  type="button"
                  className="flex cursor-pointer flex-col items-center gap-1.5 rounded-md bg-transparent p-1 outline-none hover:[&>span:first-child]:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => onStepClick(item.step)}
                  aria-label={state === 'done' ? `Go back to ${item.label}` : `Go to ${item.label}`}
                >
                  {body}
                </button>
              ) : (
                <span className="flex flex-col items-center gap-1.5 p-1">{body}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
