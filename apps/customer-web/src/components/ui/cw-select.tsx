import type { ComponentProps, ReactNode } from 'react'
import { Select as SelectPrimitive } from 'radix-ui'
import { cn } from '@customer-web/lib/utils'
import { SelectItem as ShadSelectItem, SelectTrigger as ShadSelectTrigger, SelectValue as ShadSelectValue } from './select'

/**
 * The booking forms' dropdown: the app's shadcn Select, with two additions. "Nothing selected" travels as `''` (Radix
 * has no empty-string value, so it maps to a marker), and the popup can be rendered into a container, so a dropdown
 * inside a dialog stays in the dialog. The trigger is full width, like the inputs next to it.
 */
const EMPTY_VALUE = '__empty__'

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

function SelectTrigger({ className, ...props }: ComponentProps<typeof ShadSelectTrigger>) {
  return <ShadSelectTrigger className={cn('w-full bg-background data-[size=default]:h-9', className)} {...props} />
}

const SelectValue = ShadSelectValue

function SelectContent({
  className,
  children,
  position = 'popper',
  align = 'start',
  container,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content> & { container?: HTMLElement | null }) {
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          'relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectPrimitive.Viewport className="w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1 p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({ value, ...props }: ComponentProps<typeof ShadSelectItem>) {
  return <ShadSelectItem value={value === '' ? EMPTY_VALUE : value} {...props} />
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
