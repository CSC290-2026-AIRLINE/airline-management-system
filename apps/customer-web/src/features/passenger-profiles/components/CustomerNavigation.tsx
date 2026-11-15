import { useId, useRef, useState } from 'react'
import { initials, useProfile } from '@customer-web/features/passenger-profiles/profile-context'

export default function CustomerNavigation() {
  const { profile } = useProfile()
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const toggle = useRef<HTMLButtonElement>(null)
  const name = `${profile.firstName} ${profile.lastName}`.trim() || 'Profile'
  function showProfile() {
    setOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return (
    <nav
      className="account-navigation"
      aria-label="Customer navigation"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          setOpen(false)
          toggle.current?.focus()
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <span className="account-navigation__logo">Airlines</span>
      <div className="account-navigation__desktop-links">
        <span>Book</span>
        <span>My Trips</span>
        <span>Membership</span>
        <span>Help</span>
        <button type="button" className="account-navigation__profile" onClick={showProfile} aria-current="page">
          <span className="account-navigation__avatar">{profile.photo ? <img src={profile.photo} alt="" /> : initials(name)}</span>
          Profile
        </button>
      </div>
      <div className="account-navigation__mobile-actions">
        <button
          type="button"
          className="account-navigation__mobile-avatar"
          onClick={showProfile}
          aria-label="My Profile"
          aria-current="page"
        >
          {profile.photo ? <img src={profile.photo} alt="" /> : initials(name)}
        </button>
        <button
          ref={toggle}
          type="button"
          className="account-navigation__toggle"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen(!open)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
      <div id={menuId} className="account-navigation__mobile-menu" hidden={!open}>
        <span>Book</span>
        <span>My Trips</span>
        <span>Membership</span>
        <span>Help</span>
        <button type="button" onClick={showProfile} aria-current="page">
          My Profile
        </button>
      </div>
    </nav>
  )
}
