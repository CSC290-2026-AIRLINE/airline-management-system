import { useEffect, useId, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import type { AssistanceValue } from '../components/contracts'
import { AssistanceFields } from './AssistanceFields'
import controls from '../styles/controls.module.css'
import './assistance-request-dialog.css'

interface AssistanceRequestDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (request: AssistanceValue) => Promise<void>
  passengerName?: string
  flightLabel?: string
}

export function AssistanceRequestDialog({ open, onClose, onSubmit, passengerName, flightLabel }: AssistanceRequestDialogProps) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const [value, setValue] = useState<AssistanceValue>({ serviceCode: null, note: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    if (saving) return
    setValue({ serviceCode: null, note: '' })
    setError(null)
    onClose()
  }

  useEffect(() => {
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open, dialog])

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
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'ASSISTANCE_TOO_LATE') {
        setError('This request is too close to departure. Please contact the airline for help.')
      } else if (cause instanceof ApiError && cause.code === 'SEAT_NOT_ALLOWED') {
        setError('Please choose a seat outside the exit row before requesting assistance.')
      } else {
        setError('We could not submit your request. Please check the details and try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog
      ref={setDialog}
      className="assistance-request-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          event.target === event.currentTarget &&
          (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)
        )
          close()
      }}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <h2 id={titleId}>Request assistance</h2>
      <p id={descriptionId} className="assistance-request-dialog__context">
        {passengerName ? `${passengerName} · ` : ''}
        {flightLabel ?? 'Staff will review your request and update its status in your booking.'}
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <AssistanceFields value={value} onChange={setValue} disabled={saving} popupContainer={dialog} />
        {error && <p role="alert">{error}</p>}
        <div className="assistance-request-dialog__actions">
          <button className={controls.secondary} type="button" onClick={close} disabled={saving}>
            Cancel
          </button>
          <button className={controls.primary} type="submit" disabled={saving}>
            {saving ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
