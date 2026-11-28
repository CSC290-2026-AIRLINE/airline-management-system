import type { ReactNode } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@staff-web/components/ui/empty'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { cn } from '@staff-web/lib/utils'
import { CARD, CARD_TITLE, EMPTY_TEXT } from '../lib-styles'

/*
 * The loading, error and empty states every BI page uses, so a section looks the same whichever view it is on:
 * a card-sized skeleton while loading, a card with Retry when it fails, and an Empty card when there is nothing to show.
 */

/** A placeholder the size of a chart card. Pass `className` for a shorter or taller section. */
export function SectionLoading({ className }: { className?: string }) {
  return <Skeleton className={cn('h-[332px] w-full rounded-xl', className)} />
}

export function SectionError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <Card className={CARD}>
      <h2 className={CARD_TITLE}>{label}</h2>
      <div className={EMPTY_TEXT} role="alert">
        <div className="flex flex-col items-center gap-3">
          <p>Could not load these figures.</p>
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    </Card>
  )
}

export function SectionEmpty({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <Empty className="border bg-card">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

/** Picks the state for one section's data. Returns null once there is data to show. */
export function BiSectionState({
  label,
  loading,
  error,
  onRetry,
  empty,
  emptyTitle,
  emptyDescription,
}: {
  /** Names the section in the error card. */
  label: string
  loading: boolean
  error: string | null
  onRetry: () => void
  empty: boolean
  emptyTitle: string
  emptyDescription?: string
}) {
  if (loading) return <SectionLoading />
  if (error) return <SectionError label={label} onRetry={onRetry} />
  if (empty) return <SectionEmpty title={emptyTitle} description={emptyDescription} />
  return null
}
