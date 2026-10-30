import { Link } from '@tanstack/react-router'
import type { TierCode, TransactionType } from '../api/types'
import { formatSignedMiles } from '../format'
import { cx, FLIGHT_SEARCH_PATH, NO_TIER_ART, TIER_ART, TIER_PILL, TYPE_LABEL, TYPE_PILL, ui } from './labels'

// Small pieces shared by the Feature 11 customer pages.

export function TypePill({ type }: { type: TransactionType }) {
  return <span className={cx(ui.pill, TYPE_PILL[type])}>{TYPE_LABEL[type]}</span>
}

export function TierPill({ code, name }: { code: TierCode; name: string }) {
  return <span className={cx(ui.pill, TIER_PILL[code])}>{name}</span>
}

export function TierArt({ code, name }: { code: TierCode | null; name: string }) {
  return (
    <div
      className={cx(
        'flex aspect-[1.6] w-full max-w-sm flex-col justify-between rounded-[10px] p-5 shadow-[0_12px_24px_rgba(16,37,68,0.15)] lg:max-w-none',
        code ? TIER_ART[code] : NO_TIER_ART,
      )}
      aria-hidden="true"
    >
      <span className="text-xs font-black tracking-[0.14em] opacity-85">FLYTHON MILES</span>
      <span className="text-[22px] font-extrabold uppercase tracking-[0.12em]">{name}</span>
    </div>
  )
}

export function MilesCell({ miles }: { miles: number }) {
  return (
    <td className={cx(ui.td, ui.num, 'text-[15px] font-extrabold', miles > 0 ? 'text-ok' : 'text-warn')}>{formatSignedMiles(miles)}</td>
  )
}

export function SearchFlightsLink({ label, className = ui.button }: { label: string; className?: string }) {
  return (
    <Link to={FLIGHT_SEARCH_PATH} className={className}>
      {label}
    </Link>
  )
}

// Inline icons (no icon package is installed yet).
const ICONS = {
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plane: 'M10.5 21l2-7-6 1-2 3-1.5-.5 1-4-1-4 1.5-.5 2 3 6 1-2-7h2l5 7h4a1.5 1.5 0 0 1 0 3h-4l-5 7h-2Z',
  users:
    'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7',
  ticket: 'M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 0 0-6V6H3v3ZM14 6v12',
  dash: 'M7 12h10',
} as const

export function Icon({ name, size = 20, color = 'currentColor' }: { name: keyof typeof ICONS; size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none"
    >
      <path d={ICONS[name]} />
    </svg>
  )
}
