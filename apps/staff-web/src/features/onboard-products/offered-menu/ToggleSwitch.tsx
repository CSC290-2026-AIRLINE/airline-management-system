// On/off toggle switch. Used for boolean settings on the Route detail page
// (pre-order, premium meals, snacks, duty-free).

import styles from './ToggleSwitch.module.css'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel?: string
  disabled?: boolean
}

export function ToggleSwitch({ checked, onChange, ariaLabel, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`${styles.switch} ${checked ? styles.on : styles.off}`}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      <span className={styles.label}>{checked ? 'On' : 'Off'}</span>
    </button>
  )
}
