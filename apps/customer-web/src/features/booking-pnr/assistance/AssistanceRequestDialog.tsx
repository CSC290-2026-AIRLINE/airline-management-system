import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { AssistanceValue } from '../components/contracts'
import { AssistanceFields } from './AssistanceFields'
import './assistance-request-dialog.css'

interface AssistanceRequestDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (request: AssistanceValue) => Promise<void>
}

export function AssistanceRequestDialog({ open, onClose, onSubmit }: AssistanceRequestDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [value, setValue] = useState<AssistanceValue>({ serviceCode: null, note: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!value.serviceCode) {
      setError('Choose an assistance type before submitting.')
      return
    }
    if ((value.serviceCode === 'UMNR' || value.serviceCode === 'MEDA') && !value.note.trim()) {
      setError('Please add a note for the airport team.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ ...value, note: value.note.trim() })
      setValue({ serviceCode: null, note: '' })
      onClose()
    } catch {
      setError('We could not submit your request. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="assistance-request-dialog"
      aria-labelledby="assistance-request-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!saving) onClose()
      }}
    >
      <h2 id="assistance-request-title">Request assistance</h2>
      <form onSubmit={(event) => void submit(event)}>
        <AssistanceFields value={value} onChange={setValue} disabled={saving} />
        {error && <p role="alert">{error}</p>}
        <div className="assistance-request-dialog__actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
