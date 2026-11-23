// A small emoji tile used in the Products table when no real image is available.
// New products fall back to a category emoji; the seeded products use a per-id
// map so the tiles match the prototype.

import type { Product } from '../api/types'
import styles from './PhotoPlaceholder.module.css'

const PER_PRODUCT_EMOJI: Record<string, string> = {
  'p-001': '🍛',
  'p-002': '🥘',
  'p-003': '🍝',
  'p-004': '🥗',
  'p-005': '🍲',
  'p-006': '🍱',
  'p-007': '🍚',
  'p-008': '🥜',
  'p-009': '☕',
  'p-010': '🌸',
  'p-011': '🧣',
  'p-012': '🍶',
}

const CATEGORY_EMOJI: Record<Product['category'], string> = {
  meal: '🍽️',
  snack: '🥨',
  beverage: '🥤',
  duty_free: '🎁',
}

const CATEGORY_TINT: Record<Product['category'], string> = {
  meal: '#fde7c2',
  snack: '#e7d6b8',
  beverage: '#dfe1ec',
  duty_free: '#e9dffb',
}

interface Props {
  product: Pick<Product, 'id' | 'category' | 'name'>
  size?: 'sm' | 'md'
}

export function PhotoPlaceholder({ product, size = 'sm' }: Props) {
  const emoji = PER_PRODUCT_EMOJI[product.id] ?? CATEGORY_EMOJI[product.category]
  const tint = CATEGORY_TINT[product.category]
  const sizeClass = size === 'md' ? styles.md : styles.sm
  return (
    <span className={`${styles.tile} ${sizeClass}`} style={{ background: tint }} role="img" aria-label={product.name}>
      <span className={styles.emoji} aria-hidden="true">
        {emoji}
      </span>
    </span>
  )
}
