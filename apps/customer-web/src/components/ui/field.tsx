import type { ComponentProps, ReactNode } from 'react'
import { CircleAlertIcon } from 'lucide-react'
import { cn } from '@customer-web/lib/utils'
import { Label } from './label'

/*
 * The one field (redesign board 6): a label, a control, helper text and an error, laid out the same way in every form.
 * Labels are real label elements tied to the control. Required fields carry no mark; optional ones end their label with
 * "(optional)". There are no asterisks anywhere.
 */

interface FieldProps {
  /** The id of the control, so the label can point at it and the messages can be named after it. */
  id: string
  /** The text above the control. */
  label: ReactNode
  /** Marks the field optional: "(optional)" in the muted colour at regular weight. Required fields are not marked. */
  optional?: boolean
  /** The message under the control, when the value is wrong. It replaces the hint. */
  error?: string
  /** A line of help under the control, when there is no error. */
  hint?: ReactNode
  /** Extra class names for the field, for the pages that lay it out themselves. */
  className?: string
  children: ReactNode
}

/**
 * The message sits outside the label, so it never becomes part of the name a screen reader reads for the field, and the
 * control points at it with `aria-describedby` (`${id}-error` or `${id}-hint`). The label carries the id `${id}-label` as
 * well, because a control that is not a text box (the calendar trigger, the dropdown) cannot be named by `htmlFor` alone
 * and needs `aria-labelledby`.
 */
export function Field({ id, label, optional, error, hint, className, children }: FieldProps) {
  return (
    <div className={cn('grid min-w-0 content-start gap-1.5 text-left', className)}>
      <Label id={`${id}-label`} htmlFor={id}>
        <span>
          {label}
          {optional ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
        </span>
      </Label>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-sm leading-5 font-medium text-destructive" id={`${id}-error`}>
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="text-sm leading-5 text-muted-foreground" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** Fields stacked in a form: 20 px between fields. Put a FieldSet around a group of them to get 32 px between groups. */
export function FieldGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="field-group" className={cn('grid gap-5', className)} {...props} />
}

/** A named group of fields, such as one passenger. A FieldSet inside a FieldGroup sits 32 px from its neighbours. */
export function FieldSet({ className, ...props }: ComponentProps<'fieldset'>) {
  return <fieldset data-slot="field-set" className={cn('grid min-w-0 gap-5 border-0 p-0', className)} {...props} />
}

export function FieldLegend({ className, ...props }: ComponentProps<'legend'>) {
  return <legend data-slot="field-legend" className={cn('mb-3 text-subheading text-foreground', className)} {...props} />
}
