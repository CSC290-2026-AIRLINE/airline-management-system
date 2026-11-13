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
}: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border-desc/40 bg-card-bg">
      {(title || action) && (
        <header className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-5 sm:pt-5">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold text-primary-text">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-primary-text/55">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="p-4 sm:px-5 sm:pb-5">{children}</div>
    </section>
  )
}
