import { useState } from 'react'
import { F6_MOCK } from '../api/index.ts'
import { Message } from './Message.tsx'
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
      <p className={styles.panelHint}>Enter the booking reference from your confirmation email and the surname on your passport.</p>

      <label className={styles.field}>
        <span className={styles.label}>Booking reference</span>
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

      <Message tone="info">Only paid bookings on flights that are not cancelled can be checked in.</Message>

      <button className={styles.button} type="submit" disabled={busy || !pnr.trim() || !lastName.trim()}>
        {busy ? 'Searching…' : 'Find booking'}
      </button>
    </form>
  )
}
