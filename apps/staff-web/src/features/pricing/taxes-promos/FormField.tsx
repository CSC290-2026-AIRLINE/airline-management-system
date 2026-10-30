import type { ReactNode } from 'react'
import { Label } from '@staff-web/components/ui/label'

interface FormFieldProps {
  htmlFor: string
  label: ReactNode
  error?: string
  children: ReactNode
}

// The error's id is `${htmlFor}-error`, for the field's aria-describedby.
export function FormField({ htmlFor, label, error, children }: FormFieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="block text-[11px] leading-[normal] font-semibold text-(--pr-muted) uppercase">
        {label}
      </Label>
      {children}
      {error && (
        <span id={`${htmlFor}-error`} className="text-xs text-(--pr-danger)">
          {error}
        </span>
      )}
    </div>
  )
}
