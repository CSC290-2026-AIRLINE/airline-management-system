import { ToggleGroup, ToggleGroupItem } from '@staff-web/components/ui/toggle-group'

// Row of options where one is on, like Delay / Cancel flight, on the shadcn ToggleGroup. `labels` renames an option when its value is not what the button says.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  labels?: Partial<Record<T, string>>
}) {
  return (
    <ToggleGroup type="single" variant="outline" value={value} onValueChange={(v) => v && onChange(v as T)}>
      {options.map((o) => (
        <ToggleGroupItem key={o} value={o}>
          {labels?.[o] ?? o}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
