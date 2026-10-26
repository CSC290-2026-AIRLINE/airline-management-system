import styles from './flow.module.css'

const STEPS = ['Find booking', 'Passport', 'Seat', 'Bags', 'Boarding pass']

export function Stepper({ step }: { step: number }) {
  return (
    <ol className={styles.steps} aria-label="Check-in progress">
      {STEPS.map((label, index) => {
        const number = index + 1
        const state = number < step ? 'done' : number === step ? 'current' : 'todo'
        return (
          <li key={label} className={styles.step} data-state={state} aria-current={number === step ? 'step' : undefined}>
            <span className={styles.dot} aria-hidden="true">
              {number < step ? '✓' : number}
            </span>
            <span className={styles.stepLabel}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}
