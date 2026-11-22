import { useState, type FormEvent } from 'react'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { DialogFooter } from '@staff-web/components/ui/dialog'
import { Label } from '@staff-web/components/ui/label'
import { Textarea } from '@staff-web/components/ui/textarea'
import { entryName, formatDate, listTypes, maskedPassport, type WatchlistEntry } from '../watchlist.types'
import { WatchlistDialog } from './WatchlistDialog'
import { nationalityLabel } from '../nationalities'

export function ClearEntryModal({
  entry,
  onCancel,
  onClear,
}: {
  entry: WatchlistEntry
  onCancel: () => void
  onClear: (reason: string) => Promise<void>
}) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const reason = String(new FormData(event.currentTarget).get('clearReason') ?? '').trim()
    if (!reason) {
      setError('Enter a reason for clearing this entry.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onClear(reason)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not clear entry.')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <WatchlistDialog
      title="Clear this watchlist entry?"
      description="Cleared entries stay on record and are excluded from active watchlist matches."
      onClose={() => {
        if (!submitting) onCancel()
      }}
      compact
    >
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0" disabled={submitting}>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">Entry to clear</p>
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="text-muted-foreground">
                {listTypes[entry.listType]} · {entry.issuingAuthority} · listed {formatDate(entry.listedAt)}
              </p>
              <strong className="block py-0.5">{entryName(entry)}</strong>
              <p className="text-muted-foreground">
                {formatDate(entry.dateOfBirth)} · {entry.nationality ? nationalityLabel(entry.nationality) : '—'} · passport{' '}
                {maskedPassport(entry.passportNumber)}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clear-reason">Reason for clearing (required)</Label>
            <Textarea
              id="clear-reason"
              name="clearReason"
              placeholder="e.g. Authority withdrew the case on 10 Nov"
              required
              maxLength={2000}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <p className="text-xs text-muted-foreground">
            Your name, the time and this reason are recorded on the entry and in Feature 15’s audit log.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive">
              {submitting ? 'Clearing…' : 'Clear entry'}
            </Button>
          </DialogFooter>
        </fieldset>
      </form>
    </WatchlistDialog>
  )
}
