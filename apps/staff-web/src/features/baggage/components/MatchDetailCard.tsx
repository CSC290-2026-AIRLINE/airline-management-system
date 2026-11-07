import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { Separator } from '@staff-web/components/ui/separator'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { cn } from '@staff-web/lib/utils'
import type { BagMatch, StaffName } from '../api/bag-matches'
import {
  BAG_TYPE_LABELS,
  MATCH_LEVEL_TONES,
  MATCH_STATUS_LABELS,
  MATCH_STATUS_TONES,
  bagRef,
  caseShortNumber,
  colourLabel,
  formatEventTime,
  isOpenMatch,
  matchLevelText,
  matchRef,
} from '../constants'
import { errorMessage } from '../hooks/useFoundBags'
import { F10Card, FIELD_BOX, Field, FormError, Pill } from './primitives'

type Verdict = 'same' | 'different' | 'none'

const CELL_TONES: Record<Verdict, string> = {
  same: 'bg-success-soft text-success-strong',
  different: 'bg-danger-soft text-danger',
  none: 'text-[#14213d]',
}

const OUTLINE_BUTTON =
  'h-auto rounded-lg border border-[#d8dce6] bg-white px-3.5 py-2 text-sm leading-normal font-semibold text-[#14213d] shadow-none hover:bg-[#f4f6fa]'

/** Same or different when both sides have a value; nothing to compare otherwise. */
function compare(a: string | null, b: string | null): Verdict {
  if (!a || !b) return 'none'
  return a.trim().toLowerCase() === b.trim().toLowerCase() ? 'same' : 'different'
}

function shortName(staff: StaffName): string {
  return `${staff.firstName} ${staff.lastName.charAt(0)}.`
}

function Row({ label, report, bag, verdict }: { label: string; report: string; bag: string; verdict: Verdict }) {
  return (
    <tr className="border-b border-[#eef0f4] last:border-b-0">
      <th scope="row" className="w-[110px] px-3 py-2.5 align-top text-sm font-medium text-[#677287]">
        {label}
      </th>
      <td className={cn('px-3 py-2.5 align-top text-base break-words', CELL_TONES[verdict])}>{report}</td>
      <td className={cn('px-3 py-2.5 align-top text-base break-words', CELL_TONES[verdict])}>{bag}</td>
    </tr>
  )
}

/** "Comparison": the report and the found bag side by side, green where they agree and red where they do not. */
function Comparison({ match }: { match: BagMatch }) {
  const r = match.report
  const b = match.foundBag
  const sameFlight: Verdict = b.flightId ? (b.flightId === r.flightId ? 'same' : 'different') : 'none'

  return (
    <div className="overflow-hidden rounded-lg border border-[#d8dce6]">
      <table className="w-full table-fixed border-collapse text-left">
        <thead>
          <tr className="border-b border-[#eef0f4] bg-[#eef0f4] text-sm font-medium text-[#14213d]">
            <td className="w-[110px] px-3 py-2.5" />
            <th scope="col" className="px-3 py-2.5 font-medium">
              Report {caseShortNumber(r.caseNumber)}
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              Found {bagRef(b.id)}
            </th>
          </tr>
        </thead>
        <tbody>
          <Row label="Tag" report={r.tagNumber ?? 'No tag'} bag={b.tagNumber ?? 'No tag'} verdict={compare(r.tagNumber, b.tagNumber)} />
          <Row label="Flight" report={r.flightNumber} bag={b.flightNumber ?? 'Not known'} verdict={sameFlight} />
          <Row
            label="Type"
            report={BAG_TYPE_LABELS[r.bagType]}
            bag={b.bagType ? BAG_TYPE_LABELS[b.bagType] : 'Not checked'}
            verdict={compare(r.bagType, b.bagType)}
          />
          <Row
            label="Colour"
            report={colourLabel(r.colour)}
            bag={b.colour ? colourLabel(b.colour) : 'Not checked'}
            verdict={compare(r.colour, b.colour)}
          />
          <Row label="Brand" report={r.brand ?? 'Not given'} bag={b.brand ?? 'Not given'} verdict={compare(r.brand, b.brand)} />
          <Row label="Details" report={r.description ?? 'None'} bag={b.description ?? 'None'} verdict="none" />
          <Row
            label="When / where"
            report={`Reported ${formatEventTime(r.reportedAt)} by ${r.passengerFirstName} ${r.passengerLastName}`}
            bag={`Found ${formatEventTime(b.foundAt)}, now at ${b.currentAirport}`}
            verdict="none"
          />
        </tbody>
      </table>
    </div>
  )
}

function ReviewForm({
  match,
  onConfirm,
  onReject,
}: {
  match: BagMatch
  onConfirm: (note: string) => Promise<void>
  onReject: (note: string) => Promise<void>
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const noteId = `match-note-${match.id}`

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e: unknown) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  function confirm() {
    if (!note.trim()) {
      setError('Add a note before you confirm the owner.')
      return
    }
    void run(() => onConfirm(note.trim()))
  }

  return (
    <>
      <Separator className="bg-[#d8dce6]" />
      <Field label="Note (required)" htmlFor={noteId}>
        <Input
          id={noteId}
          maxLength={1000}
          placeholder="e.g. Tag and strap match; booking checked"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={FIELD_BOX}
        />
      </Field>
      <FormError message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => void run(() => onReject(note.trim()))}
          className="h-auto rounded-lg border border-[#d61313] bg-white px-3.5 py-2 text-sm leading-normal font-semibold text-[#d61313] shadow-none hover:bg-danger-soft"
        >
          Not the same bag
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={confirm}
          className="h-auto rounded-lg bg-[#fca311] px-3.5 py-2 text-sm leading-normal font-semibold text-[#14213d] hover:bg-[#fca311]/90"
        >
          {busy ? 'Saving…' : 'Confirm owner'}
        </Button>
      </div>
    </>
  )
}

/** "Card / Match detail": frame 04 while the match is open, frame 05 once the owner is confirmed. */
export function MatchDetailCard({
  match,
  loading,
  onConfirm,
  onReject,
}: {
  match: BagMatch | undefined
  loading: boolean
  onConfirm: (id: string, note: string) => Promise<unknown>
  onReject: (id: string, note: string) => Promise<unknown>
}) {
  if (loading) {
    return (
      <F10Card aria-busy="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </F10Card>
    )
  }
  if (!match) {
    return (
      <F10Card>
        <p className="text-sm text-[#677287]">Choose a match in the queue to compare the report with the found bag.</p>
      </F10Card>
    )
  }

  const open = isOpenMatch(match.status)
  const passenger = `${match.report.passengerFirstName} ${match.report.passengerLastName}`
  const reviewed = match.reviewedBy && match.reviewedAt ? `${shortName(match.reviewedBy)}, ${formatEventTime(match.reviewedAt)}` : null

  return (
    <F10Card aria-labelledby="match-detail-title">
      {match.status === 'confirmed' && match.report.status === 'matched' && (
        <p role="status" className="rounded-lg bg-success-soft px-3.5 py-3 text-base text-success-strong">
          Confirmed. {passenger} can now choose home, hotel, another address or airport pickup in My bag case.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <h2 id="match-detail-title" className="m-0 font-sans text-[28px] font-bold tracking-[-1.4px] text-[#14213d]">
          {matchRef(match.id)}
        </h2>
        <Pill tone={MATCH_STATUS_TONES[match.status]}>{MATCH_STATUS_LABELS[match.status]}</Pill>
        <Pill tone={MATCH_LEVEL_TONES[match.level]}>{matchLevelText(match.level, match.reasons)}</Pill>
      </div>

      <Comparison match={match} />

      <p className="text-sm text-[#677287]">
        Booking {match.report.bookingReference}
        {match.linkedBy ? ` · linked by ${shortName(match.linkedBy)}` : ''}
      </p>

      {!open && reviewed && (
        <p className="rounded-lg bg-[#eef0f4] px-3.5 py-3 text-base break-words text-[#14213d]">
          {match.reviewNote ? `${reviewed}: ${match.reviewNote}` : `Rejected by ${reviewed}`}
        </p>
      )}

      {open && (
        <ReviewForm
          key={match.id}
          match={match}
          onConfirm={async (note) => void (await onConfirm(match.id, note))}
          onReject={async (note) => void (await onReject(match.id, note))}
        />
      )}

      {!open && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild className={OUTLINE_BUTTON}>
            <Link to="/baggage/lost-bag-cases" search={{ case: match.report.id, status: 'all' }}>
              Open case
            </Link>
          </Button>
          {match.status === 'confirmed' && (
            <Button
              asChild
              className="h-auto rounded-lg bg-[#14213d] px-3.5 py-2 text-sm leading-normal font-semibold text-white hover:bg-[#14213d]/90"
            >
              <Link to="/baggage/deliveries" search={{ case: match.report.id, status: 'all' }}>
                Go to Deliveries
              </Link>
            </Button>
          )}
        </div>
      )}
    </F10Card>
  )
}
