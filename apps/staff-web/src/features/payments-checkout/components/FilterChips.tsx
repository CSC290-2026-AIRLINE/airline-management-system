import { cn } from '@staff-web/lib/utils'

export interface FilterChipOption<T extends string> {
  value: T
  label: string
  /** How many rows the chip would show. The frames put the count on the chip itself. */
  count: number
}

interface FilterChipsProps<T extends string> {
  options: FilterChipOption<T>[]
  /** The chip that is on. */
  value: T
  onChange: (value: T) => void
  /** What the group of chips controls, for screen readers. */
  ariaLabel: string
}

/**
 * The pill filters the frames put above a list: the label, and how many rows it would show.
 *
 * The count is part of the chip rather than a separate line, because the frames' staff need the size of each bucket
 * before they click it.
 */
export function FilterChips<T extends string>({ options, value, onChange, ariaLabel }: FilterChipsProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap items-center gap-3">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
              'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
              active ? 'border-navy bg-blue-50 text-navy' : 'border-border bg-card text-foreground hover:border-navy/40',
            )}
          >
            <span>{option.label}</span>
            <span className={cn('tabular-nums', active ? 'text-navy/70' : 'text-muted-foreground')}>· {option.count}</span>
          </button>
        )
      })}
    </div>
  )
}
