import type { ReactNode } from 'react'
import { initials } from '../types/format'
import type { CrewMember } from '../types/types'

/** White rounded panel used by every section of the profile page. */
export function ProfileCard({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: string
  subtitle?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`flex flex-col rounded-2xl border border-border-desc/40 bg-card-bg p-5 lg:p-6 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3">
          {title && <h2 className="text-lg font-extrabold tracking-tight text-primary-text lg:text-xl">{title}</h2>}
          {action}
        </div>
      )}
      {subtitle && <p className="mt-1 text-xs leading-relaxed text-primary-text/55 lg:text-sm">{subtitle}</p>}
      {children}
    </section>
  )
}

/** A small-caps label above a value, the way every field on the profile is drawn. */
export function Field({ label, value, className = '' }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[11px] font-semibold tracking-wider text-label uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-bold wrap-break-word text-primary-text lg:text-base">{value ?? '—'}</dd>
    </div>
  )
}

/** `MJ`, the large light circle on the profile header. */
export function CrewAvatar({ crew }: { crew: CrewMember }) {
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border-desc/50 bg-band-bg text-lg font-extrabold text-primary lg:h-16 lg:w-16 lg:text-xl">
      {initials(crew)}
    </span>
  )
}
