import { useEffect, useState, type FormEvent } from 'react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import { useRefundsApi } from '../api/refunds'
import { RefundsFrame } from '../components/RefundsFrame'
import { formatDateTime, formatMoney } from '../format'
import {
  COMPENSATION_FILTERS,
  COMPENSATION_KINDS,
  type CompensationEntryDto,
  type CompensationFilter,
  type CompensationKind,
  type CompensationListDto,
} from '../types'

const FILTER_LABELS: Record<CompensationFilter, string> = { all: 'All', vouchers: 'Vouchers', card_refunds: 'Card refunds' }
const KIND_LABELS: Record<CompensationKind, string> = { voucher: 'Voucher', card_refund: 'Card refund' }

/** The colour of a status word. The words come from the API; only the colour is decided here. */
function statusTone(label: string): string {
  switch (label) {
    case 'Active':
    case 'Refunded':
      return 'bg-emerald-100 text-emerald-900'
    case 'Expiring':
    case 'Paying to card':
      return 'bg-amber-100 text-amber-900'
    case 'Redeemed':
      return 'bg-[#EAF0FB] text-[#1E3A8A]'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

interface CompensationPageProps {
  filter: CompensationFilter
  onFilterChange: (filter: CompensationFilter) => void
}

/** Feature 5b: the staff compensation and vouchers page (frames 04 to 04e). */
export function CompensationPage({ filter, onFilterChange }: CompensationPageProps) {
  return (
    <RefundsFrame
      screenCode="f5.compensation_vouchers"
      screenName="Compensation & vouchers"
      title="Compensation & vouchers"
      description="Issue a voucher or a card refund, and manage vouchers."
    >
      <Compensation filter={filter} onFilterChange={onFilterChange} />
    </RefundsFrame>
  )
}

function Compensation({ filter, onFilterChange }: CompensationPageProps) {
  const api = useRefundsApi()
  const [search, setSearch] = useState('')
  const [data, setData] = useState<CompensationListDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [issuing, setIssuing] = useState(false)
  const [voiding, setVoiding] = useState<CompensationEntryDto | null>(null)

  useEffect(() => {
    let live = true
    api
      .listCompensation(filter, search)
      .then((result) => {
        if (!live) return
        setData(result)
        setError(null)
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'The history could not be loaded.')
      })
    return () => {
      live = false
    }
    // `api` is rebuilt every render, so it stays out of the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search, reload])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Compensation type" className="flex gap-1 rounded-lg bg-muted p-1">
          {COMPENSATION_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => onFilterChange(value)}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                filter === value ? 'bg-[#EAF0FB] text-[#1E3A8A]' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {FILTER_LABELS[value]}
              {data && <span className="ml-1.5 text-xs">· {data.counts[value]}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search booking, code or reason"
            aria-label="Search booking, code or reason"
            className="w-full sm:w-64"
          />
          <Button type="button" onClick={() => setIssuing(true)}>
            Issue compensation
          </Button>
        </div>
      </div>

      <div role="status" aria-live="polite" className="empty:hidden">
        {notice && (
          <Alert className="border-0 bg-emerald-50 text-emerald-900">
            <AlertDescription className="block font-medium text-emerald-900">{notice}</AlertDescription>
          </Alert>
        )}
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="block">{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="m-0 font-sans text-base font-semibold text-foreground">Compensation history</h2>
        <span className="text-sm text-muted-foreground">· all vouchers and card refunds</span>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Issued</TableHead>
              <TableHead>Booking</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Code / reference</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data && !error && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Loading history…
                </TableCell>
              </TableRow>
            )}
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Nothing here yet.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{formatDateTime(entry.issued_at)}</TableCell>
                <TableCell>{entry.booking_reference}</TableCell>
                <TableCell>{KIND_LABELS[entry.kind]}</TableCell>
                <TableCell className="font-mono text-sm">{entry.reference}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(entry.value, entry.currency)}</TableCell>
                <TableCell>{entry.reason}</TableCell>
                <TableCell>
                  <Badge className={cn('border-0', statusTone(entry.status_label))}>{entry.status_label}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {entry.can_void && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setVoiding(entry)}>
                      Void
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="m-0 text-sm text-muted-foreground">
        Vouchers can be voided until they are used. A card refund cannot be taken back once it is sent to the card. Refunds the customer
        asked for are in the Refund queue.
      </p>

      <IssueDialog
        open={issuing}
        onClose={() => setIssuing(false)}
        onIssued={(entry) => {
          setIssuing(false)
          setNotice(
            entry.kind === 'voucher'
              ? `Issued. Voucher ${entry.reference} for ${formatMoney(entry.value, entry.currency)} was added to booking ${entry.booking_reference}. Logged in the audit trail.`
              : `Issued. A card refund of ${formatMoney(entry.value, entry.currency)} is on its way for booking ${entry.booking_reference}. Logged in the audit trail.`,
          )
          setReload((n) => n + 1)
        }}
      />
      <VoidDialog
        entry={voiding}
        onClose={() => setVoiding(null)}
        onVoided={(entry) => {
          setVoiding(null)
          setNotice(`Voided. ${entry.reference} can no longer be used. Logged in the audit trail.`)
          setReload((n) => n + 1)
        }}
      />
    </div>
  )
}

/** The "Issue compensation" dialog: booking, kind, amount and reason. */
function IssueDialog({ open, onClose, onIssued }: { open: boolean; onClose: () => void; onIssued: (entry: CompensationEntryDto) => void }) {
  const api = useRefundsApi()
  const [booking, setBooking] = useState('')
  const [kind, setKind] = useState<CompensationKind>('voucher')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = Number(amount)
    if (!/^[A-Za-z0-9]{6}$/.test(booking.trim())) return setError('A booking reference is six letters or digits.')
    if (!(value > 0)) return setError('The amount must be above zero.')
    if (reason.trim() === '') return setError('A reason is required.')

    setBusy(true)
    setError(null)
    try {
      const entry = await api.issueCompensation({
        booking_reference: booking.trim().toUpperCase(),
        kind,
        amount: value,
        reason: reason.trim(),
      })
      setBooking('')
      setAmount('')
      setReason('')
      onIssued(entry)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'It could not be issued.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Issue compensation</DialogTitle>
            <DialogDescription>Issuing is logged in the audit trail with your name and the reason.</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="comp-booking">Booking (PNR)</Label>
            <Input
              id="comp-booking"
              value={booking}
              onChange={(event) => setBooking(event.target.value.toUpperCase())}
              maxLength={6}
              placeholder="M3XP9D"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comp-kind">Kind</Label>
            <select
              id="comp-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as CompensationKind)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {COMPENSATION_KINDS.map((value) => (
                <option key={value} value={value}>
                  {KIND_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comp-amount">Amount (USD)</Label>
            <Input
              id="comp-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="40.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comp-reason">Reason</Label>
            <Input
              id="comp-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              placeholder="Delay over 3 hours"
            />
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription className="block">{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Issuing…' : 'Issue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Confirms a void: it cannot be undone, so the reference is named. */
function VoidDialog({
  entry,
  onClose,
  onVoided,
}: {
  entry: CompensationEntryDto | null
  onClose: () => void
  onVoided: (entry: CompensationEntryDto) => void
}) {
  const api = useRefundsApi()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (!entry) return
    setBusy(true)
    setError(null)
    try {
      onVoided(await api.voidVoucher(entry.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'It could not be voided.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void voucher {entry?.reference}?</DialogTitle>
          <DialogDescription>
            It can no longer be used at checkout. This cannot be undone, and it is logged in the audit trail.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription className="block">{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={() => void confirm()} disabled={busy}>
            {busy ? 'Voiding…' : 'Void voucher'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
