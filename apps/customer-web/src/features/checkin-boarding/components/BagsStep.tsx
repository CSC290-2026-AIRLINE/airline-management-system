import { useState } from 'react'
import type { Cabin, CarryOnAllowance, CheckInView } from '../api/types.ts'
import { Message } from './Message.tsx'
import styles from './flow.module.css'

const MAX_BAGS = 10

// shortcut: carry-on rule is constant for every cabin per spec; upgrade when the customer API sends carryOn
const CARRY_ON: CarryOnAllowance = { maxKg: 7, maxLengthCm: 56, maxWidthCm: 36, maxHeightCm: 23 }

const FARE_LABEL: Record<Cabin, string> = {
  economy: 'Economy',
  premium_economy: 'Premium Economy',
  business: 'Business',
  first: 'First',
}

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
  const allowance = checkIn.allowance
  const carryOn = checkIn.carryOn ?? CARRY_ON
  // Without the allowance there is no honest number to show, so the copy stays general.
  const warning = allowance
    ? `Bags are weighed at bag drop. If they weigh more than ${allowance.freeKg} kg in total, you pay the extra fee there before your bag tag is printed. A bag over the max weight for your fare or over ${allowance.maxLinearCm} cm (length + width + height) is refused.`
    : 'Bags are weighed at bag drop. If they weigh more than your allowance, you pay the extra fee there before your bag tag is printed. A bag over the max weight for your fare is refused.'

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(count)
      }}
    >
      <h2 className={styles.panelTitle}>Baggage</h2>

      <div className={styles.tiles}>
        {allowance ? (
          <div className={styles.tile}>
            <span className={styles.tileLabel}>Checked baggage allowance</span>
            <span className={styles.tileValue}>{allowance.freeKg} kg</span>
            <span className={styles.tileNote}>{FARE_LABEL[checkIn.passenger.cabin]} fare</span>
          </div>
        ) : null}
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Carry-on allowance</span>
          <span className={styles.tileValue}>{carryOn.maxKg} kg</span>
          <span className={styles.tileNote}>
            1 bag, up to {carryOn.maxLengthCm} × {carryOn.maxWidthCm} × {carryOn.maxHeightCm} cm, checked at the counter or gate
          </span>
        </div>
      </div>

      <div className={styles.countRow}>
        <span className={styles.label}>How many bags will you check in?</span>
        <div className={styles.countGroup}>
          <button
            type="button"
            className={styles.countButton}
            onClick={() => setCount((value) => Math.max(0, value - 1))}
            disabled={count <= 0 || busy}
            aria-label="One bag less"
          >
            −
          </button>
          <output className={styles.countValue} aria-live="polite">
            {count}
          </output>
          <button
            type="button"
            className={styles.countButton}
            onClick={() => setCount((value) => Math.min(MAX_BAGS, value + 1))}
            disabled={count >= MAX_BAGS || busy}
            aria-label="One bag more"
          >
            +
          </button>
        </div>
      </div>

      <Message tone="warn">{warning}</Message>

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
