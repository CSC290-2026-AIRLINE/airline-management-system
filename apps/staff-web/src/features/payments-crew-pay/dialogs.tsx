import { useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { errorMessage } from './errors'
import { ErrorAlert } from './status-cards'
import type { CrewRef, PayRunDetail } from './api'
import { crewDisplayName, formatAmount, longDate, runLabel } from './format'

function CheckRow({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span
        className={
          ok
            ? 'shrink-0 rounded bg-success-soft px-1.5 py-0.5 text-[11px] font-semibold text-success-strong'
            : 'shrink-0 rounded bg-warning-soft px-1.5 py-0.5 text-[11px] font-semibold text-warning'
        }
      >
        {ok ? 'OK' : 'Needs action'}
      </span>
      <span>{children}</span>
    </div>
  )
}

/** "Approve October 2026 run?" with the before-you-approve checklist and, when needed, the override reason. */
export function ApproveDialog({
  run,
  open,
  onOpenChange,
  onApprove,
}: {
  run: PayRunDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onApprove: (reason?: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const creator = run.created_by.name.split(' ')[0]
  const adjusted = run.crew.filter((g) => g.lines.some((l) => l.line_type === 'adjustment')).map((g) => crewDisplayName(g.crew))
  const overLimit = Number(run.total) > Number(run.rules.pay_run_override_limit)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (run.needs_admin && reason.trim().length < 3) return setError('An override reason is required.')
    setBusy(true)
    setError(null)
    try {
      await onApprove(run.needs_admin ? reason.trim() : undefined)
      setReason('')
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle className="m-0 font-sans text-lg font-semibold text-foreground">
              Approve {runLabel(run.period_start, run.period_end)} run?
            </DialogTitle>
            <DialogDescription>
              Total {formatAmount(run.total)} {run.currency} for {run.crew.length} crew.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-md bg-muted/60 p-3">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground">BEFORE YOU APPROVE</p>
            <CheckRow ok={!run.is_creator}>
              {run.is_creator
                ? `You created this run, so another finance user must approve it.`
                : `Approver is different from the creator (${creator}).`}
            </CheckRow>
            {adjusted.length > 0 && (
              <CheckRow ok={false}>
                {adjusted.join(', ')} {adjusted.length === 1 ? 'has an adjustment' : 'have adjustments'}, so approval needs an override
                reason.
              </CheckRow>
            )}
            {overLimit && (
              <CheckRow ok={false}>
                The total is above the {formatAmount(run.rules.pay_run_override_limit)} {run.currency} limit, so approval needs an override
                reason.
              </CheckRow>
            )}
          </div>
          {run.needs_admin && (
            <div className="space-y-1.5">
              <Label htmlFor="override-reason">
                Override reason (required,{' '}
                {adjusted.length > 0 ? `${adjusted.length === 1 ? 'one line has' : 'lines have'} an adjustment` : 'above the limit'})
              </Label>
              <Input id="override-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          {error && <ErrorAlert message={error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || run.is_creator}>
              {busy ? 'Approving…' : 'Approve'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** "Pay October 2026 run?" */
export function PayDialog({
  run,
  open,
  onOpenChange,
  onPay,
}: {
  run: PayRunDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onPay: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const paying = run.crew.filter((g) => Number(g.net) > 0).length

  async function pay() {
    setBusy(true)
    setError(null)
    try {
      await onPay()
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="m-0 font-sans text-lg font-semibold text-foreground">
            Pay {runLabel(run.period_start, run.period_end)} run?
          </DialogTitle>
          <DialogDescription>
            This sends {formatAmount(run.total)} {run.currency} to {paying} crew. Paid lines cannot be changed afterwards.
          </DialogDescription>
        </DialogHeader>
        {error && <ErrorAlert message={error} />}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void pay()}>
            {busy ? 'Paying…' : 'Pay now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "Add adjustment": crew member and amount (negative to deduct). The spec also asks for a reason, so it has one. */
export function AdjustmentDialog({
  crew,
  currency,
  open,
  onOpenChange,
  onAdd,
}: {
  crew: (CrewRef & { employee_number?: string })[]
  currency: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (input: { crewId: string; amount: number; reason: string }) => Promise<void>
}) {
  const [crewId, setCrewId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!crewId) return setError('Choose a crew member.')
    if (!/^-?\d+(\.\d{1,2})?$/.test(amount.trim()) || Number(amount) === 0) {
      return setError('Enter a non-zero amount with at most two decimals (negative to deduct).')
    }
    if (reason.trim().length < 3) return setError('A reason is required.')
    setBusy(true)
    setError(null)
    try {
      await onAdd({ crewId, amount: Number(amount), reason: reason.trim() })
      setCrewId('')
      setAmount('')
      setReason('')
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle className="m-0 font-sans text-lg font-semibold text-foreground">Add adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="adj-crew">Crew member</Label>
            <NativeSelect id="adj-crew" value={crewId} onChange={(e) => setCrewId(e.target.value)} className="w-full">
              <NativeSelectOption value="">Choose…</NativeSelectOption>
              {crew.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {crewDisplayName(c)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-amount">Amount ({currency}, negative to deduct)</Label>
            <Input id="adj-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-50.00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">Reason</Label>
            <Input
              id="adj-reason"
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Hours corrected"
            />
          </div>
          {error && <ErrorAlert message={error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Adding…' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Not in the frames, but the spec needs it: a draft run for a period. Defaults to last month. */
export function NewRunDialog({
  open,
  onOpenChange,
  onCreate,
  accruedDates,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (start: string, end: string) => Promise<void>
  /** earned_on of every unpaid line not yet in a run; the period defaults to the months they fall in. */
  accruedDates: string[]
}) {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const sorted = accruedDates.map((d) => d.slice(0, 10)).sort()
  const earliest = sorted[0]
  const latest = sorted[sorted.length - 1]
  const first = earliest ? new Date(`${earliest}T00:00:00Z`) : new Date()
  const last = latest ? new Date(`${latest}T00:00:00Z`) : new Date()
  const [start, setStart] = useState(iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1))))
  const [end, setEnd] = useState(iso(new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0))))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (end < start) return setError('The period must end on or after its start.')
    if (earliest && end < earliest)
      return setError(`Choose a period end on or after ${longDate(earliest)}, when the earliest unpaid pay was earned.`)
    setBusy(true)
    setError(null)
    try {
      await onCreate(start, end)
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle className="m-0 font-sans text-lg font-semibold text-foreground">New pay run</DialogTitle>
            {earliest && (
              <DialogDescription>
                Unpaid pay was earned{' '}
                {earliest === latest ? `on ${longDate(earliest)}` : `from ${longDate(earliest)} to ${longDate(latest)}`}.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="run-start">Period start</Label>
              <Input id="run-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="run-end">Period end</Label>
              <Input id="run-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {error && <ErrorAlert message={error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
