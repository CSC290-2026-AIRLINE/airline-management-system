import type { ReactNode } from 'react'
import { formatDateTime } from '../format.ts'
import type { FlowError } from './flow-error.ts'
import styles from './flow.module.css'

const TITLES: Record<string, string> = {
  WINDOW_CLOSED: 'Check-in is not open',
  ON_HOLD: 'This check-in is on hold',
  MRZ_INVALID: 'We could not read that passport',
  PASSPORT_EXPIRING: 'Your passport expires too soon',
  VISA_REQUIRED: 'A visa number is required',
  DUPLICATE_DOCUMENT: 'That document is already used',
  SEAT_TAKEN: 'That seat is taken',
  LOCK_EXPIRED: 'Your seat hold expired',
  NOT_FOUND: 'We could not find that booking',
  FORBIDDEN: 'Not allowed',
  EXCESS_UNPAID: 'The excess baggage fee is not paid',
  BAG_REFUSED: 'That bag cannot be accepted',
  INVALID_STATE: 'This step is not available yet',
}

/** The window is shown in Bangkok time, the airline's base. */
function windowText(details: Record<string, unknown> | undefined): ReactNode {
  const opensAt = typeof details?.opensAt === 'string' ? details.opensAt : null
  const closesAt = typeof details?.closesAt === 'string' ? details.closesAt : null
  if (!opensAt && !closesAt) return null
  return (
    <>
      {opensAt ? <>Check-in opens {formatDateTime(opensAt)}.</> : null}
      {closesAt ? <> It closes {formatDateTime(closesAt)}.</> : null}
    </>
  )
}

export function ErrorBanner({ error }: { error: FlowError | null }) {
  if (!error) return null

  const title = TITLES[error.code] ?? 'Something went wrong'
  const body = error.code === 'ON_HOLD' ? 'Please see an agent at the airport.' : error.message

  return (
    <div className={styles.banner} role="alert" data-code={error.code}>
      <strong className={styles.bannerTitle}>{title}</strong>
      <p className={styles.bannerBody}>
        {body}
        {error.code === 'WINDOW_CLOSED' ? windowText(error.details) : null}
      </p>
    </div>
  )
}
