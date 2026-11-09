import type { InputHTMLAttributes } from 'react'

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  invalid?: boolean
  half?: boolean // shares a row with the next field on a phone
}

// Labelled input; `invalid` gives the red outline and aria-invalid.
export function FormField({ label, invalid = false, half = false, ...input }: FormFieldProps) {
  return (
    <label className={`fs-field${invalid ? ' fs-invalid' : ''}${half ? ' fs-half' : ''}`}>
      {label}
      <input className="fs-input" aria-invalid={invalid} {...input} />
    </label>
  )
}
