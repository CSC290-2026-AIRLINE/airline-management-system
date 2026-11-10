import styles from './BookingStepper.module.css'
import '../styles/tokens.css'

type Step = 1 | 2 | 3 | 4

const STEPS = ['Flights', 'Passengers', 'Seats', 'Review & pay']

export function BookingStepper({ currentStep }: { currentStep: Step }) {
  return (
    <ol className={styles.stepper} aria-label="Booking progress">
      {STEPS.map((label, index) => {
        const step = (index + 1) as Step
        const state = step < currentStep ? 'done' : step === currentStep ? 'current' : 'upcoming'

        return (
          <li key={label} className={`${styles.step} ${styles[state]}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className={styles.circle} aria-hidden="true">
              {state === 'done' ? '✓' : step}
            </span>
            <span className={styles.label}>{label}</span>
            {index < STEPS.length - 1 ? <span className={styles.connector} aria-hidden="true" /> : null}
          </li>
        )
      })}
    </ol>
  )
}
