import { useEffect, useState } from 'react'
import type { CheckInApi } from '../api/client.ts'
import type { CheckInView, SeatLock, SeatMap as SeatMapModel } from '../api/types.ts'
import { formatBaht } from '../format.ts'
import { SeatMap } from './SeatMap.tsx'
import type { FlowError } from './flow-error.ts'
import { toFlowError } from './flow-error.ts'
import styles from './flow.module.css'

/** The hold is a fixed 5 minute policy. */
const HOLD_MS = 5 * 60 * 1000

function clock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function SeatStep({
  api,
  checkIn,
  busy,
  onConfirm,
  onSkip,
  onBack,
  onError,
}: {
  api: CheckInApi
  checkIn: CheckInView
  busy: boolean
  onConfirm: (lockId: string) => void
  onSkip: () => void
  onBack: () => void
  onError: (error: FlowError) => void
}) {
  const [map, setMap] = useState<SeatMapModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [lock, setLock] = useState<SeatLock | null>(null)
  const [remaining, setRemaining] = useState(HOLD_MS)
  const [holding, setHolding] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .seatMap(checkIn.flight.id)
      .then((loaded) => {
        if (cancelled) return
        setMap(loaded)
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoading(false)
        onError(toFlowError(error))
      })
    return () => {
      cancelled = true
    }
  }, [api, checkIn.flight.id, onError])

  useEffect(() => {
    if (!lock) return
    const timer = window.setInterval(() => setRemaining((value) => (value > 0 ? value - 1000 : 0)), 1000)
    return () => window.clearInterval(timer)
  }, [lock])

  useEffect(() => {
    if (!lock || remaining > 0) return
    void api.releaseSeat(lock.id)
  }, [lock, remaining, api])

  async function pick(seatCode: string) {
    if (holding) return
    setHolding(true)
    try {
      if (lock) await api.releaseSeat(lock.id)
      const next = await api.holdSeat(checkIn.flight.id, { checkInId: checkIn.id, seatCode })
      setLock(next)
      // shortcut: expiresAt comes from the simulation clock, so the countdown runs from the
      // moment the hold arrives instead of comparing two different clocks.
      setRemaining(HOLD_MS)
    } catch (error) {
      onError(toFlowError(error))
    } finally {
      setHolding(false)
    }
  }

  const chosen = checkIn.seat?.code ?? null
  const expired = lock !== null && remaining <= 0
  const activeLock = expired ? null : lock

  return (
    <div className={styles.form}>
      <h2 className={styles.panelTitle}>Choose your seat</h2>
      <p className={styles.panelHint}>
        A seat is held for you for 5 minutes. Paid seats cost extra and the fee is collected with your baggage payment.
      </p>

      {loading ? (
        <p className={styles.state} role="status">
          Loading the seat map…
        </p>
      ) : null}

      {!loading && !map ? (
        <p className={styles.state} role="status">
          No seat map is available for this flight yet. You can still continue and we will assign a free seat.
        </p>
      ) : null}

      {map ? <SeatMap map={map} selected={activeLock?.seatCode ?? chosen} onPick={pick} disabled={holding || busy} /> : null}

      {activeLock ? (
        <p className={styles.timer} role="status">
          Seat {activeLock.seatCode} held for you · {clock(remaining)} left
          {activeLock.fee > 0 ? ` · ${formatBaht(activeLock.fee)} extra` : ''}
        </p>
      ) : null}

      {expired ? (
        <p className={styles.timer} role="status">
          Your seat hold expired. Pick a seat again.
        </p>
      ) : null}

      <div className={styles.actions}>
        <button className={styles.ghostButton} type="button" onClick={onBack} disabled={busy || holding}>
          Back
        </button>
        <button className={styles.ghostButton} type="button" onClick={onSkip} disabled={busy || holding}>
          No seat, assign me one
        </button>
        <button
          className={styles.button}
          type="button"
          onClick={() => activeLock && onConfirm(activeLock.id)}
          disabled={busy || !activeLock}
        >
          {activeLock && activeLock.fee > 0 ? `Keep this seat · ${formatBaht(activeLock.fee)}` : 'Keep this seat'}
        </button>
      </div>
    </div>
  )
}
