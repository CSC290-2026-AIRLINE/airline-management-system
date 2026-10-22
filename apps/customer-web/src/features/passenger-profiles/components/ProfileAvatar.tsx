import { initials } from '@customer-web/features/passenger-profiles/profile-context'
export default function ProfileAvatar({ name, photo }: { name: string; photo: string | null }) {
  return (
    <div className="profile-avatar">
      {photo ? <img src={photo} alt={`${name} profile`} /> : <span aria-label={`${name} initials`}>{initials(name)}</span>}
    </div>
  )
}
