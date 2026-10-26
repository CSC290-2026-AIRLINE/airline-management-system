import { useState } from 'react'
import type { CheckInView } from '../api/types.ts'
import styles from './flow.module.css'

const MAX_BAGS = 10

/** Carry-on is the same in every cabin: 7 kg and 56 x 36 x 23 cm. */
const CARRY_ON = { maxKg: 7, length: 56, width: 36, height: 23 }

export function BagsStep({
  checkIn,
  busy,
  onSubmit,
  onBack,
}: {
  checkIn: CheckInView
  busy: boolean
  onSubmit: (declaredBags: number) => void
  onBack: () => void
}) {
  const [count, setCount] = useState(checkIn.declaredBags ?? 0)

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(count)
      }}
    >
      <h2 className={styles.panelTitle}>How many bags are you checking?</h2>
      <p className={styles.panelHint}>
        We weigh your checked bags at the counter and print a tag there. Excess fees are paid before the tag is printed.
      </p>

      <p className={styles.allowance}>
        <strong>Carry-on allowance</strong>
        <br />
        {CARRY_ON.maxKg} kg, up to {CARRY_ON.length} × {CARRY_ON.width} × {CARRY_ON.height} cm
      </p>

      <div className={styles.counterBox}>
        <span className={styles.label}>Checked bags</span>
        <div className={styles.stepper}>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => setCount((value) => Math.max(0, value - 1))}
            disabled={count <= 0 || busy}
            aria-label="One bag less"
          >
            −
          </button>
          <output className={styles.count} aria-live="polite">
            {count}
          </output>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => setCount((value) => Math.min(MAX_BAGS, value + 1))}
            disabled={count >= MAX_BAGS || busy}
            aria-label="One bag more"
          >
            +
          </button>
        </div>
      </div>

      <div className={styles.actions}>
        <button className={styles.ghostButton} type="button" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button className={styles.button} type="submit" disabled={busy}>
          {busy ? 'Finishing…' : 'Finish check-in'}
        </button>
      </div>
    </form>
  )
}
