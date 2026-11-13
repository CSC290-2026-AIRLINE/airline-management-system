import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Menu } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@staff-web/components/ui/sheet'
import mark from '../assets/flython-mark.svg'
import mobileLogo from '../assets/mobile-logo.png'
import clockDot from '../assets/clock-dot.svg'
import userDot from '../assets/user-dot.svg'
import '../bi-dashboard.css'

export type BiView = 'operations' | 'finance'

interface BiWorkspaceProps {
  view: BiView
  onViewChange: (view: BiView) => void
  name: string
  clock: string | null
  onSignOut: () => void
  children: ReactNode
}

export function BiWorkspace({ view, onViewChange, name, clock, onSignOut, children }: BiWorkspaceProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
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

  const navigation = (
    <>
      <div className="bi-brand">
        <img src={mark} alt="" />
        <div>
          <strong>Flython</strong>
          <span>AIRLINES</span>
        </div>
      </div>
      <p className="bi-workspace-label">STAFF · REPORTS</p>
      <nav aria-label="Business intelligence navigation" className="bi-navigation">
        <p>BUSINESS INTELLIGENCE</p>
        {(
          [
            { id: 'operations', label: 'Operations dashboard' },
            { id: 'finance', label: 'Financial report' },
          ] as const
        ).map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            className={view === item.id ? 'bi-nav-item is-active' : 'bi-nav-item'}
            title={item.label}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => {
              onViewChange(item.id)
              setMenuOpen(false)
            }}
          >
            {collapsed ? (item.id === 'operations' ? 'BI' : '฿') : item.label}
          </Button>
        ))}
      </nav>
      <footer className="bi-sidebar-footer">
        <div className="bi-sidebar-info">
          <span>
            <img src={clockDot} alt="" />
            SIMULATION CLOCK
          </span>
          <strong>{clockText}</strong>
        </div>
        <div className="bi-sidebar-info">
          <span>
            <img src={userDot} alt="" />
            SIGNED IN AS
          </span>
          <strong>{name}</strong>
        </div>
        <p>Analyst. Navigation follows assigned staff permissions.</p>
        <Button variant="ghost" onClick={onSignOut} className="bi-signout">
          Sign out
        </Button>
      </footer>
    </>
  )

  return (
    <div className={`bi-workspace${collapsed ? ' bi-collapsed' : ''}`}>
      <aside className="bi-sidebar">
        <Button
          variant="ghost"
          size="icon"
          className="bi-collapse"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
        </Button>
        {navigation}
      </aside>
      <div className="bi-main-area">
        <header className="bi-mobile-bar">
          <img src={mobileLogo} alt="Flython Airlines" />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button size="icon" aria-label="Open reports navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bi-mobile-navigation">
              <SheetTitle className="sr-only">Reports navigation</SheetTitle>
              {navigation}
            </SheetContent>
          </Sheet>
        </header>
        <main className={`bi-main bi-${view}`}>{children}</main>
      </div>
    </div>
  )
}
