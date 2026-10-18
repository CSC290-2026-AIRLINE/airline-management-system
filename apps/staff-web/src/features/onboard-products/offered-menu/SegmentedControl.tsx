// Segmented control: a row of pill buttons where exactly one is "selected".
// Used for the multi-option choices on the Route detail page (meal service,
// meal selection, order window, included meals, on-board buffer).

import type { ReactNode } from 'react'
import styles from './SegmentedControl.module.css'

export interface SegmentOption<T extends string | number> {
  value: T
  label: ReactNode
}

interface Props<T extends string | number> {
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  ariaLabel?: string
  disabled?: boolean
}

export function SegmentedControl<T extends string | number>({ value, options, onChange, ariaLabel, disabled }: Props<T>) {
  return (
    <div className={styles.group} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            className={selected ? styles.segmentActive : styles.segment}
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
