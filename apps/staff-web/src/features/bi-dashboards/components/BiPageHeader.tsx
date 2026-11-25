import { useContext, type ReactNode } from 'react'
import { Badge } from '@staff-web/components/ui/badge'
import { BiTabsContext } from './BiTabsContext'

export function BiPageHeader({
  title,
  description,
  status,
  action,
}: {
  title: string
  description: string
  status: string
  action: ReactNode
}) {
  const tabs = useContext(BiTabsContext)
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <Badge variant="outline" className="h-9 gap-2 rounded-full bg-card px-3.5 text-xs font-normal">
            <span aria-hidden="true" className="size-2 rounded-full bg-success" />
            {status}
          </Badge>
          {action}
        </div>
      </header>
      {tabs}
    </div>
  )
}
