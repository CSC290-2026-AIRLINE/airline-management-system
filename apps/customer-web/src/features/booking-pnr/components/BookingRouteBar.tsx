import { Card } from '@customer-web/components/ui/card'
import { Stepper } from '@customer-web/components/ui/stepper'

export type BookingStep = 1 | 2 | 3 | 4

/** @deprecated The booking steps are numbered like every other flow now; the icons are gone. Kept so callers still compile. */
export type RouteBarMarker = 'icons' | 'numbers'

const STEPS = ['Flights', 'Passengers', 'Seats and extras', 'Review and pay'] as const

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

/** The booking progress, on the shared stepper, inside a card. */
export function BookingRouteBar({ currentStep, onStepClick, clickableSteps }: BookingRouteBarProps) {
  return (
    <Card className="px-4 py-4 text-left sm:px-6">
      <Stepper
        steps={STEPS}
        current={currentStep - 1}
        aria-label="Booking progress"
        onStepClick={onStepClick ? (index) => onStepClick((index + 1) as BookingStep) : undefined}
        isClickable={clickableSteps ? (index) => clickableSteps.includes((index + 1) as BookingStep) : undefined}
      />
    </Card>
  )
}
