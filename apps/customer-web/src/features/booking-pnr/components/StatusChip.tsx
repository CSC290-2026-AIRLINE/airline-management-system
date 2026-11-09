import styles from './StatusChip.module.css'

export type ChipTone = 'confirmed' | 'held' | 'completed' | 'cancelled' | 'expired'

const TONE_CLASS: Record<ChipTone, string> = {
  confirmed: styles.confirmed,
  held: styles.held,
  completed: styles.completed,
  cancelled: styles.cancelled,
  expired: styles.expired,
}

export function StatusChip({ label, tone, className }: { label: string; tone: ChipTone; className?: string }) {
  return <span className={`${styles.chip} ${TONE_CLASS[tone]} ${className ?? ''}`}>{label}</span>
}
