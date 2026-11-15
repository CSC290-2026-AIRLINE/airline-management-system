import { useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Checkbox } from '@staff-web/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { errorMessage, usePaymentsApi, type Payment, type StaffRefundReason } from '../api'
import { formatMoney } from '../format'
import { ErrorAlert, NoteField } from './common'

const REASONS: { value: StaffRefundReason; label: string }[] = [
  { value: 'staff_adjustment', label: 'Staff adjustment' },
  { value: 'customer_request', label: 'Customer request' },
  { value: 'rebook_difference', label: 'Partner rebook difference' },
]

/**
 * The staff refund form. Within policy the backend approves it at once; outside policy, after check-in or with a
 * waived fee it waits for an admin in the Refund Queue.
 */
export function StaffRefundDialog({
  payment,
  open,
  onOpenChange,
  onDone,
}: {
  payment: Payment
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (message: string) => void
}) {
  const api = usePaymentsApi()
  const refundable = payment.lines.map((l) => ({ ...l, room: Number(l.amount) - Number(l.refunded_amount) })).filter((l) => l.room > 0)
  const totalRoom = refundable.reduce((s, l) => s + l.room, 0)
  const [lineId, setLineId] = useState('')
  const [reason, setReason] = useState<StaffRefundReason>('staff_adjustment')
  const [method, setMethod] = useState<'original' | 'voucher'>('original')
  const [amount, setAmount] = useState('')
  const [waiveFee, setWaiveFee] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const cap = lineId ? (refundable.find((l) => l.id === lineId)?.room ?? 0) : totalRoom

  async function submit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0 || !/^\d+(\.\d{1,2})?$/.test(amount.trim()))
      return setError('Enter an amount above 0 with at most two decimals.')
    if (value > cap + 1e-9) return setError(`At most ${formatMoney(cap, payment.currency)} is still refundable.`)
    if (note.trim().length < 3) return setError('A reason is required.')
    setBusy(true)
    setError(null)
    try {
      const result = await api.createRefund({
        payment_id: payment.id,
        reason,
        method,
        amount: value,
        ...(lineId && { payment_line_id: lineId }),
        ...(waiveFee && { waive_fee: true }),
        note: note.trim(),
      })
      onDone(result.needs_approval ? 'Refund created. It is outside policy and waits for an admin approval.' : 'Refund approved and sent.')
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
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle className="m-0 font-sans text-lg font-semibold text-foreground">Refund payment</DialogTitle>
            <DialogDescription>
              Still refundable: {formatMoney(totalRoom, payment.currency)}. Refunds go to the original card; a voucher share comes back as a
              voucher.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="refund-line">Line</Label>
            <NativeSelect id="refund-line" value={lineId} onChange={(e) => setLineId(e.target.value)} className="w-full">
              <NativeSelectOption value="">Any line (in order)</NativeSelectOption>
              {refundable.map((l) => (
                <NativeSelectOption key={l.id} value={l.id}>
                  {l.description} — {formatMoney(l.room, payment.currency)} left
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="refund-reason">Reason</Label>
              <NativeSelect
                id="refund-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value as StaffRefundReason)}
                className="w-full"
              >
                {REASONS.map((r) => (
                  <NativeSelectOption key={r.value} value={r.value}>
                    {r.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-method">Pay as</Label>
              <NativeSelect
                id="refund-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as 'original' | 'voucher')}
                className="w-full"
              >
                <NativeSelectOption value="original">Original payment method</NativeSelectOption>
                <NativeSelectOption value="voucher">Voucher</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-amount">Amount ({payment.currency})</Label>
            <Input
              id="refund-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={cap.toFixed(2)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="refund-waive" checked={waiveFee} onCheckedChange={(v) => setWaiveFee(v === true)} />
            <Label htmlFor="refund-waive">Waive the cancellation fee (needs an admin approval)</Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-note">Reason for the record</Label>
            <NoteField id="refund-note" value={note} onChange={setNote} />
          </div>
          {error && <ErrorAlert message={error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create refund'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
