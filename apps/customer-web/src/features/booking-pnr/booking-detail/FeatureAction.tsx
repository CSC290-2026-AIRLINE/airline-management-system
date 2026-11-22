import type { ComponentProps } from 'react'
import { Button } from '@customer-web/components/ui/button'

interface FeatureActionProps {
  label: string
  // Why the action cannot be used yet. It is the tooltip of the action.
  reason: string
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
}

/**
 * A button that points at a feature that is not connected yet. The tooltip sits on the wrapper, because a disabled
 * button does not show its own title in Chrome or Firefox.
 */
export function FeatureAction({ label, reason, variant = 'default', size = 'default' }: FeatureActionProps) {
  return (
    <span className="inline-flex cursor-not-allowed" title={reason}>
      <Button type="button" variant={variant} size={size} className={variant === 'link' ? 'h-auto p-0' : undefined} disabled>
        {label}
      </Button>
    </span>
  )
}
