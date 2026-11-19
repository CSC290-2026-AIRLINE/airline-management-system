import { useEffect, useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect } from '@staff-web/components/ui/native-select'
import type { StaffApi } from '../api/index.ts'
import type { StaffCheckInView } from '../api/types.ts'
import { ErrorBanner } from './ErrorBanner.tsx'
import { MRZ_LENGTH, mrzLine, seatOptions } from './counter-steps.ts'
import { messageOf } from './errors.ts'
import { formatCabin } from '../domain/format.ts'
import { INPUT_LABEL, MUTED, PANEL, PANEL_TITLE, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_INPUT } from './styles.ts'

interface Props {
  api: StaffApi
  view: StaffCheckInView
  onUpdated: (view: StaffCheckInView) => void
}

/**
 * The passenger steps, done by the agent for a passenger who did not finish online: the passport, the seat and the
 * boarding pass. Bags and carry-on have their own panels.
 */
export function CheckInSteps({ api, view, onUpdated }: Props) {
  const { checkIn } = view
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [visaNumber, setVisaNumber] = useState('')
  const [seats, setSeats] = useState<Array<{ code: string; label: string }> | null>(null)
  const [seatCode, setSeatCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const started = checkIn.status === 'started'
  /** A seat can still be changed after the boarding pass was issued. */
  const seatOpen = (started || checkIn.status === 'checked_in') && checkIn.document !== null
  const flightId = checkIn.flight.id
  const cabin = checkIn.passenger.cabin
  const currentSeat = checkIn.seat?.code ?? null

  // The free seats are read again after every seat change, so the list never offers the seat just taken.
  useEffect(() => {
    if (!seatOpen) return
    let cancelled = false
    api
      .seatMap(flightId)
      .then((map) => {
        if (!cancelled) setSeats(seatOptions(map, cabin))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [api, flightId, cabin, seatOpen, currentSeat])

  if (!started && !seatOpen) return null

  const run = async (action: () => Promise<StaffCheckInView>, after?: () => void) => {
    setError(null)
    setBusy(true)
    try {
      onUpdated(await action())
      after?.()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const passportReady = line1.length === MRZ_LENGTH && line2.length === MRZ_LENGTH

  return (
    <Card className={`${PANEL} print:hidden`}>
      <h2 className={PANEL_TITLE}>Check-in at the counter</h2>

      {started ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void run(
              () => api.submitDocument(checkIn.id, { mrzLine1: line1, mrzLine2: line2, visaNumber: visaNumber.trim() || undefined }),
              () => {
                // The passport lines never stay on the screen once they were sent.
                setLine1('')
                setLine2('')
              },
            )
          }}
        >
          <p className={MUTED}>
            {checkIn.document
              ? `Passport on file (•••••${checkIn.document.numberLast4}). Enter the lines again to replace it.`
              : 'Passport: type the two lines at the bottom of the photo page, 44 characters each.'}
          </p>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mrz-line-1" className={INPUT_LABEL}>
              Passport line 1
            </Label>
            <Input
              id="mrz-line-1"
              className={`${TEXT_INPUT} w-[620px] font-mono`}
              value={line1}
              maxLength={MRZ_LENGTH}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setLine1(mrzLine(event.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mrz-line-2" className={INPUT_LABEL}>
              Passport line 2
            </Label>
            <Input
              id="mrz-line-2"
              className={`${TEXT_INPUT} w-[620px] font-mono`}
              value={line2}
              maxLength={MRZ_LENGTH}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setLine2(mrzLine(event.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="counter-visa-number" className={INPUT_LABEL}>
              Visa number (only when the destination needs a visa)
            </Label>
            <Input
              id="counter-visa-number"
              className={TEXT_INPUT}
              value={visaNumber}
              maxLength={32}
              autoComplete="off"
              onChange={(event) => setVisaNumber(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" className={`${SECONDARY_BUTTON} self-start`} disabled={!passportReady || busy}>
            Check passport
          </Button>
        </form>
      ) : null}

      {seatOpen ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void run(
              () => api.chooseSeat(checkIn.id, flightId, seatCode),
              () => setSeatCode(''),
            )
          }}
        >
          <Label htmlFor="counter-seat" className={INPUT_LABEL}>
            Seat ({formatCabin(cabin)}){currentSeat ? ` · now ${currentSeat}` : ''}
          </Label>
          {seats === null ? (
            <p className={MUTED}>Loading the free seats…</p>
          ) : seats.length === 0 ? (
            <p className={MUTED}>No free seat in this cabin.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <NativeSelect
                id="counter-seat"
                className="w-[260px]"
                value={seatCode}
                disabled={busy}
                onChange={(event) => setSeatCode(event.target.value)}
              >
                <option value="">Choose a seat</option>
                {seats.map((seat) => (
                  <option key={seat.code} value={seat.code}>
                    {seat.label}
                  </option>
                ))}
              </NativeSelect>
              <Button type="submit" variant="outline" className={SECONDARY_BUTTON} disabled={seatCode === '' || busy}>
                {currentSeat ? 'Change seat' : 'Assign seat'}
              </Button>
            </div>
          )}
        </form>
      ) : null}

      {started ? (
        <div className="flex flex-col gap-2">
          <p className={MUTED}>
            {checkIn.document
              ? 'A passenger with no seat gets a free one in their cabin when the check-in is completed.'
              : 'The passport comes first: the boarding pass is issued after it is checked.'}
          </p>
          <Button
            type="button"
            className={`${PRIMARY_BUTTON} self-start`}
            disabled={!checkIn.document || busy}
            onClick={() => void run(() => api.complete(checkIn.id))}
          >
            Complete check-in
          </Button>
        </div>
      ) : null}

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
    </Card>
  )
}
