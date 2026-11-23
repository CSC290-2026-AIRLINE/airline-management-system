/** The API error message, or a fallback when something else goes wrong. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

/** A form field that is empty or not a number. */
export function numberOrNull(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
