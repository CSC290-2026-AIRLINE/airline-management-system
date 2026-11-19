import { useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { errorMessage } from '../hooks/useFoundBags'
import { FIELD_BOX, Field, FormError } from './primitives'

const DANGER_BUTTON =
  'h-auto rounded-lg border border-[#d61313] bg-white px-3.5 py-2 text-sm leading-normal font-semibold text-[#d61313] shadow-none hover:bg-danger-soft'

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
        <Button type="button" onClick={() => setAsking(true)} className={DANGER_BUTTON}>
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
          className={FIELD_BOX}
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
          className="h-auto rounded-lg border border-[#d8dce6] bg-white px-3.5 py-2 text-sm leading-normal font-semibold text-[#14213d] shadow-none hover:bg-[#f4f6fa]"
        >
          Keep case
        </Button>
        <Button type="button" disabled={busy} onClick={() => void cancel()} className={DANGER_BUTTON}>
          {busy ? 'Cancelling…' : `Cancel ${caseNumber}`}
        </Button>
      </div>
    </div>
  )
}
