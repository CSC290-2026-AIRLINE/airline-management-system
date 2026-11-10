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
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap items-center gap-2">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium transition-colors',
              'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none',
              active
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <span>{option.label}</span>
            <span className={cn('text-xs tabular-nums', active ? 'text-white/70' : 'text-muted-foreground')}>{option.count}</span>
          </button>
        )
      })}
    </div>
  )
}
