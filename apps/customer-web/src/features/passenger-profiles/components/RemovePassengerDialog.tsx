import ProfileDialog from '@customer-web/features/passenger-profiles/components/ProfileDialog'
import removeIcon from '@customer-web/features/passenger-profiles/assets/remove.svg'
import { useState } from 'react'
import { errorMessage } from '../profile-api'
export default function RemovePassengerDialog({
  name,
  onClose,
  onConfirm,
}: {
  name: string
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function remove() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onConfirm()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <ProfileDialog
      title={
        <>
          <span className="profile-desktop">Remove {name} from saved passengers?</span>
          <span className="profile-mobile">Remove {name}?</span>
        </>
      }
      onClose={() => {
        if (!busy) onClose()
      }}
      kind="profile-dialog--remove"
    >
      <p>They won’t appear when you type a name while booking. Past bookings keep their details.</p>
      {error && (
        <p className="profile-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <button className="profile-button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button className="profile-button profile-button--danger" disabled={busy} onClick={() => void remove()}>
          <img src={removeIcon} alt="" />
          {busy ? 'Removing…' : 'Remove'}
        </button>
      </footer>
    </ProfileDialog>
  )
}
