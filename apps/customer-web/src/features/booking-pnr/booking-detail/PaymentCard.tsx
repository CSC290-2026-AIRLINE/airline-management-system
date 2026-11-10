import type { BookingDetail } from '../api/types'
import { formatMoney } from '../lib/format'
import styles from './PaymentCard.module.css'

/**
 * What was paid for the booking. The card details belong to checkout (feature 5a), so they are not shown yet.
 */
export function PaymentCard({ booking }: { booking: BookingDetail }) {
  const miles = booking.paymentType === 'miles'

  return (
    <section className={styles.card}>
      <h2>Payment</h2>

      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>Fares</dt>
          <dd>{formatMoney(booking.total, booking.currency)}</dd>
        </div>

        <div className={styles.row}>
          <dt>Paid with</dt>
          <dd className={styles.muted}>{miles ? 'Flython Miles' : 'Payment details come from checkout (feature 5a).'}</dd>
        </div>

        <div className={`${styles.row} ${styles.total}`}>
          <dt>Total</dt>
          <dd>{formatMoney(booking.total, booking.currency)}</dd>
        </div>
      </dl>

      <p className={styles.note}>
        Cancelling shows the fee and refund before you confirm. Refunds go back to the original card through refunds (feature 5b).
      </p>
    </section>
  )
}
