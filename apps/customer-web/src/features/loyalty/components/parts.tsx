import { Link } from '@tanstack/react-router'
import type { TierCode, TransactionType } from '../api/types'
import { formatSignedMiles } from '../format'
import { FLIGHT_SEARCH_PATH, TIER_ART, TYPE_LABEL } from './labels'
import styles from './loyalty.module.css'

// Small pieces shared by the Feature 11 customer pages.

const TYPE_PILL: Record<TransactionType, string> = {
  earn: styles.pillBlue,
  redeem: styles.pillAmber,
  redeem_reversal: styles.pillGreen,
  expire: '',
  adjust: '',
}

export function TypePill({ type }: { type: TransactionType }) {
  return <span className={`${styles.pill} ${TYPE_PILL[type]}`}>{TYPE_LABEL[type]}</span>
}

const TIER_PILL: Record<TierCode, string> = { silver: styles.pillSilver, gold: styles.pillGold, platinum: styles.pillPlatinum }

export function TierPill({ code, name }: { code: TierCode; name: string }) {
  return <span className={`${styles.pill} ${TIER_PILL[code]}`}>{name}</span>
}

export function TierArt({ code, name }: { code: TierCode | null; name: string }) {
  return (
    <div className={`${styles.tierArt} ${code ? TIER_ART[code] : styles.tierNone}`} aria-hidden="true">
      <span className={styles.brand}>FLYTHON MILES</span>
      <span className={styles.tierArtName}>{name}</span>
    </div>
  )
}

export function MilesCell({ miles }: { miles: number }) {
  return <td className={`${styles.num} ${styles.strong} ${miles > 0 ? styles.plus : styles.minus}`}>{formatSignedMiles(miles)}</td>
}

export function SearchFlightsLink({ label, className = styles.button }: { label: string; className?: string }) {
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
    >
      <path d={ICONS[name]} />
    </svg>
  )
}
