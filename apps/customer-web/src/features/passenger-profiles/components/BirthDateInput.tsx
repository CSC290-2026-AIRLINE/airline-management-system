import type { ChangeEvent } from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
  onError?: (message: string) => void
  describedBy?: string
  required?: boolean
  readOnly?: boolean
  disabled?: boolean
}

/**
 * Inline check of a partially typed date: empty means the part typed so far is still fine, so only a real
 * mistake complains. Days-in-month is checked against the typed year, or a leap year while the year is incomplete.
 */
function problem(day: string, month: string, year: string) {
  const now = new Date()
  if (day.length === 2 && (Number(day) < 1 || Number(day) > 31)) return 'Day must be between 01 and 31.'
  if (month.length === 2 && (Number(month) < 1 || Number(month) > 12)) return 'Month must be between 01 and 12.'
  if (year.length === 4 && (Number(year) < 1900 || Number(year) > now.getFullYear()))
    return `Year must be between 1900 and ${now.getFullYear()}.`
  if (month.length === 2 && Number(day) > new Date(Date.UTC(year.length === 4 ? Number(year) : 2000, Number(month), 0)).getUTCDate())
    return 'This month does not have that day. Check the day, month and year.'
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (year.length === 4 && `${year}-${month}-${day}` > today) return 'Date of birth cannot be in the future.'
  return ''
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
}: Props) {
  function handle(event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 8)
    const day = digits.slice(0, 2)
    const month = digits.slice(2, 4)
    const year = digits.slice(4)
    const message = problem(day, month, year)
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
