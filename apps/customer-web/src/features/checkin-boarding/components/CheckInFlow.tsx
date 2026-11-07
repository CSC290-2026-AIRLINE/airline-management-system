import { useState } from 'react'
import type { CheckInApi } from '../api/client.ts'
import type { BoardingPassView, CheckInView } from '../api/types.ts'
import { BagsStep } from './BagsStep.tsx'
import { BoardingPassStep } from './BoardingPassStep.tsx'
import { ErrorMessage } from './Message.tsx'
import { FindBookingStep } from './FindBookingStep.tsx'
import { PassportStep } from './PassportStep.tsx'
import { SeatStep } from './SeatStep.tsx'
import { Stepper } from './Stepper.tsx'
import { Summary } from './Summary.tsx'
import type { FlowError } from './flow-error.ts'
import { toFlowError } from './flow-error.ts'
import { windowStrip } from './window-strip.ts'
import styles from './flow.module.css'
import '../styles/tokens.css'

type Step = 1 | 2 | 3 | 4 | 5

const TITLES: Record<Step, string> = {
  1: 'Online check-in',
  2: 'Online check-in',
  3: 'Online check-in',
  4: 'How many bags are you checking in?',
  5: 'Your boarding pass',
}

const PASS_SUBTITLE = 'Gate and boarding time are read from the flight, so your pass always shows the current gate.'

const BEFORE_YOU_START = [
  'Your passport, valid for 6 months after travel',
  'A visa number, if your trip needs one',
  'How many bags you will check in',
]

/** The static card beside the find-booking form. */
function BeforeYouStart() {
  return (
    <aside className={styles.sideCard}>
      <h2 className={styles.sideTitle}>Before you start</h2>
      <ul className={styles.sideList}>
        {BEFORE_YOU_START.map((text) => (
          <li key={text}>
            <span className={styles.sideBullet} aria-hidden="true">
              •
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

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

  // The boarding pass has no summary beside it: it takes the whole row.
  const panelClass = step === 5 ? `${styles.panel} ${styles.panelWide}` : styles.panel
  const strip = checkIn ? windowStrip(checkIn.flight.depAt, new Date()) : null

  return (
    <div className={styles.flow}>
      <header className={styles.head}>
        {strip ? (
          <div className={styles.strip} data-open={strip.open}>
            {strip.open ? <strong className={styles.stripLabel}>Check-in open</strong> : null}
            <span>{strip.text}</span>
          </div>
        ) : null}
        <h1 className={styles.title}>{TITLES[step]}</h1>
        {step === 5 ? <p className={styles.subtitle}>{PASS_SUBTITLE}</p> : null}
      </header>

      <Stepper step={step} />

      <ErrorMessage error={error} />

      <div className={styles.layout}>
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

        {step === 1 ? <BeforeYouStart /> : null}
        {step > 1 && step < 5 && checkIn ? <Summary checkIn={checkIn} /> : null}
      </div>
    </div>
  )
}
