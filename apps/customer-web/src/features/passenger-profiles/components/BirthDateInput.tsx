import type { ChangeEvent } from 'react'
import { birthDateProblem } from '../birth-date'

type Props = {
  value: string
  onChange: (value: string) => void
  onError?: (message: string) => void
  describedBy?: string
  required?: boolean
  readOnly?: boolean
  disabled?: boolean
  today?: Date
}

/**
 * Date of birth as typed digits: `01021990` becomes `01 / 02 / 1990`. Shared by the first sign-in page and the
 * saved-passenger dialog so both formats and validate identically. A rejected digit never reaches `onChange`,
 * so the field only ever holds a value the rest of the form can trust.
 */
export default function BirthDateInput({
  value,
  onChange,
  onError,
  describedBy,
  required = true,
  readOnly = false,
  disabled = false,
  today = new Date(),
}: Props) {
  function handle(event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 8)
    const day = digits.slice(0, 2)
    const month = digits.slice(2, 4)
    const year = digits.slice(4)
    const message = birthDateProblem(day, month, year, today)
    if (message) {
      onError?.(message)
      return
    }
    onChange([day, month, year].filter(Boolean).join(' / '))
    onError?.('')
  }
  return (
    <input
      placeholder="DD / MM / YYYY"
      required={required}
      readOnly={readOnly}
      disabled={disabled}
      inputMode="numeric"
      autoComplete="bday"
      maxLength={14}
      value={value}
      aria-describedby={describedBy}
      onChange={handle}
    />
  )
}
