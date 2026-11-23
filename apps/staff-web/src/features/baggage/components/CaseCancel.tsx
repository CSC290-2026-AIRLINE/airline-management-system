import { useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { errorMessage } from '../hooks/useFoundBags'
import { Field, FormError } from './primitives'

/** "Cancel case": for a case with no confirmed bag yet. Staff give the reason, which is kept with the change. */
export function CaseCancel({ caseNumber, onCancel }: { caseNumber: string; onCancel: (reason: string) => Promise<unknown> }) {
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reasonId = `cancel-reason-${caseNumber}`

  async function cancel() {
    if (!reason.trim()) {
      setError('Give a reason before you cancel the case.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onCancel(reason.trim())
    } catch (e: unknown) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (!asking) {
    return (
      <div className="flex justify-end">
        <Button type="button" variant="destructive" onClick={() => setAsking(true)}>
          Cancel case
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Reason for cancelling (required)" htmlFor={reasonId}>
        <Input
          id={reasonId}
          maxLength={500}
          autoFocus
          placeholder="e.g. Filed for a traveller who cannot reach the case"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <FormError message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            setAsking(false)
            setReason('')
            setError(null)
          }}
        >
          Keep case
        </Button>
        <Button type="button" variant="destructive" disabled={busy} onClick={() => void cancel()}>
          {busy ? 'Cancelling…' : `Cancel ${caseNumber}`}
        </Button>
      </div>
    </div>
  )
}
