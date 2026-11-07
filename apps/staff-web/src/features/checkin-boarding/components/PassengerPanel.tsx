import { useState } from 'react'
import { Check, Dot, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import type { StaffApi } from '../api/index.ts'
import type { StaffCheckInView } from '../api/types.ts'
import { BagDrop } from './BagDrop.tsx'
import { CarryOnForm } from './CarryOnForm.tsx'
import { ErrorBanner } from './ErrorBanner.tsx'
import { IssuePills, Pill, StatusPill } from './pills.tsx'
import { messageOf } from './errors.ts'
import { formatCabin, formatDate, formatTime } from '../domain/format.ts'
import { INPUT_LABEL, MUTED, PANEL, PANEL_TITLE, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_INPUT } from './styles.ts'

interface Props {
  api: StaffApi
  view: StaffCheckInView
  onUpdated: (view: StaffCheckInView) => void
}

/** The design's status tile: a muted label with a tone icon and the value under it. */
const TILE_TONES: Record<string, { Icon: LucideIcon; color: string }> = {
  good: { Icon: Check, color: 'text-[#1e8e4e]' },
  warn: { Icon: TriangleAlert, color: 'text-[#995c05]' },
  bad: { Icon: X, color: 'text-[#d61313]' },
  neutral: { Icon: Dot, color: 'text-[#677287]' },
}

function StatusTile({ tone, label, value }: { tone: keyof typeof TILE_TONES; label: string; value: string }) {
  const { Icon, color } = TILE_TONES[tone]
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[#dbe2ea] bg-white px-4 py-3.5">
      <span className="flex items-center gap-1.5 text-xs font-normal text-[#677287]">
        <Icon className={`size-3 shrink-0 ${color}`} />
        {label}
      </span>
      <span className="text-sm font-medium text-[#0a1424]">{value}</span>
    </div>
  )
}

export function PassengerPanel({ api, view, onUpdated }: Props) {
  const { checkIn, boardingPass } = view
  const document = checkIn.document
  const [error, setError] = useState<string | null>(null)
  const [printedAt, setPrintedAt] = useState<string | null>(boardingPass?.printedAt ?? null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<StaffCheckInView>) => {
    setError(null)
    setBusy(true)
    try {
      onUpdated(await action())
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
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

  const group = boardingPass?.boardingGroup
  const cabin = formatCabin(checkIn.passenger.cabin)
  const held = checkIn.status === 'on_hold' || checkIn.status === 'denied'
  /** The passport must be valid for six months after the flight, so the tile is red when it is not. */
  const sixMonthsAfter = new Date(checkIn.flight.depAt)
  sixMonthsAfter.setMonth(sixMonthsAfter.getMonth() + 6)
  const passportOk = document ? new Date(document.expiryDate) >= sixMonthsAfter : false
  const visaChecked = Boolean(document?.visaCheckedAt)

  const tiles: Array<{ tone: keyof typeof TILE_TONES; label: string; value: string }> = [
    document
      ? {
          tone: passportOk ? 'good' : 'bad',
          label: 'Passport',
          value: `•••••${document.numberLast4} · valid to ${document.expiryDate.slice(0, 4)} · ${document.issuingCountry}`,
        }
      : { tone: 'bad', label: 'Passport', value: 'No document on file' },
    document?.visaRequired
      ? {
          tone: visaChecked ? 'good' : 'warn',
          label: 'Visa',
          value: `${document.visaNumber ?? 'No visa number'} · ${visaChecked ? 'checked' : 'to check'}`,
        }
      : { tone: 'neutral', label: 'Visa', value: 'Not needed' },
    {
      tone: checkIn.status === 'denied' ? 'bad' : held ? 'warn' : 'good',
      label: 'Security (Feature 7)',
      value: checkIn.status === 'denied' ? 'Denied' : held ? 'On hold' : 'Clear',
    },
    {
      tone: 'neutral',
      label: 'Seat',
      value: checkIn.seat ? `${checkIn.seat.code} · group ${group ?? '—'}` : 'Not chosen',
    },
    {
      tone: printedAt ? 'good' : 'neutral',
      label: 'Boarding pass',
      value: boardingPass ? (printedAt ? 'Printed' : 'Issued online · not printed') : 'Not issued',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <Card className={`${PANEL} print:hidden`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className={PANEL_TITLE}>
            {checkIn.passenger.firstName} {checkIn.passenger.lastName}
          </h2>
          <div className="flex items-center gap-2">
            <StatusPill status={checkIn.status} />
            <IssuePills issues={view.issues} />
          </div>
        </div>
        <p className={MUTED}>
          Booking {checkIn.booking.pnr} · {checkIn.flight.flightNumber} · {cabin} · Seat {checkIn.seat?.code ?? '—'} · Boarding group{' '}
          {group ?? '—'}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {tiles.map((tile) => (
            <StatusTile key={tile.label} tone={tile.tone} label={tile.label} value={tile.value} />
          ))}
        </div>
        {document?.nameMismatch ? (
          <p className={MUTED}>
            The name on the passport does not match the booking
            {document.nameMismatchClearedAt ? ` · cleared at ${formatTime(document.nameMismatchClearedAt)}` : ''}
          </p>
        ) : null}
        {document && document.profileDifferences.length > 0 ? (
          <p className={MUTED}>Profile differs: {document.profileDifferences.join(', ')}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {document?.nameMismatch && !document.nameMismatchClearedAt ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={SECONDARY_BUTTON}
              onClick={() => void run(() => api.clearMismatch(document.id))}
            >
              Clear mismatch
            </Button>
          ) : null}
        </div>
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      </Card>

      {document?.visaRequired ? (
        <Card className={`${PANEL} print:hidden`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className={PANEL_TITLE}>Visa check</h2>
            {visaChecked ? <Pill tone="good">Checked</Pill> : null}
          </div>
          <p className={MUTED}>
            The visa table says {document.nationality ?? '—'} → {checkIn.flight.destination.country} needs a visa. Check the number against
            the visa in the passport.
          </p>
          <div className="flex flex-col gap-1">
            <Label htmlFor="visa-number" className={INPUT_LABEL}>
              Visa number
            </Label>
            <Input
              id="visa-number"
              readOnly
              className={`${TEXT_INPUT} w-[460px]`}
              value={document.visaNumber ?? 'No visa number entered'}
            />
          </div>
          <Button
            type="button"
            className={`${PRIMARY_BUTTON} self-start`}
            disabled={visaChecked || !document.visaNumber || busy}
            onClick={() => void run(() => api.checkVisa(document.id))}
          >
            Visa checked
          </Button>
        </Card>
      ) : null}

      <div className="flex flex-col gap-6 print:hidden">
        <BagDrop api={api} view={view} onUpdated={onUpdated} />
        <CarryOnForm api={api} view={view} onUpdated={onUpdated} />
      </div>

      <Card className={PANEL}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className={PANEL_TITLE}>Boarding pass</h2>
          <Button type="button" className={`${PRIMARY_BUTTON} print:hidden`} disabled={!boardingPass} onClick={() => void printPass()}>
            Print boarding pass
          </Button>
        </div>
        {boardingPass ? (
          <p className={`${MUTED} print:hidden`}>
            Reference {boardingPass.reference} · Seat {boardingPass.seat} · Group {boardingPass.boardingGroup} · Gate{' '}
            {boardingPass.gate ?? '—'} · Boarding {formatTime(boardingPass.boardingAt)} (gate and time are read from the flight)
          </p>
        ) : (
          <p className={`${MUTED} print:hidden`}>No boarding pass yet.</p>
        )}
        {boardingPass ? (
          <dl className="m-0 hidden grid-cols-2 gap-x-6 gap-y-3 print:grid">
            {(
              [
                ['Passenger name', `${checkIn.passenger.firstName} ${checkIn.passenger.lastName}`],
                ['Flight', checkIn.flight.flightNumber],
                ['Date', formatDate(checkIn.flight.depAt)],
                ['Seat', boardingPass.seat],
                ['Gate', boardingPass.gate ?? '—'],
                ['Boarding time', formatTime(boardingPass.boardingAt)],
                ['Group', String(boardingPass.boardingGroup)],
                ['Reference', boardingPass.reference],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <dt className="text-xs font-normal uppercase tracking-wide text-[#677287]">{label}</dt>
                <dd className="m-0 text-sm font-medium text-[#0a1424]">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Card>
    </div>
  )
}
