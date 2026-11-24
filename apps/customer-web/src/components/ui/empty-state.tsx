import type { ComponentType, ReactNode } from 'react'
import { cn } from '@customer-web/lib/utils'
import { Card } from './card'

/**
 * An empty list (redesign board 7): an icon in a tint circle, a title, one sentence about what to do, and at most one
 * action. The action is primary when the page has nothing else to do, secondary when the person can undo a filter.
 * Same card and same centring on every list.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('items-center gap-3 px-6 py-10 text-center', className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-info-tint text-link">
        <Icon className="size-6" aria-hidden />
      </span>
      <h3 className="m-0 text-subheading text-foreground">{title}</h3>
      {children ? <p className="m-0 max-w-md text-copy">{children}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </Card>
  )
}
