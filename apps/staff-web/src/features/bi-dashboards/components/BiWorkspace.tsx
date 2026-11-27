import type { ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { cn } from '@staff-web/lib/utils'
import type { BiView, BiViewInfo } from '../bi-views'
import { WORKSPACE } from '../lib-styles'
import { BiTabsContext } from './BiTabsContext'

interface BiWorkspaceProps {
  view: BiView
  /** The views the signed-in role can open; the others are left out of the tabs. */
  views: BiViewInfo[]
  children: ReactNode
}

/**
 * The Business intelligence pages inside the main staff sidebar (AppShell, as on every other feature). Under each
 * page's title, the views link to each other, each at its own URL: as a tab row when the page is wide enough for all
 * five tabs, otherwise as a "View" menu showing the current view, so no view is hidden off the edge. The width is the
 * page column's own (a container query), so it accounts for the sidebar. The switcher reaches the page header through
 * BiTabsContext and BiPageHeader.
 */
export function BiWorkspace({ view, views, children }: BiWorkspaceProps) {
  const navigate = useNavigate()
  const current = views.find((item) => item.id === view)
  const tabs = (
    <div className="print:hidden">
      <div className="flex flex-col gap-1.5 @min-[640px]:hidden">
        <Label htmlFor="bi-view" className="text-xs font-normal text-muted-foreground">
          View
        </Label>
        <Select value={view} onValueChange={(id) => void navigate({ to: views.find((item) => item.id === id)?.path ?? '/bi' })}>
          <SelectTrigger id="bi-view" className="w-full bg-card">
            <SelectValue>{current?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {views.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <nav aria-label="Business intelligence views" className="hidden gap-1 border-b @min-[640px]:flex">
        {views.map((item) => (
          <Link
            key={item.id}
            to={item.path}
            className={cn(
              '-mb-px border-b-2 border-transparent px-3.5 py-2.5 text-sm whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
              view === item.id && 'border-primary font-semibold text-primary',
            )}
            aria-current={view === item.id ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  )

  return (
    <div className={cn(WORKSPACE, '@container')}>
      <BiTabsContext.Provider value={tabs}>{children}</BiTabsContext.Provider>
    </div>
  )
}
