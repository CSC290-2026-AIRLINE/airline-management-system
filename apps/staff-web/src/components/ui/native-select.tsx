import * as React from 'react'
import { cn } from '@staff-web/lib/utils'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'

// Despite the name this renders the shadcn Select (a styled dropdown, not the OS popup). It keeps the API of a native <select>: <option>
// children, a string `value` and `onChange(event)` with `event.target.value`, so existing forms did not have to change.
// Limits of that compatibility: no `multiple`, and `onChange` receives a minimal event object (target/currentTarget with `value` and `name`),
// not a real DOM event.

type NativeSelectProps = Omit<React.ComponentProps<'select'>, 'size' | 'multiple' | 'children'> & {
  size?: 'sm' | 'default'
  children?: React.ReactNode
}

type Entry = { value: string; label: React.ReactNode; disabled?: boolean }
type Group = { label: React.ReactNode | null; entries: Entry[] }

// Radix does not accept '' as an item value (it is reserved for "no selection"), so an empty <option value=""> is sent as this instead.
const EMPTY = '__native_select_empty__'

function NativeSelectOption({ className, ...props }: React.ComponentProps<'option'>) {
  return <option data-slot="native-select-option" className={className} {...props} />
}

function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<'optgroup'>) {
  return <optgroup data-slot="native-select-optgroup" className={className} {...props} />
}

function textOf(node: React.ReactNode): string {
  return React.Children.toArray(node)
    .map((part) => (typeof part === 'string' || typeof part === 'number' ? String(part) : ''))
    .join('')
}

function isOption(type: unknown) {
  return type === 'option' || type === NativeSelectOption
}

function isOptGroup(type: unknown) {
  return type === 'optgroup' || type === NativeSelectOptGroup
}

function collect(children: React.ReactNode, groups: Group[]) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const props = child.props as { children?: React.ReactNode; value?: string | number; label?: string; disabled?: boolean }

    if (child.type === React.Fragment) {
      collect(props.children, groups)
    } else if (isOption(child.type)) {
      const entry: Entry = {
        value: props.value !== undefined ? String(props.value) : textOf(props.children),
        label: props.children,
        disabled: props.disabled,
      }
      const last = groups[groups.length - 1]
      if (last && last.label === null) last.entries.push(entry)
      else groups.push({ label: null, entries: [entry] })
    } else if (isOptGroup(child.type)) {
      const group: Group = { label: props.label ?? null, entries: [] }
      // An optgroup holds options only, so a flat pass over its children is enough.
      const inner: Group[] = []
      collect(props.children, inner)
      group.entries = inner.flatMap((item) => item.entries)
      groups.push(group)
    }
  })
}

function NativeSelect({
  className,
  size = 'default',
  children,
  value,
  defaultValue,
  onChange,
  onBlur,
  disabled,
  required,
  name,
  id,
  ...rest
}: NativeSelectProps) {
  const groups: Group[] = []
  collect(children, groups)
  const hasEmptyOption = groups.some((group) => group.entries.some((entry) => entry.value === ''))
  const toRadix = (raw: string) => (raw === '' && hasEmptyOption ? EMPTY : raw)

  const handleChange = (next: string) => {
    const nextValue = next === EMPTY ? '' : next
    const target = { value: nextValue, name: name ?? '' }
    onChange?.({ target, currentTarget: target, type: 'change' } as unknown as React.ChangeEvent<HTMLSelectElement>)
  }

  const controlled =
    value !== undefined
      ? { value: toRadix(String(value)) }
      : { defaultValue: defaultValue !== undefined ? toRadix(String(defaultValue)) : undefined }

  return (
    <div
      className={cn('group/native-select relative w-fit', size === 'sm' ? 'h-7' : 'h-8', className)}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <Select {...controlled} onValueChange={handleChange} disabled={disabled} required={required} name={name}>
        <SelectTrigger
          id={id}
          size={size}
          onBlur={onBlur as React.FocusEventHandler<HTMLButtonElement> | undefined}
          aria-invalid={rest['aria-invalid']}
          aria-label={rest['aria-label']}
          aria-labelledby={rest['aria-labelledby']}
          aria-describedby={rest['aria-describedby']}
          className="h-full w-full min-w-0 data-[size=default]:h-full data-[size=sm]:h-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groups.map((group, index) => {
            const items = group.entries.map((entry) => (
              <SelectItem key={entry.value} value={toRadix(entry.value)} disabled={entry.disabled}>
                {entry.label}
              </SelectItem>
            ))
            return group.label === null ? (
              <React.Fragment key={index}>{items}</React.Fragment>
            ) : (
              <SelectGroup key={index}>
                <SelectLabel>{group.label}</SelectLabel>
                {items}
              </SelectGroup>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
