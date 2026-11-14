import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Skeleton } from '@staff-web/components/ui/skeleton'

export function LoadingMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-6" role="status">
      <Skeleton className="h-4 w-48" />
      <span className="text-sm text-muted-foreground">{children}</span>
    </div>
  )
}

export function EmptyMessage({ children }: { children: ReactNode }) {
  return <div className="py-6 text-center text-sm text-muted-foreground">{children}</div>
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive" className="flex items-center justify-between gap-3">
      <AlertDescription className="col-start-2 text-destructive">{message}</AlertDescription>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Alert>
  )
}
