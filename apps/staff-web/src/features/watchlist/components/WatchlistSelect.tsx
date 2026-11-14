import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'

interface SelectOption {
  value: string
  label: string
}

/** A labelled shadcn `Select`. An empty `value` shows `placeholder`, so options must not use an empty string themselves. */
export function WatchlistSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  className,
}: {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
