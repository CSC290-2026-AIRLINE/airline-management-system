import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
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
  ui,
} from './ui'

// Small pieces shared by the Feature 11 customer pages.

// The Flython Airlines mark from the F11 Figma file: an amber-and-white swoosh with a serif wordmark.
export function FlythonLogo({ tone = 'dark' }: { tone?: 'light' | 'dark' }) {
  return (
    <span
      className={cx('inline-flex items-center gap-2.5', tone === 'light' ? 'text-white' : 'text-navy')}
      role="img"
      aria-label="Flython Airlines"
    >
      <svg viewBox="0 0 64 36" className="h-7 w-12 flex-none sm:h-8 sm:w-14" aria-hidden="true">
        <path d="M2 30C14 14 34 6 62 4 44 10 30 16 20 26Z" fill="#f5a524" />
        <path d="M8 34C20 22 36 15 56 12 42 18 30 24 22 34Z" fill={tone === 'light' ? '#ffffff' : '#9fb2d3'} />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="font-serif text-[22px] font-bold sm:text-[26px]">Flython</span>
        <span className="mt-0.5 self-center font-serif text-[7px] font-semibold tracking-[0.3em] sm:text-[8px]">AIRLINES</span>
      </span>
    </span>
  )
}

export function TypePill({ type }: { type: TransactionType }) {
  return <span className={cx(ui.pill, TYPE_PILL[type])}>{TYPE_LABEL[type]}</span>
}

export function BookingPill({ status }: { status: BookingStatus }) {
  return <span className={cx(ui.pill, BOOKING_PILL[status])}>{BOOKING_LABEL[status]}</span>
}

// tone overrides the colour for positive amounts (the dashboard shows them in blue).
export function SignedMiles({ type, miles, tone, className }: { type: TransactionType; miles: number; tone?: string; className?: string }) {
  const color = miles < 0 ? 'text-warn' : (tone ?? MILES_TONE[type])
  return <span className={cx('font-bold tabular-nums whitespace-nowrap', color, className)}>{formatSignedMiles(miles)}</span>
}

// A small FlySmiles tier card, as in the Join page's tier table.
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

export function SearchFlightsLink({
  label,
  className = ui.button,
  to = FLIGHT_SEARCH_PATH,
}: {
  label: string
  className?: string
  to?: typeof FLIGHT_SEARCH_PATH | typeof AWARD_SEARCH_PATH
}) {
  return (
    <Link to={to} className={className}>
      {label}
    </Link>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
      <strong className="text-[15px] text-ink">{title}</strong>
      <span className="text-[13px] text-muted">{body}</span>
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
          <div className="h-40 animate-pulse rounded-xl bg-white" />
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        </div>
      )
    case 'error':
      return (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-[#f3c2bd] bg-white p-5 text-danger" role="alert">
          <strong>We could not load your FlySmiles details.</strong>
          <span className="text-[13px]">{state.message}</span>
          <button type="button" className={ui.button} onClick={retry}>
            Try again
          </button>
        </div>
      )
    case 'ready':
      return <>{children(state.data)}</>
    default: {
      const unreachable: never = state
      return unreachable
    }
  }
}
