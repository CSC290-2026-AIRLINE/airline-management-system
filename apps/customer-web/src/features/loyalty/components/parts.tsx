import type { ComponentProps, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@customer-web/components/ui/alert'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Skeleton } from '@customer-web/components/ui/skeleton'
import type { BookingStatus, TierCode, TransactionType } from '../api/types'
import { formatSignedMiles } from '../format'
import type { LoadState } from '../use-load'
import {
  AWARD_SEARCH_PATH,
  BOOKING_LABEL,
  BOOKING_PILL,
  cx,
  FLIGHT_SEARCH_PATH,
  MILES_TONE,
  NO_TIER_ART,
  TIER_ART,
  TYPE_LABEL,
  TYPE_PILL,
} from './ui'

// Small pieces shared by the Feature 11 customer pages.

export function TypePill({ type }: { type: TransactionType }) {
  return (
    <Badge variant="secondary" className={TYPE_PILL[type]}>
      {TYPE_LABEL[type]}
    </Badge>
  )
}

export function BookingPill({ status }: { status: BookingStatus }) {
  return (
    <Badge variant="secondary" className={BOOKING_PILL[status]}>
      {BOOKING_LABEL[status]}
    </Badge>
  )
}

// tone overrides the colour for positive amounts (the dashboard shows them in blue).
export function SignedMiles({ type, miles, tone, className }: { type: TransactionType; miles: number; tone?: string; className?: string }) {
  const color = miles < 0 ? 'text-warn' : (tone ?? MILES_TONE[type])
  return <span className={cx('font-bold tabular-nums whitespace-nowrap', color, className)}>{formatSignedMiles(miles)}</span>
}

// A small FlySmiles tier card.
export function TierCard({ code, name, className }: { code: TierCode | null; name: string; className?: string }) {
  return (
    <div
      className={cx(
        'flex aspect-[1.6] flex-col justify-between rounded-lg p-2.5 shadow-[0_8px_18px_rgba(16,37,68,0.15)]',
        code ? TIER_ART[code] : NO_TIER_ART,
        className,
      )}
      aria-hidden="true"
    >
      <span className="text-[6px] font-black tracking-[0.14em] opacity-85 sm:text-[7px]">FLYSMILES</span>
      <span className="text-[9px] font-extrabold tracking-[0.12em] uppercase sm:text-[10px]">{name}</span>
    </div>
  )
}

// A router link styled as a shadcn Button (outline by default).
export function SearchFlightsLink({
  label,
  variant = 'outline',
  className,
  to = FLIGHT_SEARCH_PATH,
}: {
  label: ReactNode
  variant?: ComponentProps<typeof Button>['variant']
  className?: string
  to?: typeof FLIGHT_SEARCH_PATH | typeof AWARD_SEARCH_PATH
}) {
  return (
    <Button asChild variant={variant} className={className}>
      <Link to={to}>{label}</Link>
    </Button>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
      <strong className="text-[15px] text-primary-pressed">{title}</strong>
      <span className="text-[13px] text-muted-foreground">{body}</span>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// Renders the loading and error states of a request, and the content once it is ready.
export function Loaded<T>({ state, retry, children }: { state: LoadState<T>; retry: () => void; children: (data: T) => ReactNode }) {
  switch (state.status) {
    case 'loading':
      return (
        <div aria-live="polite" aria-busy="true" className="flex flex-col gap-4">
          <span className="sr-only">Loading…</span>
          <Skeleton className="h-40 rounded-xl bg-white" />
          <Skeleton className="h-64 rounded-xl bg-white" />
        </div>
      )
    case 'error':
      return (
        <Alert variant="destructive" className="bg-white">
          <AlertCircle />
          <AlertTitle>We could not load your FlySmiles details.</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <p>{state.message}</p>
            <Button variant="outline" onClick={retry}>
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
