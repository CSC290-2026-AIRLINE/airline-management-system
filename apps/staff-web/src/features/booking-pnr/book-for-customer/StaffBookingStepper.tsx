import type { CSSProperties } from 'react'
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
    <nav className="f3-staff-progress" aria-label="Staff booking progress">
      <p className="f3-staff-progress__caption">
        Step {current + 1} of {stages.length} · <strong>{stages[current]?.label}</strong>
      </p>
      <ol className="f3-staff-progress__list" style={style}>
        {stages.map((stage, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'upcoming'
          return (
            <li
              key={stage.label}
              className="f3-staff-progress__step"
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="f3-staff-progress__marker" aria-hidden="true">
                {state === 'done' ? <Check /> : index + 1}
              </span>
              <span className="f3-staff-progress__label">{stage.label}</span>
              <span className="f3-staff-progress__hint">{stage.hint}</span>
              <span className="f3-staff-progress__sr-only">
                Step {index + 1} of {stages.length}
                {state === 'done' ? ', completed' : state === 'current' ? ', current step' : ', not started'}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
