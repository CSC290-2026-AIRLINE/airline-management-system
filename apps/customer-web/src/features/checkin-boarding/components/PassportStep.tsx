import { useState } from 'react'
import type { FlowError } from './flow-error.ts'
import { MRZ_CHECKS, inlineMrzChecks, mrzLineReady } from './mrz-input.ts'
import { Message } from './Message.tsx'
import styles from './flow.module.css'

export function PassportStep({
  busy,
  error,
  onSubmit,
  onBack,
}: {
  busy: boolean
  error: FlowError | null
  onSubmit: (line1: string, line2: string, visaNumber?: string) => void
  onBack: () => void
}) {
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [visaNumber, setVisaNumber] = useState('')

  const needsVisa = error?.code === 'VISA_REQUIRED'
  const failedCheck = typeof error?.details?.failedCheck === 'string' ? error.details.failedCheck : null
  const ready = mrzLineReady(line1) && mrzLineReady(line2)
  const results = new Map(inlineMrzChecks(line2).map((check) => [check.name, check.ok]))
  const allDigitsPass = results.size === MRZ_CHECKS.length && [...results.values()].every(Boolean)

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(line1.trim().toUpperCase(), line2.trim().toUpperCase(), visaNumber.trim() || undefined)
      }}
    >
      <h2 className={styles.panelTitle}>Passport details</h2>
      <p className={styles.panelHint}>Type or paste the 2 lines at the bottom of your passport photo page.</p>

      <label className={styles.field}>
        <span className={styles.label}>Line 1</span>
        <input
          className={`${styles.input} ${styles.mrz}`}
          value={line1}
          onChange={(event) => setLine1(event.target.value.toUpperCase())}
          autoComplete="off"
          spellCheck={false}
          required
        />
        {mrzLineReady(line1) ? null : <span className={styles.counter}>Line 1: {line1.length} of 44 characters</span>}
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Line 2</span>
        <input
          className={`${styles.input} ${styles.mrz}`}
          value={line2}
          onChange={(event) => setLine2(event.target.value.toUpperCase())}
          autoComplete="off"
          spellCheck={false}
          required
        />
        {mrzLineReady(line2) ? null : <span className={styles.counter}>Line 2: {line2.length} of 44 characters</span>}
      </label>

      {needsVisa ? (
        <label className={styles.field}>
          <span className={styles.label}>Visa number</span>
          <input
            className={styles.input}
            value={visaNumber}
            onChange={(event) => setVisaNumber(event.target.value)}
            autoComplete="off"
            required
          />
          <span className={styles.counter}>This destination needs a visa. Our staff will verify the number.</span>
        </label>
      ) : null}

      <ul className={styles.checks} aria-label="Passport checks">
        {MRZ_CHECKS.map((check) => {
          const ok = results.get(check.name) ?? false
          const failed = failedCheck === check.name && !ok
          return (
            <li key={check.name} className={styles.check} data-ok={ok} data-failed={failed}>
              <span className={styles.checkMark} aria-hidden="true">
                {ok ? '✓' : '✕'}
              </span>
              <span className={styles.checkLabel}>{check.label}</span>
            </li>
          )
        })}
      </ul>

      {ready && allDigitsPass ? (
        <Message tone="success">All four check digits pass. Press Check passport to verify the document.</Message>
      ) : null}

      <div className={styles.actions}>
        <button className={styles.ghostButton} type="button" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button className={styles.button} type="submit" disabled={busy || !ready}>
          {busy ? 'Checking…' : 'Check passport'}
        </button>
      </div>
    </form>
  )
}
