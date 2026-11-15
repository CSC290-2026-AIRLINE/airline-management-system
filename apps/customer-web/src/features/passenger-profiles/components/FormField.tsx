import { useId, type ReactNode } from 'react'
import { Field, FieldDescription, FieldLabel } from '@customer-web/components/ui/field'

/** A labelled control: wires the label's `htmlFor` and the optional hint's id to the control rendered by `children`. */
export default function FormField({
  label,
  hint,
  className,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  className?: string
  children: (props: { id: string; hintId: string | undefined }) => ReactNode
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children({ id, hintId })}
      {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
    </Field>
  )
}
