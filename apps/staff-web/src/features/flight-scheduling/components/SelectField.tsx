import type { SelectHTMLAttributes } from 'react'

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  invalid?: boolean
  half?: boolean // shares a row with the next field on a phone
}

// Labelled dropdown that looks like FormField.
export function SelectField({ label, invalid = false, half = false, children, ...select }: SelectFieldProps) {
  return (
    <label className={`fs-field${invalid ? ' fs-invalid' : ''}${half ? ' fs-half' : ''}`}>
      {label}
      <select className="fs-input fs-select" aria-invalid={invalid} {...select}>
        {children}
      </select>
    </label>
  )
}
