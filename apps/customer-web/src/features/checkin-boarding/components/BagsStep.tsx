import { useState } from 'react'
import { Button } from '@customer-web/components/ui/button'
import type { CarryOnAllowance, CheckInView } from '../api/types.ts'
import { cabinName } from '../format.ts'
import { Message } from './Message.tsx'
import styles from './flow.module.css'

const MAX_BAGS = 10

// shortcut: the published carry-on rule is only the fallback for a view without one; the API sends the rule of the cabin
const CARRY_ON: CarryOnAllowance = { maxKg: 7, maxLengthCm: 56, maxWidthCm: 36, maxHeightCm: 23 }

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
            <span className={styles.tileNote}>{cabinName(checkIn.passenger.cabin)} fare</span>
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
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setCount((value) => Math.max(0, value - 1))}
            disabled={count <= 0 || busy}
            aria-label="One bag less"
          >
            −
          </Button>
          <output className={styles.countValue} aria-live="polite">
            {count}
          </output>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setCount((value) => Math.min(MAX_BAGS, value + 1))}
            disabled={count >= MAX_BAGS || busy}
            aria-label="One bag more"
          >
            +
          </Button>
        </div>
      </div>

      <Message tone="warn">{warning}</Message>

      <div className={styles.actions}>
        <Button variant="outline" type="button" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Finishing…' : 'Finish check-in'}
        </Button>
      </div>
    </form>
  )
}
