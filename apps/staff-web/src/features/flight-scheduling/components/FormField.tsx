import type { InputHTMLAttributes } from 'react'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { cn } from '@staff-web/lib/utils'

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  invalid?: boolean
  half?: boolean // kept for existing callers; the layout no longer needs it
  suffix?: string // a unit shown inside the field, such as "min"
  error?: string // a message under the field; it also marks the field invalid
}

// Labelled shadcn Input; `invalid` or `error` sets aria-invalid, which shadcn draws as the red outline.
export function FormField({ label, invalid = false, half, suffix, error, className, ...input }: FormFieldProps) {
  void half
  const bad = invalid || Boolean(error)
  return (
    <Label className="flex flex-col items-start gap-1.5">
      {label}
      <span className="relative w-full">
        <Input aria-invalid={bad} className={cn(suffix && 'pr-12', className)} {...input} />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{suffix}</span>
        )}
      </span>
      {error && (
        <span role="alert" className="text-xs font-normal text-destructive">
          {error}
        </span>
      )}
    </Label>
  )
}
