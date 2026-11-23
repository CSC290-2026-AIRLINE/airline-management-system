// Segmented control: a row of buttons where exactly one is selected. Used for the multi-option choices on the Route detail
// and Network default pages (meal service, meal selection, order window, included meals, on-board buffer).

import type { ReactNode } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@staff-web/components/ui/toggle-group'

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
    <ToggleGroup
      type="single"
      variant="outline"
      value={String(value)}
      onValueChange={(next) => {
        // A single-select group reports '' when the selected item is pressed again; keep the current choice.
        const option = options.find((o) => String(o.value) === next)
        if (option) onChange(option.value)
      }}
      aria-label={ariaLabel}
      disabled={disabled}
      className="w-full"
    >
      {options.map((opt) => (
        <ToggleGroupItem
          key={String(opt.value)}
          value={String(opt.value)}
          className="h-auto flex-auto px-2.5 py-2 text-center leading-tight whitespace-normal data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
