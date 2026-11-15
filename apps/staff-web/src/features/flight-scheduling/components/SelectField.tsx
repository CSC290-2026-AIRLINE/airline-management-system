import type { SelectHTMLAttributes } from 'react'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect } from '@staff-web/components/ui/native-select'

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label: string
  invalid?: boolean
  half?: boolean // kept for existing callers; the layout no longer needs it
}

// Labelled shadcn NativeSelect.
export function SelectField({ label, invalid = false, half, children, ...select }: SelectFieldProps) {
  void half
  return (
    <Label className="flex flex-col items-start gap-1.5">
      {label}
      <NativeSelect className="w-full h-9" aria-invalid={invalid} {...select}>
        {children}
      </NativeSelect>
    </Label>
  )
}
