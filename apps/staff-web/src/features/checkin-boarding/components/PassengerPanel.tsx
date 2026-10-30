import { useState } from 'react'
import type { StaffApi } from '../api/index.ts'
import type { StaffCheckInView } from '../api/types.ts'
import { BagDrop } from './BagDrop.tsx'
import { CarryOnForm } from './CarryOnForm.tsx'
import { ErrorBanner } from './ErrorBanner.tsx'
import { IssuePills, StatusPill } from './pills.tsx'
import { messageOf } from './errors.ts'
import { formatDate, formatTime } from '../domain/format.ts'
import ui from './ui.module.css'
import styles from './CounterPage.module.css'

interface Props {
  api: StaffApi
  view: StaffCheckInView
  onUpdated: (view: StaffCheckInView) => void
}

export function PassengerPanel({ api, view, onUpdated }: Props) {
  const { checkIn, boardingPass } = view
  const document = checkIn.document
  const [error, setError] = useState<string | null>(null)
  const [printedAt, setPrintedAt] = useState<string | null>(boardingPass?.printedAt ?? null)

  const run = async (action: () => Promise<StaffCheckInView>) => {
    setError(null)
    try {
      onUpdated(await action())
    } catch (err) {
      setError(messageOf(err))
    }
  }

  const printPass = async () => {
    if (!boardingPass) return
    setError(null)
    try {
      const pass = await api.printPass(boardingPass.id)
      setPrintedAt(pass.printedAt)
      window.print()
    } catch (err) {
      setError(messageOf(err))
    }
  }

  return (
    <div className={styles.passenger}>
      <section className={ui.panel}>
        <div className={ui.row}>
          <h2 className={ui.sectionTitle}>
            {checkIn.passenger.firstName} {checkIn.passenger.lastName}
          </h2>
          <StatusPill status={checkIn.status} />
          <span className={styles.pillRow}>
            <IssuePills issues={view.issues} />
          </span>
        </div>
        <p className={ui.sub}>
          PNR {checkIn.booking.pnr} · {checkIn.flight.flightNumber} {checkIn.flight.origin.code} → {checkIn.flight.destination.code} ·{' '}
          {checkIn.passenger.cabin} ({checkIn.passenger.fareClass})
          {checkIn.passenger.specialAssistance.length > 0 ? ` · ${checkIn.passenger.specialAssistance.join(', ')}` : ''}
        </p>
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      </section>

      <section className={ui.panel}>
        <h2 className={ui.sectionTitle}>Travel document</h2>
        {document ? (
          <>
            <div className={styles.fields}>
              <div>
                <span className={ui.label}>Passport</span>
                <span className={ui.mono}>•••• {document.numberLast4}</span>
              </div>
              <div>
                <span className={ui.label}>Issuing country</span>
                {document.issuingCountry.toUpperCase()}
              </div>
              <div>
                <span className={ui.label}>Nationality</span>
                {document.nationality ?? '—'}
              </div>
              <div>
                <span className={ui.label}>Expires</span>
                {formatDate(document.expiryDate)}
              </div>
              <div>
                <span className={ui.label}>Visa</span>
                {document.visaRequired ? (document.visaNumber ?? 'Not checked yet') : 'Not needed'}
              </div>
            </div>
            {document.nameMismatch ? (
              <p className={ui.sub}>
                The name on the passport does not match the booking
                {document.nameMismatchClearedAt ? ` · cleared at ${formatTime(document.nameMismatchClearedAt)}` : ''}
              </p>
            ) : null}
            {document.profileDifferences.length > 0 ? (
              <p className={ui.sub}>Profile differs: {document.profileDifferences.join(', ')}</p>
            ) : null}
            <div className={ui.actions}>
              {document.nameMismatch && !document.nameMismatchClearedAt ? (
                <button type="button" className={ui.btnGhost} onClick={() => void run(() => api.clearMismatch(document.id))}>
                  Clear name mismatch
                </button>
              ) : null}
              {document.visaRequired ? (
                <button type="button" className={ui.btnGhost} onClick={() => void run(() => api.checkVisa(document.id))}>
                  Visa checked
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <p className={ui.sub}>No travel document on file yet.</p>
        )}
      </section>

      <BagDrop api={api} view={view} onUpdated={onUpdated} />
      <CarryOnForm api={api} view={view} onUpdated={onUpdated} />

      <section className={ui.panel} data-print="keep">
        <h2 className={ui.sectionTitle}>Boarding pass</h2>
        {boardingPass ? (
          <>
            <div className={styles.fields}>
              <div>
                <span className={ui.label}>Reference</span>
                <span className={ui.mono}>{boardingPass.reference}</span>
              </div>
              <div>
                <span className={ui.label}>Seat</span>
                {boardingPass.seat}
              </div>
              <div>
                <span className={ui.label}>Gate</span>
                {boardingPass.gate ?? '—'}
              </div>
              <div>
                <span className={ui.label}>Boarding group</span>
                {boardingPass.boardingGroup}
              </div>
              <div>
                <span className={ui.label}>Departs</span>
                {formatTime(boardingPass.depAt)}
              </div>
              <div>
                <span className={ui.label}>Boarding</span>
                {formatTime(boardingPass.boardingAt)}
              </div>
              <div>
                <span className={ui.label}>Bags</span>
                {boardingPass.bags}
              </div>
              <div>
                <span className={ui.label}>Printed</span>
                {printedAt ? formatTime(printedAt) : 'Not printed'}
              </div>
            </div>
            <div className={ui.actions}>
              <button type="button" className={ui.btn} onClick={() => void printPass()}>
                Print boarding pass
              </button>
            </div>
          </>
        ) : (
          <p className={ui.sub}>No boarding pass yet.</p>
        )}
      </section>
    </div>
  )
}
