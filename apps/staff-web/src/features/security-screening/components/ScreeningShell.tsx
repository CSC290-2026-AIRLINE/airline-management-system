import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ListChecks, ShieldAlert } from 'lucide-react'
import { Badge } from '@staff-web/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'

/**
 * The Security Screening page frame: heading, the Queue / Watchlist tabs and the content. The staff navigation (sidebar,
 * phone top bar, sign out) comes from the platform's `AppShell`, which the route renders around this page.
 */
export function ScreeningShell({
  children,
  reviewing = false,
  held,
  onQueue,
  activeTab = 'queue',
  navigationDisabled = false,
}: {
  children: ReactNode
  reviewing?: boolean
  held?: number
  onQueue?: () => void
  activeTab?: 'queue' | 'watchlist'
  navigationDisabled?: boolean
}) {
  const queueLabel = (
    <>
      <ShieldAlert />
      Screening Queue
      {held !== undefined && held > 0 && (
        <Badge variant="destructive" className="px-1.5">
          {held}
          <span className="max-sm:hidden"> held</span>
        </Badge>
      )}
    </>
  )
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 px-6 pt-6 pb-10 min-[1100px]:px-[63px]">
      <header className="flex flex-col gap-3">
        <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground">
          {reviewing ? 'Screening review' : 'Security Screening'}
        </h1>
        <Tabs value={activeTab}>
          <TabsList className="h-11 w-full justify-start sm:w-fit" aria-label="Security screening">
            {onQueue ? (
              <TabsTrigger value="queue" onClick={onQueue} disabled={navigationDisabled} className="px-4">
                {queueLabel}
              </TabsTrigger>
            ) : (
              <TabsTrigger value="queue" asChild disabled={navigationDisabled} className="px-4">
                <Link to="/security-screening/screening-queue" search={{ status: 'needs-review' }} preload="render">
                  {queueLabel}
                </Link>
              </TabsTrigger>
            )}
            <TabsTrigger value="watchlist" asChild disabled={navigationDisabled} className="px-4">
              <Link to="/security-screening/watchlist" preload="render">
                <ListChecks />
                Watchlist
              </Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>
      <main>{children}</main>
    </div>
  )
}
