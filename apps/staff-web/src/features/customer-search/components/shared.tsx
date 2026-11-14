import type { ReactNode } from 'react'
import { Badge } from '@staff-web/components/ui/badge'
import { cn } from '@staff-web/lib/utils'
import type { Person } from '../types'
import { initialsOf } from '../lib/format'

/** Small shared pieces reused by the desktop and mobile renderings. */

const avatarSizes = { sm: 'size-7 text-xs', md: 'size-9 text-sm', lg: 'size-12 text-base' } as const

export function Avatar({ person, size = 'md' }: { person: Person; size?: 'sm' | 'md' | 'lg' }) {
  // Account holders get the blue avatar, travellers the grey one, everywhere.
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        avatarSizes[size],
        person.type === 'accountHolder' ? 'bg-blue-100 text-blue-800' : 'bg-muted text-muted-foreground',
      )}
      aria-hidden="true"
    >
      {initialsOf(person)}
    </span>
  )
}

export function TypeBadge({ person }: { person: Person }) {
  return (
    <Badge variant="secondary" className={cn(person.type === 'accountHolder' && 'bg-blue-100 text-blue-800')}>
      {person.type === 'accountHolder' ? 'Account holder' : 'Traveller'}
    </Badge>
  )
}

export function ReadOnlyPill() {
  return <Badge variant="outline">Read only</Badge>
}

export function InfoNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

/** Section heading inside the detail panel, e.g. `ACCOUNT INFORMATION`. */
export function DetailSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="m-0 font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  )
}
