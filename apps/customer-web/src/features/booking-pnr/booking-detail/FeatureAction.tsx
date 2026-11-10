import styles from './FeatureAction.module.css'

interface FeatureActionProps {
  label: string
  // Why the action cannot be used yet. It is the tooltip of the action.
  reason: string
  // The control style, usually controls.link, controls.secondary or controls.primary.
  className?: string
}

/**
 * A button that points at a feature that is not connected yet. The tooltip sits on the wrapper, because a disabled
 * button does not show its own title in Chrome or Firefox.
 */
export function FeatureAction({ label, reason, className }: FeatureActionProps) {
  return (
    <span className={styles.wrapper} title={reason}>
      <button type="button" className={className} disabled>
        {label}
      </button>
    </span>
  )
}
