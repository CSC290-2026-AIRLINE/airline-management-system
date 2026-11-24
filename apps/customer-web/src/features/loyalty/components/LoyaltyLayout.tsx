import type { ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Page } from '@customer-web/components/Page'
import { Tabs, TabsList, TabsTrigger } from '@customer-web/components/ui/tabs'
import { BODY } from './ui'

const TABS = [
  { to: '/loyalty', label: 'Overview', exact: true },
  { to: '/loyalty/statement', label: 'Statement', exact: false },
  { to: '/loyalty/benefits', label: 'My Benefits', exact: false },
  { to: '/loyalty/redemptions', label: 'My Redemptions', exact: false },
] as const

// Shell for every Feature 11 customer page: the "My FlySmiles" title with its section tabs, then the page body. The four
// tabs are pages of one area, so they share the wide column. The Overview tab has no subtitle; the other tabs do.
export function LoyaltyLayout({ subtitle, children }: { subtitle?: string; children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname.replace(/\/$/, '') })
  const current = TABS.find((tab) => (tab.exact ? pathname === tab.to : pathname.startsWith(tab.to)))?.to ?? ''

  return (
    <Page
      width="wide"
      title="My FlySmiles"
      description={subtitle}
      tabs={
        <Tabs value={current}>
          <TabsList aria-label="FlySmiles">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.to} value={tab.to} asChild>
                <Link to={tab.to}>{tab.label}</Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    >
      <div className={BODY}>{children}</div>
    </Page>
  )
}
