import { useState } from 'react'
import type { CheckInApi } from '../api/client.ts'
import type { BoardingPassView, CheckInView } from '../api/types.ts'
import { BagsStep } from './BagsStep.tsx'
import { BoardingPassStep } from './BoardingPassStep.tsx'
import { ErrorBanner } from './ErrorBanner.tsx'
import { FindBookingStep } from './FindBookingStep.tsx'
import { PassportStep } from './PassportStep.tsx'
import { SeatStep } from './SeatStep.tsx'
import { Stepper } from './Stepper.tsx'
import { Summary } from './Summary.tsx'
import type { FlowError } from './flow-error.ts'
import { toFlowError } from './flow-error.ts'
import styles from './flow.module.css'
import '../styles/tokens.css'

type Step = 1 | 2 | 3 | 4 | 5

export function CheckInFlow({ api }: { api: CheckInApi }) {
  const [step, setStep] = useState<Step>(1)
  const [checkIn, setCheckIn] = useState<CheckInView | null>(null)
  const [pass, setPass] = useState<BoardingPassView | null>(null)
  const [error, setError] = useState<FlowError | null>(null)
  const [busy, setBusy] = useState(false)

  async function start(pnr: string, lastName: string) {
    setBusy(true)
    setError(null)
    try {
      const view = await api.start({ pnr, lastName })
      setCheckIn(view)
      setStep(2)
    } catch (failure) {
      setError(toFlowError(failure))
    } finally {
      setBusy(false)
    }
  }

  async function submitDocument(line1: string, line2: string, visaNumber?: string) {
    if (!checkIn) return
    setBusy(true)
    setError(null)
    try {
      const view = await api.submitDocument(checkIn.id, { mrzLine1: line1, mrzLine2: line2, visaNumber })
      setCheckIn(view)
      if (view.status === 'on_hold') {
        setError({ code: 'ON_HOLD', message: 'Please see an agent at the airport.' })
        return
      }
      setStep(3)
    } catch (failure) {
      setError(toFlowError(failure))
    } finally {
      setBusy(false)
    }
  }

  async function confirmSeat(lockId: string) {
    if (!checkIn) return
    setBusy(true)
    setError(null)
    try {
      const view = await api.confirmSeat(checkIn.id, { lockId })
      setCheckIn(view)
      setStep(4)
    } catch (failure) {
      setError(toFlowError(failure))
    } finally {
      setBusy(false)
    }
  }

  async function declareBags(declaredBags: number) {
    if (!checkIn) return
    setBusy(true)
    setError(null)
    try {
      const view = await api.declareBags(checkIn.id, { declaredBags })
      setCheckIn(view)
      setPass(await api.complete(checkIn.id))
      setStep(5)
    } catch (failure) {
      setError(toFlowError(failure))
    } finally {
      setBusy(false)
    }
  }

  function startOver() {
    setStep(1)
    setCheckIn(null)
    setPass(null)
    setError(null)
  }

  // Steps 1 and 5 have no summary beside them: a narrow centred card, then the full row.
  const panelClass = step === 1 ? `${styles.panel} ${styles.panelSolo}` : step === 5 ? `${styles.panel} ${styles.panelWide}` : styles.panel

  return (
    <div className={styles.flow}>
      <header className={styles.head}>
        <h1 className={styles.title}>Online check-in</h1>
        <p className={styles.subtitle}>Check in for your flight, choose a seat and get your boarding pass.</p>
      </header>

      <Stepper step={step} />

      <ErrorBanner error={error} />

      <div className={styles.layout}>
        {checkIn && step < 5 ? <Summary checkIn={checkIn} /> : null}

        <div className={panelClass}>
          {step === 1 ? <FindBookingStep busy={busy} onSubmit={start} /> : null}

          {step === 2 && checkIn ? (
            <PassportStep
              busy={busy}
              error={error}
              onSubmit={submitDocument}
              onBack={() => {
                setError(null)
                setStep(1)
              }}
            />
          ) : null}

          {step === 3 && checkIn ? (
            <SeatStep
              api={api}
              checkIn={checkIn}
              busy={busy}
              onConfirm={confirmSeat}
              onSkip={() => {
                setError(null)
                setStep(4)
              }}
              onBack={() => {
                setError(null)
                setStep(2)
              }}
              onError={setError}
            />
          ) : null}

          {step === 4 && checkIn ? (
            <BagsStep
              checkIn={checkIn}
              busy={busy}
              onSubmit={declareBags}
              onBack={() => {
                setError(null)
                setStep(3)
              }}
            />
          ) : null}

          {step === 5 ? (
            pass ? (
              <BoardingPassStep pass={pass} onStartOver={startOver} />
            ) : (
              <p className={styles.state} role="status">
                Your boarding pass is being issued…
              </p>
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}
