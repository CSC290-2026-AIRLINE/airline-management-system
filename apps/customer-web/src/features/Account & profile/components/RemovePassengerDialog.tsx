import ProfileDialog from './ProfileDialog'
import removeIcon from '../assets/remove.svg'
export default function RemovePassengerDialog({ name, onClose, onConfirm }: { name: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <ProfileDialog
      title={
        <>
          <span className="profile-desktop">Remove {name} from saved passengers?</span>
          <span className="profile-mobile">Remove {name}?</span>
        </>
      }
      onClose={onClose}
      kind="profile-dialog--remove"
    >
      <p>They won’t appear when you type a name while booking. Past bookings keep their details.</p>
      <footer>
        <button className="profile-button" onClick={onClose}>
          Cancel
        </button>
        <button className="profile-button profile-button--danger" onClick={onConfirm}>
          <img src={removeIcon} alt="" />
          Remove
        </button>
      </footer>
    </ProfileDialog>
  )
}
