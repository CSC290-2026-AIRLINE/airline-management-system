import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Checkbox } from '@staff-web/components/ui/checkbox'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Field, FieldLabel } from '@staff-web/components/ui/field'
import { Label } from '@staff-web/components/ui/label'
import { Table, TableBody, TableCell, TableRow } from '@staff-web/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { useBookingPnrApi } from '../api/client'
import type { BookingDetail, CancelPreview } from '../api/types'
import { lookupMoney, lookupShortDate } from './lookup-utils'

interface Props {
  booking: BookingDetail
  onBack: () => void
  onSuccess: () => void
  onBusyChange: (busy: boolean) => void
}

/** "Somchai Wongchai and 1 other · FL203 · 12 Nov" — the line under the cancel title (frame 01p). */
function contextLine(booking: BookingDetail): string {
  const [lead, ...rest] = booking.passengers
  const names = lead ? `${lead.firstName} ${lead.lastName}` : 'the passenger'
  const others = rest.length > 0 ? ` and ${rest.length} other${rest.length === 1 ? '' : 's'}` : ''
  const segment = booking.segments[0]
  const flight = segment ? segment.flightNumber : ''
  const date = segment ? lookupShortDate(segment.depAt, segment.originTimeZone) : ''
  return [names + others, flight, date].filter(Boolean).join(' · ')
}

export function StaffCancelForm({ booking, onBack, onSuccess, onBusyChange }: Props) {
  const currentApi = useBookingPnrApi(),
    api = useRef(currentApi)
  const [preview, setPreview] = useState<CancelPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [waiveFee, setWaiveFee] = useState(false)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  /* The form lives in a modal dialog. The dropdown menu opens inside it, so it stays above the dialog and in its
     focus trap. */
  const form = useRef<HTMLFormElement>(null)
  const [dialog, setDialog] = useState<HTMLElement | null>(null)
  useEffect(() => {
    api.current = currentApi
  }, [currentApi])
  useEffect(() => {
    setDialog(form.current?.closest<HTMLElement>('[role="dialog"]') ?? null)
  }, [])
  useEffect(() => {
    let active = true
    void api.current
      .getStaffCancelPreview(booking.reference)
      .then((value) => {
        if (active) setPreview(value)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Cancellation preview is unavailable. The booking has not changed.')
      })
    return () => {
      active = false
    }
  }, [booking.reference])
  async function cancel(event: FormEvent) {
    event.preventDefault()
    if (!preview || !reason || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    onBusyChange(true)
    setError(null)
    let success = false
    try {
      await api.current.cancelStaffBooking(booking.reference, { reason, waiveFee })
      success = true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Cancellation failed. Please check the booking before trying again.')
    } finally {
      inFlight.current = false
      setBusy(false)
      onBusyChange(false)
    }
    if (success) onSuccess()
  }
  return (
    <form ref={form} className="flex flex-col gap-4" onSubmit={(event) => void cancel(event)} aria-label="Staff cancellation">
      <DialogHeader>
        <DialogTitle>Cancel booking {booking.reference}?</DialogTitle>
        <DialogDescription>{contextLine(booking)}</DialogDescription>
      </DialogHeader>
      {!preview && !error && (
        <p className="text-sm text-muted-foreground" role="status">
          Loading cancellation preview…
        </p>
      )}
      {preview && (
        <>
          <div className="rounded-lg border bg-muted/40">
            <Table>
              <TableBody>
                <TableRow className="hover:bg-transparent">
                  <TableCell>{booking.status === 'held' ? 'Unpaid booking total' : 'Total paid'}</TableCell>
                  <TableCell className="text-right tabular-nums">{lookupMoney(booking.total, booking.currency)}</TableCell>
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  <TableCell>Cancellation fee</TableCell>
                  <TableCell className="text-right text-danger tabular-nums">− {lookupMoney(preview.fee, preview.currency)}</TableCell>
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  <TableCell>Refund</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{lookupMoney(preview.refund, preview.currency)}</TableCell>
                </TableRow>
                {preview.milesReturned != null && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell>Miles returned</TableCell>
                    <TableCell className="text-right tabular-nums">{preview.milesReturned.toLocaleString()}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Field>
            <FieldLabel htmlFor="staff-cancel-reason">Reason (kept in the booking history)</FieldLabel>
            <Select value={reason} onValueChange={setReason} disabled={busy} required>
              <SelectTrigger id="staff-cancel-reason" className="w-full">
                <SelectValue placeholder="Choose a reason" />
              </SelectTrigger>
              <SelectContent container={dialog}>
                <SelectItem value="Customer request by phone">Customer request by phone</SelectItem>
                <SelectItem value="Customer request in person">Customer request in person</SelectItem>
                <SelectItem value="Booking correction">Booking correction</SelectItem>
                <SelectItem value="Other staff request">Other staff request</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="staff-cancel-waive"
              checked={waiveFee}
              disabled={busy}
              onCheckedChange={(checked) => setWaiveFee(checked === true)}
            />
            <Label htmlFor="staff-cancel-waive" className="cursor-pointer">
              Request a fee waiver
            </Label>
          </div>
          {waiveFee && (
            <p className="text-sm text-muted-foreground">
              The displayed amounts are the standard preview. The waiver is requested with cancellation; the cancellation service determines
              the final refund.
            </p>
          )}
        </>
      )}
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter className="border-t pt-4">
        <Button type="button" variant="outline" disabled={busy} onClick={onBack}>
          Keep booking
        </Button>
        <Button type="submit" variant="destructive" disabled={!preview || !reason || busy}>
          {busy ? 'Cancelling…' : 'Cancel booking'}
        </Button>
      </DialogFooter>
    </form>
  )
}
