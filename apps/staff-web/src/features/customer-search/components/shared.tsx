import type { ReactNode } from 'react'
import type { Person } from '../types'
import { initialsOf } from '../lib/format'

/** Small shared pieces reused by the desktop and mobile renderings. */

export function Avatar({ person, size = 'md' }: { person: Person; size?: 'sm' | 'md' | 'lg' }) {
  // Account holders get the blue avatar, travellers the grey one, everywhere.
  return (
    <span className={`cs-avatar is-${size} is-${person.type}`} aria-hidden="true">
      {initialsOf(person)}
    </span>
  )
}

export function TypeBadge({ person }: { person: Person }) {
  return <span className={`cs-badge is-${person.type}`}>{person.type === 'accountHolder' ? 'Account holder' : 'Traveller'}</span>
}

export function ReadOnlyPill() {
  return <span className="cs-pill">Read only</span>
}

export function InfoNote({ children }: { children: ReactNode }) {
  return <p className="cs-note">{children}</p>
}

/** Section heading inside the detail panel, e.g. `ACCOUNT INFORMATION`. */
export function DetailSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="cs-detail__section">
      <header className="cs-detail__section-head">
        <h3 className="cs-detail__section-title">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  )
}
