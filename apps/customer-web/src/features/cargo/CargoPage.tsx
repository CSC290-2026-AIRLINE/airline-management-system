import { useEffect, useState, type ReactNode } from 'react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { Page } from '@customer-web/components/Page'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@customer-web/components/ui/tabs'
import { useCustomerCargoApi } from './cargo-api'

interface CargoPageProps {
  /** The line under the title. */
  subtitle: string
  title?: string
  /** Something next to the title, such as a status pill. */
  titleRight?: ReactNode
  /** Replaces the Ship cargo / My cargo tabs, for a flow that shows its own progress. */
  bottom?: ReactNode
  activeTab?: 'ship' | 'mycargo'
  /** The live unread count, from a page that already tracks it (My cargo); the bell then follows "Mark all read" at once. */
  unreadCount?: number
  children: ReactNode
}

/**
 * Every cargo page, on the shared page shell: the title, a line under it, the Ship cargo / My cargo tabs and the notices
 * bell, then the page body in the wide column. (This replaces the navy banner the cargo pages used to open with.)
 */
export default function CargoPage({ subtitle, title, titleRight, bottom, activeTab, unreadCount, children }: CargoPageProps) {
  const matchRoute = useMatchRoute()
  const api = useCustomerCargoApi()
  const [fetchedUnread, setUnread] = useState(0)
  const unread = unreadCount ?? fetchedUnread

  useEffect(() => {
    if (unreadCount !== undefined) return
    api
      .listMyNotices({ page: 1, pageSize: 1 })
      .then((r) => setUnread(r.unreadCount))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isShip = activeTab === 'ship' ? true : activeTab === 'mycargo' ? false : matchRoute({ to: '/cargo/ship' })

  return (
    <Page
      width="wide"
      title={
        <span className="inline-flex flex-wrap items-center gap-3">
          {title ?? (isShip ? 'Ship cargo' : 'My cargo')}
          {titleRight}
        </span>
      }
      description={subtitle}
      actions={
        // Plain anchor: MyCargoPage reads ?tab= from the URL on mount.
        <Button asChild variant="ghost" size="icon" className="relative text-white hover:bg-white/10 hover:text-white">
          <a href="/cargo?tab=notices" aria-label={unread > 0 ? `Notices, ${unread} unread` : 'Notices'}>
            <Bell />
            {unread > 0 && (
              <Badge variant="destructive" className="absolute top-0.5 right-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
                {unread > 9 ? '9+' : unread}
              </Badge>
            )}
          </a>
        </Button>
      }
      tabs={
        bottom !== undefined ? (
          bottom
        ) : (
          <Tabs value={isShip ? 'ship' : 'mycargo'}>
            <TabsList aria-label="Cargo">
              <TabsTrigger value="ship" asChild>
                <Link to="/cargo/ship">Ship cargo</Link>
              </TabsTrigger>
              <TabsTrigger value="mycargo" asChild>
                <Link to="/cargo">My cargo</Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )
      }
    >
      {children}
    </Page>
  )
}
