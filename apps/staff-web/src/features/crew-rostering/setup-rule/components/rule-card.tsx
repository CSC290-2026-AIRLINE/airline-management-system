import type { ReactNode } from 'react'

/**
 * The panel every Rules section sits in.
 *
 * `setup-crew` has its own equivalent; each page keeps its own so neither
 * reaches into the other's folder, and the two are free to diverge.
 */
export function RuleCard({
  title,
  description,
  action,
  children,
  className = '',
}: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-2xl border border-border-desc/40 bg-card-bg ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-5 lg:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-extrabold tracking-tight text-primary-text">{title}</h2>}
            {description && <p className="mt-0.5 text-xs leading-relaxed text-primary-text/55">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}
