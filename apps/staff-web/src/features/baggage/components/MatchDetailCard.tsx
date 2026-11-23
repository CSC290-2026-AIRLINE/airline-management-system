import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
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
  formatFlightDate,
  isOpenMatch,
  matchLevelText,
  matchRef,
} from '../constants'
import { errorMessage } from '../hooks/useFoundBags'
import { CasePhoto } from './CasePhoto'
import { F10Card, Field, FormError, Pill } from './primitives'

type Verdict = 'same' | 'different' | 'none'

const CELL_TONES: Record<Verdict, string> = {
  same: 'bg-success-soft text-success-strong',
  different: 'bg-danger-soft text-danger',
  none: 'text-foreground',
}

/** Same or different when both sides have a value; nothing to compare otherwise. */
function compare(a: string | null, b: string | null): Verdict {
  if (!a || !b) return 'none'
  return a.trim().toLowerCase() === b.trim().toLowerCase() ? 'same' : 'different'
}

function shortName(staff: StaffName): string {
  return `${staff.firstName} ${staff.lastName.charAt(0)}.`
}

/** Who filed the case: the bag's owner, an account holder for a traveller on their booking, or the desk. */
function reportedBy(report: BagMatch['report']): string {
  const owner = `${report.passengerFirstName} ${report.passengerLastName}`
  if (report.reportedByStaff) return `by baggage staff for ${owner}`
  if (report.reportedByCustomerName) return `by ${report.reportedByCustomerName} for ${owner}`
  return `by ${owner}`
}

function Row({ label, report, bag, verdict }: { label: string; report: string; bag: string; verdict: Verdict }) {
  return (
    <TableRow className="border-b border-border last:border-b-0">
      <TableHead
        scope="row"
        className="h-auto px-0 whitespace-normal w-[110px] px-3 py-2.5 align-top text-sm font-medium text-muted-foreground"
      >
        {label}
      </TableHead>
      <TableCell className={cn('p-0 whitespace-normal', 'px-3 py-2.5 align-top text-base break-words', CELL_TONES[verdict])}>
        {report}
      </TableCell>
      <TableCell className={cn('p-0 whitespace-normal', 'px-3 py-2.5 align-top text-base break-words', CELL_TONES[verdict])}>
        {bag}
      </TableCell>
    </TableRow>
  )
}

/** "Comparison": the report and the found bag side by side, green where they agree and red where they do not. */
function Comparison({ match }: { match: BagMatch }) {
  const r = match.report
  const b = match.foundBag
  const sameFlight: Verdict = b.flightId ? (b.flightId === r.flightId ? 'same' : 'different') : 'none'
  const checked = b.checkedFlight
  const sameCheckedFlight: Verdict = checked ? (checked.flightId === r.flightId ? 'same' : 'different') : 'none'

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table className="w-full table-fixed border-collapse text-left">
        <TableHeader>
          <TableRow className="border-b border-border bg-muted text-sm font-medium text-foreground">
            <TableCell className="p-0 whitespace-normal w-[110px] px-3 py-2.5" />
            <TableHead scope="col" className="h-auto px-0 whitespace-normal px-3 py-2.5 font-medium">
              Report {caseShortNumber(r.caseNumber)}
            </TableHead>
            <TableHead scope="col" className="h-auto px-0 whitespace-normal px-3 py-2.5 font-medium">
              Found {bagRef(b.id)}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <Row label="Tag" report={r.tagNumber ?? 'No tag'} bag={b.tagNumber ?? 'No tag'} verdict={compare(r.tagNumber, b.tagNumber)} />
          <Row label="Flight" report={r.flightNumber} bag={b.flightNumber ?? 'Not known'} verdict={sameFlight} />
          <Row
            label="Booked flight"
            report={`${r.flightNumber} · ${formatFlightDate(r.flightDate)}`}
            bag={checked ? `${checked.flightNumber} · ${formatFlightDate(checked.flightDate)}` : 'Tag not on file'}
            verdict={sameCheckedFlight}
          />
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
            report={`Reported ${formatEventTime(r.reportedAt)} ${reportedBy(r)}`}
            bag={`Found ${formatEventTime(b.foundAt)}, now at ${b.currentAirport}`}
            verdict="none"
          />
        </TableBody>
      </Table>
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
      <Separator className="bg-border" />
      <Field label="Note (required)" htmlFor={noteId}>
        <Input
          id={noteId}
          maxLength={1000}
          placeholder="e.g. Tag and strap match; booking checked"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <FormError message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => void run(() => onReject(note.trim()))}
          className="border-destructive text-destructive hover:bg-danger-soft"
        >
          Not the same bag
        </Button>
        <Button type="button" disabled={busy} onClick={confirm}>
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
      // On phones the queue is on its own screen, so the prompt to pick a match is not needed there.
      <F10Card className="max-md:hidden">
        <p className="text-sm text-muted-foreground">Choose a match in the queue to compare the report with the found bag.</p>
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
        <h2 id="match-detail-title" className="m-0 font-sans text-2xl font-semibold tracking-tight text-foreground max-md:text-xl">
          {matchRef(match.id)}
        </h2>
        <Pill tone={MATCH_STATUS_TONES[match.status]}>{MATCH_STATUS_LABELS[match.status]}</Pill>
        <Pill tone={MATCH_LEVEL_TONES[match.level]}>{matchLevelText(match.level, match.reasons)}</Pill>
      </div>

      <Comparison match={match} />

      <CasePhoto
        key={`photo-${match.report.id}`}
        reportId={match.report.id}
        hasPhoto={match.report.hasPhoto}
        caseNumber={match.report.caseNumber}
      />

      <p className="text-sm text-muted-foreground">
        Booking {match.report.bookingReference}
        {match.linkedBy ? ` · linked by ${shortName(match.linkedBy)}` : ''}
      </p>

      {!open && reviewed && (
        <p className="rounded-lg bg-muted px-3.5 py-3 text-base break-words text-foreground">
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
          <Button asChild>
            <Link to="/baggage/lost-bag-cases" search={{ case: match.report.id, status: 'all' }}>
              Open case
            </Link>
          </Button>
          {match.status === 'confirmed' && (
            <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
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
