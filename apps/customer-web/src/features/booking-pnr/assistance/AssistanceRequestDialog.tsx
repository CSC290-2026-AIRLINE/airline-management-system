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
  /* Whether the customer has tried to send the request. The messages under the fields wait for that, so the form is not
     red while it is still empty. */
  const [attempted, setAttempted] = useState(false)

  function close() {
    if (saving) return
    setValue({ serviceCode: null, note: '' })
    setError(null)
    setAttempted(false)
    onClose()
  }

  useEffect(() => {
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open, dialog])

  /** The message under each field that is wrong. */
  function problems(current: AssistanceValue): { type?: string; note?: string } {
    const found: { type?: string; note?: string } = {}
    if (!current.serviceCode) found.type = 'Choose an assistance type before submitting.'
    if ((current.serviceCode === 'UMNR' || current.serviceCode === 'MEDA') && !current.note.trim())
      found.note = 'Please add a note for the airport team.'
    return found
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAttempted(true)
    /* The problems are read here, not from the state, because the state only changes after this submit. */
    const found = problems(value)
    if (found.type || found.note) return
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

  /* The messages under the fields wait for the first try, so the form is not red while it is still empty. */
  const found = attempted ? problems(value) : {}

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
      <form onSubmit={(event) => void submit(event)} noValidate>
        <AssistanceFields
          value={value}
          onChange={setValue}
          disabled={saving}
          popupContainer={dialog}
          typeError={found.type}
          noteError={found.note}
        />
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
