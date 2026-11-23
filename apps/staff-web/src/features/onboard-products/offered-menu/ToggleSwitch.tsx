// On/off toggle for boolean settings on the Route detail page (pre-order, premium meals, snacks, duty-free).

import { Switch } from '@staff-web/components/ui/switch'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel?: string
  disabled?: boolean
}

export function ToggleSwitch({ checked, onChange, ariaLabel, disabled }: Props) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium">
      <Switch checked={checked} onCheckedChange={onChange} aria-label={ariaLabel} disabled={disabled} />
      <span className="min-w-6 text-muted-foreground" aria-hidden="true">
        {checked ? 'On' : 'Off'}
      </span>
    </span>
  )
}
