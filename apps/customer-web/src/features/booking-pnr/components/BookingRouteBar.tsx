import type { CSSProperties } from 'react'
import { Armchair, Check, CreditCard, Plane, Users, type LucideIcon } from 'lucide-react'
import styles from './BookingRouteBar.module.css'
import '../styles/tokens.css'

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

export function BookingRouteBar({ currentStep, onStepClick, clickableSteps, marker = 'icons' }: BookingRouteBarProps) {
  const current = ROUTE.find((item) => item.step === currentStep) ?? ROUTE[0]
  // The rail fills from the first marker to the current one: 0, 1, 2 or 3 steps of 4.
  const style = { '--route-progress': currentStep - 1 } as CSSProperties

  return (
    <nav className={styles.bar} aria-label="Booking progress">
      <div className={styles.inner}>
        <p className={styles.caption}>
          <span>Step {currentStep} of 4</span>
          <span aria-hidden="true">·</span>
          <strong>{current.label}</strong>
        </p>
        <ol className={styles.list} style={style}>
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
            return (
              <li key={item.step} className={`${styles.step} ${styles[state]}`} aria-current={state === 'current' ? 'step' : undefined}>
                <span className={styles.srOnly}>
                  Step {item.step} of 4{state === 'done' ? ', completed' : ''}
                </span>
                {clickable && onStepClick ? (
                  <button
                    type="button"
                    className={styles.target}
                    onClick={() => onStepClick(item.step)}
                    aria-label={state === 'done' ? `Go back to ${item.label}` : `Go to ${item.label}`}
                  >
                    <span className={styles.marker}>{glyph}</span>
                    <span className={styles.label}>{item.label}</span>
                  </button>
                ) : (
                  <span className={styles.target}>
                    <span className={styles.marker}>{glyph}</span>
                    <span className={styles.label}>{item.label}</span>
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </nav>
  )
}
