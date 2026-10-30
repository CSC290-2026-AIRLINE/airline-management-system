import { useState } from 'react'
import { F6_MOCK } from '../api/index.ts'
import styles from './flow.module.css'

export function FindBookingStep({ busy, onSubmit }: { busy: boolean; onSubmit: (pnr: string, lastName: string) => void }) {
  const [pnr, setPnr] = useState(F6_MOCK ? 'ER204F' : '')
  const [lastName, setLastName] = useState(F6_MOCK ? 'Eriksson' : '')

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(pnr.trim(), lastName.trim())
      }}
    >
      <h2 className={styles.panelTitle}>Find your booking</h2>
      <p className={styles.panelHint}>Enter the 6-character booking reference and the surname exactly as on the booking.</p>

      <label className={styles.field}>
        <span className={styles.label}>Booking reference (PNR)</span>
        <input
          className={styles.input}
          value={pnr}
          onChange={(event) => setPnr(event.target.value.toUpperCase())}
          maxLength={8}
          autoComplete="off"
          required
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Surname</span>
        <input
          className={styles.input}
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          autoComplete="family-name"
          required
        />
      </label>

      <button className={styles.button} type="submit" disabled={busy || !pnr.trim() || !lastName.trim()}>
        {busy ? 'Searching…' : 'Find booking'}
      </button>
    </form>
  )
}
