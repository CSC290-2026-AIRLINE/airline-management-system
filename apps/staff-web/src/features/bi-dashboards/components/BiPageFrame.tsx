import type { ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { BiPageHeader } from './BiPageHeader'

/** The Refresh button's state. Pages that read the BI copy pass it; the Financial report, which reads Feature 4, does not. */
export interface BiRefreshControl {
  onRefresh: () => void
  refreshing: boolean
  error: string | null
  /** The latest refresh run failed, so the figures are from the one before it. */
  lastRunFailed: boolean
}

/**
 * Every BI view in the same order: title, status pill and actions, the view tabs, the filter card, the refresh
 * alerts, the page's own alerts, then its content. Keeping the order here stops the views drifting apart.
 */
export function BiPageFrame({
  title,
  description,
  status,
  refresh,
  action,
  filters,
  alerts,
  busy = false,
  children,
}: {
  title: string
  description: string
  status: string
  refresh?: BiRefreshControl
  /** A page-specific button beside Refresh. */
  action?: ReactNode
  filters: ReactNode
  /** The page's own messages (load or export errors, notes); shown under the refresh alerts. */
  alerts?: ReactNode
  busy?: boolean
  children: ReactNode
}) {
  return (
    <>
      <BiPageHeader
        title={title}
        description={description}
        status={status}
        action={
          <>
            {action}
            {refresh && (
              <Button type="button" variant="outline" onClick={refresh.onRefresh} disabled={refresh.refreshing}>
                <RefreshCw className={refresh.refreshing ? 'animate-spin' : undefined} aria-hidden="true" />
                {refresh.refreshing ? 'Refreshing…' : 'Refresh'}
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-col gap-6" aria-busy={busy}>
        {filters}
        {refresh?.error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Refresh failed</AlertTitle>
            <AlertDescription>{refresh.error}</AlertDescription>
          </Alert>
        )}
        {refresh?.lastRunFailed && !refresh.error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Last refresh failed</AlertTitle>
            <AlertDescription>The figures shown are from the last successful refresh. Try Refresh again.</AlertDescription>
          </Alert>
        )}
        {refresh?.refreshing && (
          <Alert>
            <RefreshCw className="animate-spin" />
            <AlertTitle>Refreshing data</AlertTitle>
            <AlertDescription>
              Pulling the latest flights, bookings and revenue. The previous figures stay available while the refresh runs.
            </AlertDescription>
          </Alert>
        )}
        {alerts}
        {children}
      </div>
    </>
  )
}
