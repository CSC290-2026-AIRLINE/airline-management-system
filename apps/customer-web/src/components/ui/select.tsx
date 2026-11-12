import type { ComponentProps, ReactNode } from 'react'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { Select as SelectPrimitive } from 'radix-ui'
import './select.css'

/**
 * The customer-web dropdown. It is the same Radix Select the staff console uses (see
 * `apps/staff-web/src/components/ui/select.tsx`), so both apps look and behave the same: a chevron on the trigger, a
 * popover list, a tick on the chosen option. The trigger keeps the customer field metrics (40px high, 15px text) so it
 * sits with the inputs next to it.
 *
 * Radix has no empty-string value, so "nothing selected" travels as this marker. Call sites still use `''` and get `''`
 * back from `onValueChange`.
 */
const EMPTY_VALUE = '__empty__'

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

interface SelectProps {
  /** The chosen value. `''` means nothing is selected. */
  value: string
  /** Called with the chosen value. `''` means nothing is selected. */
  onValueChange: (value: string) => void
  disabled?: boolean
  /** Marks the field as required for assistive technology. The browser check is done in the form's own validation. */
  required?: boolean
  children: ReactNode
}

function Select({ value, onValueChange, disabled, required, children }: SelectProps) {
  return (
    <SelectPrimitive.Root
      value={value === '' ? EMPTY_VALUE : value}
      onValueChange={(next) => onValueChange(next === EMPTY_VALUE ? '' : next)}
      disabled={disabled}
      required={required}
    >
      {children}
    </SelectPrimitive.Root>
  )
}

function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger data-slot="select-trigger" className={classNames('cw-select-trigger', className)} {...props}>
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="cw-select-chevron" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectValue({ className, ...props }: ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" className={classNames('cw-select-value', className)} {...props} />
}

function SelectContent({
  className,
  children,
  position = 'popper',
  align = 'start',
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={classNames('cw-select-content', className)}
        position={position}
        align={align}
        {...props}
      >
        <SelectPrimitive.Viewport className="cw-select-viewport">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({ className, children, value, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={classNames('cw-select-item', className)}
      value={value === '' ? EMPTY_VALUE : value}
      {...props}
    >
      <span className="cw-select-indicator" aria-hidden="true">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="cw-select-check" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
