import { useEffect, useId, useRef, type ReactNode } from 'react'
import type { TierCode, TransactionType } from '../api/types'
import { formatSignedMiles } from '../format'
import { TYPE_LABEL } from '../labels'
import styles from './loyalty.module.css'

// Small pieces shared by the Feature 11 staff pages.

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

export function TierPill({ tier }: { tier: { code: TierCode; name: string } | null }) {
  return tier ? (
    <span className={`${styles.pill} ${TIER_PILL[tier.code]}`}>{tier.name}</span>
  ) : (
    <span className={`${styles.pill} ${styles.pillDark}`}>No tier</span>
  )
}

export function MilesCell({ miles }: { miles: number }) {
  return <td className={`${styles.num} ${styles.strong} ${miles > 0 ? styles.plus : styles.minus}`}>{formatSignedMiles(miles)}</td>
}

// A pop-up dialog. Escape and the backdrop close it; focus moves into it when it opens.
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)

  useEffect(() => {
    close.current = onClose
  }, [onClose])

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input, select, button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string; disabled?: boolean }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} disabled={o.disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className={styles.toast} role="status">
      ✓ {message}
    </div>
  )
}
