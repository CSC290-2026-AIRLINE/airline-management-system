import type { ReactNode } from 'react'
import { AlertCircle, Info } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import type { LoadState } from '../use-load'
import { ui } from './ui'

// The F11 page frame inside the global staff sidebar (see routes/_authenticated/loyalty/route.tsx): title, purpose line
// and optional info note above the page content.
export function StaffLoyaltyLayout({
  title,
  purpose,
  info,
  children,
}: {
  title: string
  purpose: string
  info?: string
  children: ReactNode
}) {
  return (
    <div className={ui.shell}>
      <main className={ui.main}>
        <h1 className={ui.title}>{title}</h1>
        <p className={ui.purpose}>{purpose}</p>
        {info && (
          <Alert>
            <Info />
            <AlertDescription>{info}</AlertDescription>
          </Alert>
        )}
        {children}
      </main>
    </div>
  )
}

export function Loaded<T>({ state, retry, children }: { state: LoadState<T>; retry: () => void; children: (data: T) => ReactNode }) {
  switch (state.status) {
    case 'loading':
      return (
        <div aria-live="polite" aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Loading…</span>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      )
    case 'error':
      return (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Couldn’t load this</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <p>{state.message}</p>
            <Button variant="outline" size="sm" onClick={retry}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )
    case 'ready':
      return <>{children(state.data)}</>
    default: {
      const unreachable: never = state
      return unreachable
    }
  }
}
