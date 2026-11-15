import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { EmptyState } from './EmptyState'

interface ListStateProps {
  loading: boolean
  error: string | null
  empty: boolean
  noun: string // "flights", "airports": used in the loading and error lines
  emptyText: string
  children?: ReactNode // an action under the empty message, such as "Clear filters"
}

// The loading, error and empty states every list page needs; renders nothing once there are rows.
export function ListState({ loading, error, empty, noun, emptyText, children }: ListStateProps) {
  if (error)
    return (
      <Alert variant="destructive" className="my-4">
        <AlertDescription>
          Could not load {noun}: {error}
        </AlertDescription>
      </Alert>
    )
  if (loading)
    return (
      <div className="my-4 grid gap-2" role="status" aria-label={`Loading ${noun}`}>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
      </div>
    )
  if (empty)
    return (
      <EmptyState>
        <p>{emptyText}</p>
        {children}
      </EmptyState>
    )
  return null
}
