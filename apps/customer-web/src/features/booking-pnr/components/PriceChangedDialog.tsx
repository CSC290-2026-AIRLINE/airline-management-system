import type { PriceChangedDialogProps } from './contracts'
import { Dialog } from './Dialog'
import { formatMoney } from '../lib/format'
import controls from '../styles/controls.module.css'
import styles from './PriceChangedDialog.module.css'

export function PriceChangedDialog({ open, previousTotal, newTotal, currency, onContinue, onCancel }: PriceChangedDialogProps) {
  return (
    <Dialog
      open={open}
      title="The price has changed"
      description="Fares were updated since you searched. Nothing is held yet."
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={controls.secondary} onClick={onCancel}>
            Back to search
          </button>
          <button type="button" className={controls.primary} onClick={onContinue}>
            Continue at {formatMoney(newTotal, currency)}
          </button>
        </>
      }
    >
      <dl className={styles.amounts}>
        <div className={styles.row}>
          <dt className={styles.term}>Price you saw</dt>
          <dd className={styles.value}>{formatMoney(previousTotal, currency)}</dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.term}>New total</dt>
          <dd className={styles.newTotal}>{formatMoney(newTotal, currency)}</dd>
        </div>
      </dl>
    </Dialog>
  )
}
