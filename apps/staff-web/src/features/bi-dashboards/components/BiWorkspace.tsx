import type { ReactNode } from 'react'
import clockDot from '../assets/clock-dot.svg'
import { BiTabsContext } from './BiTabsContext'
import '../bi-dashboard.css'
import '../bi-tabs.css'

export type BiView = 'operations' | 'finance' | 'no-shows' | 'extra-revenue' | 'aircraft-use'

const NAV_ITEMS: { id: BiView; label: string }[] = [
  { id: 'operations', label: 'Operations' },
  { id: 'finance', label: 'Financial report' },
  { id: 'no-shows', label: 'No-shows' },
  { id: 'extra-revenue', label: 'Extra revenue' },
  { id: 'aircraft-use', label: 'Aircraft use' },
]

interface BiWorkspaceProps {
  view: BiView
  /** The views the signed-in role can open; the others are left out of the tabs. */
  views: BiView[]
  onViewChange: (view: BiView) => void
  clock: string | null
  children: ReactNode
}

/**
 * The Business intelligence pages inside the main staff sidebar (AppShell, as on every other feature). The tab row
 * under each page's title is the BI navigation between the five views; the simulation clock sits at its right. The tabs
 * reach the page header through BiTabsContext and BiPageHeader.
 */
export function BiWorkspace({ view, views, onViewChange, clock, children }: BiWorkspaceProps) {
  const clockText = clock
    ? new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
        .format(new Date(clock))
        .replaceAll(',', '')
    : '—'

  const tabs = (
    <div className="bi-tabbar print:hidden">
      <nav aria-label="Business intelligence views" className="bi-tabs">
        {NAV_ITEMS.filter((item) => views.includes(item.id)).map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? 'bi-tab is-active' : 'bi-tab'}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => onViewChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <span className="bi-clock">
        <img src={clockDot} alt="" />
        Simulation clock <strong>{clockText}</strong>
      </span>
    </div>
  )

  return (
    <div className="bi-embedded">
      <main className={`bi-main bi-${view}`}>
        <BiTabsContext.Provider value={tabs}>{children}</BiTabsContext.Provider>
      </main>
    </div>
  )
}
