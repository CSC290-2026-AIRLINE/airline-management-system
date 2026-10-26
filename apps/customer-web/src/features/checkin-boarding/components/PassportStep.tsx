import { useState } from 'react'
import { F6_MOCK } from '../api/index.ts'
import type { FlowError } from './flow-error.ts'
import { buildLine2, buildSpecimenLine2, SPECIMEN_LINE1 } from '../domain/mrz.ts'
import { MRZ_CHECKS, MRZ_LENGTH, inlineMrzChecks, mrzLineReady } from './mrz-input.ts'
import styles from './flow.module.css'

/** A valid MRZ whose passport number ends in 0000: the screening fixture holds that document. */
const HOLD_LINE2 = buildLine2({
  number: 'L89890000',
  nationality3: 'UTO',
  dob: '740812',
  sex: 'F',
  expiry: '300415',
  personal: 'ZE184226B<<<<<',
})

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
  // The demo starts from the specimen passport of the prototype.
  const [line1, setLine1] = useState(F6_MOCK ? SPECIMEN_LINE1 : '')
  const [line2, setLine2] = useState(F6_MOCK ? buildSpecimenLine2() : '')
  const [visaNumber, setVisaNumber] = useState('')

  const needsVisa = error?.code === 'VISA_REQUIRED'
  const failedCheck = typeof error?.details?.failedCheck === 'string' ? error.details.failedCheck : null
  const ready = mrzLineReady(line1) && mrzLineReady(line2)
  const results = new Map(inlineMrzChecks(line2).map((check) => [check.name, check.ok]))

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(line1.trim().toUpperCase(), line2.trim().toUpperCase(), visaNumber.trim() || undefined)
      }}
    >
      <h2 className={styles.panelTitle}>Passport details</h2>
      <p className={styles.panelHint}>
        Type the two machine readable lines from the passport data page. We only keep the last four characters of the passport number.
      </p>

      <label className={styles.field}>
        <span className={styles.label}>MRZ line 1</span>
        <input
          className={`${styles.input} ${styles.mrz}`}
          value={line1}
          onChange={(event) => setLine1(event.target.value.toUpperCase())}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <span className={styles.counter}>
          {line1.trim().length} / {MRZ_LENGTH}
        </span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>MRZ line 2</span>
        <input
          className={`${styles.input} ${styles.mrz}`}
          value={line2}
          onChange={(event) => setLine2(event.target.value.toUpperCase())}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <span className={styles.counter}>
          {line2.trim().length} / {MRZ_LENGTH}
        </span>
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
              <span aria-hidden="true">{ok ? '✓' : '✕'}</span> {check.label}
            </li>
          )
        })}
      </ul>

      {F6_MOCK ? (
        <div className={styles.helpers}>
          <span className={styles.helpersLabel}>Demo helpers</span>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() =>
              setLine2((current) =>
                current.length === MRZ_LENGTH ? current.slice(0, 27) + (current[27] === '0' ? '1' : '0') + current.slice(28) : current,
              )
            }
          >
            Try a typo
          </button>
          <button type="button" className={styles.ghostButton} onClick={() => setLine2(HOLD_LINE2)}>
            Try security hold
          </button>
        </div>
      ) : null}

      <div className={styles.actions}>
        <button className={styles.ghostButton} type="button" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button className={styles.button} type="submit" disabled={busy || !ready}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </div>
    </form>
  )
}
