import { ToggleGroup, ToggleGroupItem } from '@customer-web/components/ui/toggle-group'

export interface FilterChipOption<T extends string> {
  value: T
  label: string
  /** How many items the filter would show. */
  count?: number
}

interface FilterChipsProps<T extends string> {
  options: FilterChipOption<T>[]
  /** The filter that is on. */
  value: T
  onChange: (value: T) => void
  /** What the group of filters controls, for screen readers. */
  ariaLabel: string
}

/** The filters above a list: shadcn's `ToggleGroup`, one on at a time, with the count beside each label. */
export function FilterChips<T extends string>({ options, value, onChange, ariaLabel }: FilterChipsProps<T>) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value}
      // Picking the filter that is already on would clear it; one filter is always on.
      onValueChange={(next) => next && onChange(next as T)}
      aria-label={ariaLabel}
      className="flex-wrap"
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
          {option.count !== undefined && <span className="text-muted-foreground tabular-nums">{option.count}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
