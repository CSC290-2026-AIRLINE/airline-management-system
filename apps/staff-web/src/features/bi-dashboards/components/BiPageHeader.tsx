import { useContext, type ReactNode } from 'react'
import { Badge } from '@staff-web/components/ui/badge'
import { cn } from '@staff-web/lib/utils'
import { BiTabsContext } from './BiTabsContext'

/** The status pill's dot: green for current figures, amber when they are missing or stale, grey while loading. */
export type BiStatusTone = 'ok' | 'warning' | 'error' | 'pending'

const DOT: Record<BiStatusTone, string> = {
  ok: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-destructive',
  pending: 'bg-muted-foreground/50',
}

/**
 * The same header on every BI view. Below laptop width: title, description, then the status pill and buttons. From
 * laptop width: the pill and buttons sit top-right beside the title, whatever the description's length. Then the tabs.
 */
export function BiPageHeader({
  title,
  description,
  status,
  tone,
  action,
}: {
  title: string
  description: string
  status: string
  tone: BiStatusTone
  action: ReactNode
}) {
  const tabs = useContext(BiTabsContext)
  return (
    <div className="flex flex-col gap-4">
      <header className="grid grid-cols-1 gap-x-6 gap-y-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <h1 className="m-0 text-xl font-bold tracking-tight text-foreground sm:text-2xl lg:col-start-1 lg:row-start-1 lg:self-center">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground lg:col-span-2 lg:row-start-2">{description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 lg:col-start-2 lg:row-start-1 lg:mt-0 lg:justify-end print:hidden">
          <Badge variant="outline" className="h-9 gap-2 rounded-full bg-card px-3.5 text-xs font-normal">
            <span aria-hidden="true" className={cn('size-2 rounded-full', DOT[tone])} />
            {status}
          </Badge>
          {action}
        </div>
      </header>
      {tabs}
    </div>
  )
}
