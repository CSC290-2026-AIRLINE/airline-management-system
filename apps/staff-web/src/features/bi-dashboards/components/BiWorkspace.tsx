import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '@staff-web/lib/utils'
import type { BiView, BiViewInfo } from '../bi-views'
import { BiTabsContext } from './BiTabsContext'

interface BiWorkspaceProps {
  view: BiView
  /** The views the signed-in role can open; the others are left out of the tabs. */
  views: BiViewInfo[]
  children: ReactNode
}

/**
 * The Business intelligence pages inside the main staff sidebar (AppShell, as on every other feature). The tab row
 * under each page's title links between the views, each at its own URL. The tabs reach the page header through
 * BiTabsContext and BiPageHeader.
 */
export function BiWorkspace({ view, views, children }: BiWorkspaceProps) {
  const tabs = (
    <nav aria-label="Business intelligence views" className="flex flex-wrap gap-1 border-b print:hidden">
      {views.map((item) => (
        <Link
          key={item.id}
          to={item.path}
          className={cn(
            '-mb-px border-b-2 border-transparent px-3.5 py-2.5 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
            view === item.id && 'border-primary font-semibold text-primary',
          )}
          aria-current={view === item.id ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )

  return (
    <div className="flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 pt-6 pb-10 font-sans sm:px-6 min-[1100px]:px-[63px] print:p-0">
      <BiTabsContext.Provider value={tabs}>{children}</BiTabsContext.Provider>
    </div>
  )
}
