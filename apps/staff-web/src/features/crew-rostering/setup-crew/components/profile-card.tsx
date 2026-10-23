import type { ReactNode } from 'react'
import { initials } from '../types/format'
import type { CrewMember } from '../types/types'

/** White rounded panel used by every section of the profile page. */
export function ProfileCard({
  title,
  action,
  children,
  className = '',
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`flex flex-col rounded-xl border border-border-desc/40 bg-card-bg px-4 py-5 sm:px-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3">
          {title && <h2 className="font-display text-lg font-bold text-primary-text">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * `Label / value` pair inside a `ProfileCard`. The label sits above the value on
 * a phone, beside it from `sm`, so a long email never squeezes its label.
 */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="text-xs font-medium text-border-desc sm:w-44 sm:shrink-0">{label}</dt>
      <dd className="text-sm font-medium wrap-break-word text-primary-text">{value ?? '—'}</dd>
    </div>
  )
}

/** `MJ`, the large circle avatar on the profile header. */
export function CrewAvatar({ crew, size = 'lg' }: { crew: CrewMember; size?: 'lg' | 'md' }) {
  const dimensions = size === 'lg' ? 'h-16 w-16 text-xl sm:h-18 sm:w-18' : 'h-10 w-10 text-sm'
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-primary text-white ${dimensions}`}>
      <span className="font-bold">{initials(crew)}</span>
    </span>
  )
}
