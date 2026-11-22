import type { ReactNode } from 'react'
import { cn } from '@customer-web/lib/utils'
import { Label } from './label'

interface FieldProps {
  /** The id of the control, so the label can point at it and the message can be named after it. */
  id: string
  /** The text above the control. */
  label: ReactNode
  /** The message under the control, when the value is wrong. */
  error?: string
  /** A line of help under the control, when there is no error. */
  hint?: ReactNode
  /** Extra class names for the field, for the pages that lay it out themselves. */
  className?: string
  children: ReactNode
}

/**
 * A label, a control and the message under it. Every form in the app uses this, so a field always looks the same and
 * always says what is wrong with it in the same way.
 *
 * The message sits outside the label, so it never becomes part of the name a screen reader reads for the field, and the
 * control points at it with `aria-describedby`. The label carries the id `${id}-label` as well, because a control that is
 * not a text box (the calendar trigger, the dropdown) cannot be named by `htmlFor` alone and needs `aria-labelledby`.
 */
export function Field({ id, label, error, hint, className, children }: FieldProps) {
  return (
    <div className={cn('grid min-w-0 content-start gap-1.5 text-left', className)}>
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
