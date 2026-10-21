import ProfileDialog from './ProfileDialog'
import removeIcon from '../assets/remove.svg'
export default function RemovePhotoDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return (
    <ProfileDialog title="Remove profile photo?" onClose={onClose} kind="profile-dialog--remove">
      <p>
        Your initials will be shown instead.<span className="profile-desktop"> You can upload a new photo any time.</span>
      </p>
      <footer>
        <button className="profile-button" onClick={onClose}>
          Cancel
        </button>
        <button className="profile-button profile-button--danger" onClick={onConfirm}>
          <img src={removeIcon} alt="" />
          Remove photo
        </button>
      </footer>
    </ProfileDialog>
  )
}
