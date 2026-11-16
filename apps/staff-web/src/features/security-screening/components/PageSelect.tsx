import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'

/** Page picker for paginated lists. `value` is the zero-based page index and `count` how many pages have been reached. */
export function PageSelect({
  value,
  count,
  onChange,
  disabled = false,
  label,
}: {
  value: number
  count: number
  onChange: (index: number) => void
  disabled?: boolean
  label: string
}) {
  return (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))} disabled={disabled}>
      <SelectTrigger aria-label={label} className="min-w-28">
        <SelectValue>Page {value + 1}</SelectValue>
      </SelectTrigger>
      <SelectContent side="top">
        {Array.from({ length: Math.max(count, value + 1) }, (_, index) => (
          <SelectItem key={index} value={String(index)}>
            Page {index + 1}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
