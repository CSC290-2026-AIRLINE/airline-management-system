// Row of buttons where one is on, like Delay / Cancel flight. `labels` renames an option when its value is not what the button says.
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
    <div className="fs-seg">
      {options.map((o) => (
        <button key={o} type="button" className={value === o ? 'fs-seg-on' : undefined} onClick={() => onChange(o)}>
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  )
}
