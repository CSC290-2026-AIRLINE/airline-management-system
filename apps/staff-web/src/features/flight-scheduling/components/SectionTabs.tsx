import type { ReactNode } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Badge } from '@staff-web/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { useOnChange } from '../hooks/fsChange'
import { useOpenConflicts } from '../hooks/useOpenConflicts'
import { useResource } from '../hooks/useResource'

type Section = 'airports' | 'routes' | 'board'

// One shadcn tab strip per area of Feature 2, so each area is a single entry in the main sidebar. The tab is the ?tab= query of the
// area's page, so a link or a refresh lands on the same tab; the first tab has no query.
export function SectionTabs({ section }: { section: Section }) {
  if (section === 'board') return <BoardTabs />
  return (
    <Tabs className="mb-6">
      <TabsList aria-label={LABELS[section]}>
        {section === 'airports' && (
          <>
            <Tab to="/airports">Airports</Tab>
            <Tab to="/airports" tab="fees">
              Airport fees
            </Tab>
            <Tab to="/airports" tab="policy">
              Approval policy
            </Tab>
          </>
        )}
        {section === 'routes' && (
          <>
            <Tab to="/routes">Routes</Tab>
            <Tab to="/routes" tab="patterns">
              Patterns
            </Tab>
          </>
        )}
      </TabsList>
    </Tabs>
  )
}

const LABELS: Record<Section, string> = { airports: 'Airport data', routes: 'Routes and patterns', board: 'Schedule flight' }

type TabProps =
  | { to: '/airports'; tab?: 'fees' | 'policy'; children: ReactNode }
  | { to: '/routes'; tab?: 'patterns'; children: ReactNode }
  | { to: '/schedule-board'; tab?: 'approvals' | 'conflicts' | 'disruptions' | 'settings' | 'console'; children: ReactNode }

function Tab({ to, tab, children }: TabProps) {
  const current = useSearch({ strict: false }) as { tab?: string }
  return (
    <TabsTrigger value={tab ?? to} data-state={(current.tab ?? undefined) === tab ? 'active' : 'inactive'} asChild>
      <Link to={to} search={{ tab } as never} aria-current={(current.tab ?? undefined) === tab ? 'page' : undefined}>
        {children}
      </Link>
    </TabsTrigger>
  )
}

// Flights, their approval requests, conflicts, disruption log and settings. The Approver console is for demos, so its tab shows only when approval_mode is manual.
function BoardTabs() {
  const { fetchWithAuth } = useAppAuth()
  const settings = useResource<{ approval_mode: 'auto' | 'manual' }>('/flight-settings', fetchWithAuth)
  const current = useSearch({ strict: false }) as { tab?: string }
  useOnChange('settings', settings.reload)
  const { count } = useOpenConflicts(current.tab)
  return (
    <Tabs className="mb-6">
      <TabsList aria-label={LABELS.board}>
        <Tab to="/schedule-board">Flights</Tab>
        <Tab to="/schedule-board" tab="approvals">
          Approvals
        </Tab>
        <Tab to="/schedule-board" tab="conflicts">
          Conflicts
          {count !== null && count > 0 && (
            <Badge variant="destructive" aria-label={`${count} open`}>
              {count}
            </Badge>
          )}
        </Tab>
        <Tab to="/schedule-board" tab="disruptions">
          Disruption log
        </Tab>
        <Tab to="/schedule-board" tab="settings">
          Settings
        </Tab>
        {settings.data?.approval_mode === 'manual' && (
          <Tab to="/schedule-board" tab="console">
            Approver console
          </Tab>
        )}
      </TabsList>
    </Tabs>
  )
}
