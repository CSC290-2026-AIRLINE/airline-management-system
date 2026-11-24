import { useEffect, useState, type FormEvent } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@customer-web/components/ui/alert'
import { Button } from '@customer-web/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@customer-web/components/ui/dialog'
import { Input } from '@customer-web/components/ui/input'
import { Label } from '@customer-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/select'
import { useRefundsApi } from '../api/refunds'
import { formatAmount } from '../format'
import type { MyRefundDto, RefundablePaymentDto } from '../types'

interface RefundRequestDialogProps {
  /** Opened from a receipt: only that booking is offered. Left out, every booking with something to refund is. */
  bookingReference?: string | null
  onClose: () => void
  /** Called after "View my refunds", so the page can show the new request. */
  onViewRefunds: () => void
  /** Called once a request has been sent, so the list behind the dialog can refresh. */
  onSent: () => void
}

/**
 * The "Request a refund" dialog (frames 03f and 03g), opened over the page.
 *
 * It asks the backend which payments of the customer's can still be refunded, and what is left on each line, so the
 * customer can only pick something real. The request is written to the `refund` table and waits in the staff queue, so
 * the reference on the "Request sent" step is the new refund's own and it shows up under "In progress".
 *
 * It is opened from "Request a refund" on My refunds, and from the same button on a receipt, which passes its booking.
 */
export function RefundRequestDialog({ bookingReference, onClose, onViewRefunds, onSent }: RefundRequestDialogProps) {
  const api = useRefundsApi()
  const [payments, setPayments] = useState<RefundablePaymentDto[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [paymentIndex, setPaymentIndex] = useState(0)
  const [lineIndex, setLineIndex] = useState(0)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<MyRefundDto | null>(null)

  const payment = payments?.[paymentIndex]
  const line = payment?.lines[lineIndex]

  useEffect(() => {
    let live = true
    api
      .listRefundable()
      .then((result) => {
        if (live) setPayments(bookingReference ? result.items.filter((item) => item.booking_reference === bookingReference) : result.items)
      })
      .catch((e: unknown) => {
        if (live) setLoadError(e instanceof Error ? e.message : 'We could not load what you can refund.')
      })
    return () => {
      live = false
    }
    // `api` is rebuilt every render, so it stays out of the list and the payments load once per booking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingReference])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!payment || !line) return
    if (reason.trim() === '') {
      setError('Tell us why you are asking for a refund.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      setSent(
        await api.requestRefund({
          booking_reference: payment.booking_reference,
          item: line.description,
          amount: line.remaining,
          reason: reason.trim(),
        }),
      )
      onSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The request could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="text-left sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request a refund</DialogTitle>
          <DialogDescription>
            Requests inside the fare rules are refunded automatically. Anything else goes to our staff, who reply within 2 working days.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <>
            <Alert>
              <AlertTitle>Request sent.</AlertTitle>
              <AlertDescription>
                Refund {sent.reference} for {formatAmount(sent.amount)} {sent.currency} is now awaiting review. We email you when it is
                decided.
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Done
              </Button>
              <Button type="button" onClick={onViewRefunds}>
                View my refunds
              </Button>
            </DialogFooter>
          </>
        ) : loadError ? (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : !payments ? (
          <p className="text-sm text-muted-foreground">Loading what you can refund…</p>
        ) : !payment || !line ? (
          <>
            <p className="text-sm text-muted-foreground">
              {bookingReference
                ? `Nothing on ${bookingReference} can be refunded right now.`
                : 'You have no paid items that can be refunded right now.'}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
            {payments.length > 1 ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="refund-booking">Booking</Label>
                <Select
                  value={String(paymentIndex)}
                  onValueChange={(value) => {
                    setPaymentIndex(Number(value))
                    setLineIndex(0)
                  }}
                >
                  <SelectTrigger id="refund-booking" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {payments.map((candidate, index) => (
                      <SelectItem key={candidate.booking_reference} value={String(index)}>
                        {candidate.booking_reference}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-sm">
                Booking <span className="font-medium">{payment.booking_reference}</span>
              </p>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="refund-item">Item to refund</Label>
              <Select value={String(lineIndex)} onValueChange={(value) => setLineIndex(Number(value))}>
                <SelectTrigger id="refund-item" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {payment.lines.map((candidate, index) => (
                    <SelectItem key={candidate.description} value={String(index)}>
                      {candidate.description} · {formatAmount(candidate.remaining)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="refund-reason">Reason</Label>
              <Input
                id="refund-reason"
                type="text"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value)
                  setError(null)
                }}
                maxLength={500}
                placeholder="Tell us why"
                aria-invalid={error !== null && reason.trim() === ''}
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Estimated return</span>
              <span className="font-semibold tabular-nums">
                {formatAmount(line.remaining)} {payment.currency}
              </span>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Send request'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
