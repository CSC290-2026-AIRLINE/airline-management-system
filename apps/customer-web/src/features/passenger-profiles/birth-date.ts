/** Validate partial date input against the supplied calendar day. The browser date is temporary until a shared clock exists. */
export function birthDateProblem(day: string, month: string, year: string, today: Date): string {
  if (day.length === 2 && (Number(day) < 1 || Number(day) > 31)) return 'Day must be between 01 and 31.'
  if (month.length === 2 && (Number(month) < 1 || Number(month) > 12)) return 'Month must be between 01 and 12.'
  if (year.length === 4 && (Number(year) < 1900 || Number(year) > today.getUTCFullYear()))
    return 'Year must be between 1900 and ' + today.getUTCFullYear() + '.'
  if (month.length === 2 && Number(day) > new Date(Date.UTC(year.length === 4 ? Number(year) : 2000, Number(month), 0)).getUTCDate())
    return 'This month does not have that day. Check the day, month and year.'
  if (day.length === 2 && month.length === 2 && year.length === 4) {
    const date = Date.UTC(Number(year), Number(month) - 1, Number(day))
    const latestDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    if (date > latestDay) return 'Date of birth cannot be in the future.'
  }
  return ''
}

/** Complete form validation uses the same rules as BirthDateInput, including on submit. */
export function parseBirthDateInput(value: string, today: Date): { dateOfBirth: string; error: string } {
  const match = /^(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})$/.exec(value.trim())
  if (!match) return { dateOfBirth: '', error: 'Enter the date of birth as DD / MM / YYYY.' }
  const [, day, month, year] = match
  const error = birthDateProblem(day, month, year, today)
  return { dateOfBirth: error ? '' : year + '-' + month + '-' + day, error }
}
